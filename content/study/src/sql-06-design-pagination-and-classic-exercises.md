# SQL Design, Pagination and Classic Exercises: senior interview guide

**Who this is for:** a senior .NET engineer (9+ years) who can model a schema and page a grid in EF Core, but is now asked to justify a denormalisation, explain why `OFFSET` gets slower on page 5,000, or solve "nth highest salary" and "gaps and islands" on a whiteboard in ten minutes. Main platform is SQL Server 2019 to 2022; differences for ANSI SQL, PostgreSQL and Snowflake are noted where they change an answer.

## What interviewers expect at senior level

- You normalise by default to third normal form and can name the specific read pattern that justifies denormalising.
- You pick keys and data types deliberately (surrogate vs natural, `int` vs `bigint` vs GUID, `decimal` vs `float`, `datetime2` vs `datetime`).
- You use constraints as the last line of defence, not just application code.
- You can explain keyset pagination, its trade-offs, and when `OFFSET` is acceptable.
- You know soft delete, temporal tables and partitioning well enough to say when not to use them.
- You solve classic problems with window functions and explain edge cases such as ties and `NULL`.

## Normalisation and denormalisation

| Form | Rule in one line | Violation example |
| --- | --- | --- |
| 1NF | Atomic values, no repeating groups | `Phones = '555-1, 555-2'` in one column |
| 2NF | No partial dependency on part of a composite key | `OrderLine(OrderId, ProductId, ProductName)` |
| 3NF | No non-key column depends on another non-key column | `Customer(Id, ZipCode, City)` where Zip determines City |
| BCNF | Every determinant is a candidate key | Rare edge cases with overlapping keys |

Normalised design removes update anomalies and keeps each fact in one place. Denormalise when a measured read path pays for joins too often, and accept the cost: duplicated data that must be kept in sync by triggers, jobs or application code. Legitimate forms: a stored `OrderTotal` maintained transactionally; a reporting table or indexed view; a snapshot of the product name and price on an order line (this is not really denormalisation, it is history, because the price at purchase time is a different fact from today's price). In a warehouse, star schemas are deliberately denormalised. Answer pattern: "normalise first, measure, denormalise one place, and document who owns the sync."

## Keys

| Choice | Pros | Cons |
| --- | --- | --- |
| Surrogate `int`/`bigint` identity | Narrow, ever-increasing, stable | Meaningless; gaps after rollbacks; not unique across systems |
| Natural key (email, ISO country code) | Meaningful, enforces real uniqueness | Can change, can be wide, sometimes reused |
| GUID (`uniqueidentifier`) | Generate anywhere, merge-friendly | 16 bytes in every index; random values fragment a clustered key |
| `SEQUENCE` object | Shared across tables, fetch ahead in app | Slightly more plumbing than identity |

Practical guidance: use a surrogate key for joins and a unique constraint on the natural key. If you need client-generated GUIDs, use `NEWSEQUENTIALID()` as a default or sequential GUID generators (EF Core's default value generator for SQL Server GUID keys is sequential-like). Identity values are not guaranteed gapless, and `IDENTITY_CACHE` behaviour can skip values after a crash.

## Constraints

```sql
CREATE TABLE Product (
  ProductId int IDENTITY PRIMARY KEY,
  Sku varchar(30) NOT NULL CONSTRAINT UQ_Product_Sku UNIQUE,
  Price decimal(10,2) NOT NULL CONSTRAINT CK_Product_Price CHECK (Price >= 0),
  CategoryId int NOT NULL CONSTRAINT FK_Product_Cat REFERENCES Category(CategoryId),
  Status char(1) NOT NULL CONSTRAINT DF_Product_Status DEFAULT 'A');
```

- `PRIMARY KEY`: unique and not null; one per table.
- `UNIQUE`: allows one `NULL` in SQL Server (the standard allows many; use a filtered unique index `WHERE Col IS NOT NULL` for the standard behaviour).
- `CHECK`: a row whose expression evaluates to `UNKNOWN` passes, so `CHECK (Price > 0)` lets `NULL` through unless the column is `NOT NULL`.
- `FOREIGN KEY`: does not create an index on the child column. Index foreign key columns yourself, or deletes on the parent scan the child table. `ON DELETE CASCADE` is convenient but can cause multiple cascade paths errors and surprising mass deletes.
- Constraints created `WITH NOCHECK` are marked untrusted and the optimiser ignores them; check `is_not_trusted` in `sys.check_constraints` and `sys.foreign_keys`.

## Choosing data types

| Need | Use | Avoid |
| --- | --- | --- |
| Money, quantities | `decimal(p,s)` | `float`, `real` (binary rounding), `money` for multiplication-heavy maths |
| Timestamp | `datetime2(n)`, `datetimeoffset` when offsets matter | `datetime` (about 3 ms rounding, narrower date range), storing local time without a zone |
| Date only | `date` | `datetime` with a zero time part |
| Text, mostly ASCII | `varchar(n)` | `nvarchar` everywhere (double the bytes) |
| Unicode text | `nvarchar(n)` | `varchar` with a non-UTF-8 collation |
| Flag | `bit` | `char(1)` Y/N unless a third state is real |
| Large text | `varchar(max)`, `nvarchar(max)` | `text`, `ntext` (deprecated) |

Consistency matters as much as the choice: joining `varchar` to `nvarchar` columns causes implicit conversions. A `rowversion` column is the right optimistic-concurrency token, which EF Core maps with `[Timestamp]`. SQL Server 2019 and later support UTF-8 collations (`_UTF8`) for `varchar`, which can shrink storage for mostly Latin text.

## Pagination: OFFSET vs keyset

```sql
-- OFFSET/FETCH: simple, supports jumping to page N
SELECT OrderId, OrderDate FROM Ord
ORDER BY OrderDate DESC, OrderId DESC
OFFSET 40 ROWS FETCH NEXT 20 ROWS ONLY;

-- Keyset (seek): continue after the last row seen
SELECT TOP (20) OrderId, OrderDate FROM Ord
WHERE OrderDate < @lastDate
   OR (OrderDate = @lastDate AND OrderId < @lastId)
ORDER BY OrderDate DESC, OrderId DESC;
```

| | OFFSET/FETCH | Keyset |
| --- | --- | --- |
| Cost for page N | Reads and discards N times page size rows | Seeks straight to the start, near-constant |
| Stable under inserts | No; rows shift, causing duplicates or skips | Yes, anchored on a key |
| Jump to arbitrary page | Yes | No (next, previous only) |
| Needs unique sort | Recommended | Required (add the key as tiebreaker) |
| Total count | Separate `COUNT(*)` | Separate, often avoided |

Support keyset with an index matching the sort, such as `(OrderDate DESC, OrderId DESC)`. Always include a unique tiebreaker; `ORDER BY` without one makes paging non-deterministic. For the row-value form, SQL Server has no `(a, b) < (@x, @y)` syntax, so the expanded `OR` form above is used (PostgreSQL does support row comparison). Use `OFFSET` for small admin grids; use keyset for infinite scroll, APIs and big tables. Return an opaque cursor token to API clients.

## Soft delete

Add `IsDeleted bit` or `DeletedAt datetime2 NULL`. Costs: every query must filter it (EF Core global query filters help; raw SQL and reports forget), unique constraints must ignore deleted rows (filtered unique index `WHERE DeletedAt IS NULL`), tables grow, and privacy laws may still require true deletion. Alternatives: move rows to an archive table, or use temporal tables for history. Decide per table; it is not a free default.

## Temporal tables

System-versioned temporal tables (SQL Server 2016 and later) keep every old row version in a history table automatically.

```sql
CREATE TABLE Emp2 (
  EmpId int PRIMARY KEY, Salary int NOT NULL,
  ValidFrom datetime2 GENERATED ALWAYS AS ROW START HIDDEN,
  ValidTo   datetime2 GENERATED ALWAYS AS ROW END HIDDEN,
  PERIOD FOR SYSTEM_TIME (ValidFrom, ValidTo))
WITH (SYSTEM_VERSIONING = ON (HISTORY_TABLE = dbo.Emp2_History));

SELECT * FROM Emp2 FOR SYSTEM_TIME AS OF '2026-01-01T00:00:00';
```

Good for audit, point-in-time queries and undoing mistakes. Notes: times are UTC; `UPDATE` and `DELETE` both write history; history grows, so set `HISTORY_RETENTION_PERIOD`; you cannot truncate the table while versioning is on; `INSTEAD OF` triggers are not allowed. It records what changed, not who changed it, so you may still need an audit column.

## Partitioning

Table partitioning splits one table into ranges by a partition function over a column, mapped to filegroups by a scheme. Since SQL Server 2016 SP1 it is available in all editions.

- Real benefits: sliding-window loads and archival with `SWITCH` (metadata-only, near instant), partition elimination for queries filtering on the partition column, per-partition maintenance.
- Not a general speed-up: queries not filtering on the partition key can be slower, and a unique index must include the partition column.
- Align indexes with the table, use `RANGE RIGHT` for date boundaries (boundary value starts a new partition), and pre-create future partitions.
- Often an ordinary index is the better answer. Partition when data volume or lifecycle management demands it. Snowflake does this automatically with micro-partitions.

## Classic exercises

Sample tables for the exercises:

```sql
-- Emp(EmpId, Name, Dept, Salary): (1,'A','Eng',100),(2,'B','Eng',150),(3,'C','Eng',150),
--   (4,'D','Ops',90),(5,'E','Ops',120),(6,'F','HR',70)
-- Sales(Id, Yr, Amt): (1,2024,10),(2,2024,20),(3,2025,30)
-- Dept(DeptId, Name) lists departments; Emp also has ManagerId (nullable) for exercise 11.
```

### 1. Nth highest salary (distinct), here 2nd

```sql
SELECT MAX(Salary) AS Salary FROM (
  SELECT Salary, DENSE_RANK() OVER (ORDER BY Salary DESC) AS rk FROM Emp) x
WHERE rk = 2;
```

Result: 120. Distinct salaries are 150, 120, 100, 90, 70. `MAX` returns `NULL` when the rank does not exist, which is the usual expected behaviour. Without windows: `SELECT DISTINCT Salary FROM Emp ORDER BY Salary DESC OFFSET 1 ROWS FETCH NEXT 1 ROWS ONLY`.

### 2. Delete duplicate rows, keep one

```sql
WITH d AS (
  SELECT ROW_NUMBER() OVER (PARTITION BY Name, Dept ORDER BY EmpId) AS rn FROM Emp)
DELETE FROM d WHERE rn > 1;
```

Deleting through a CTE removes rows from the base table. Always run it as a `SELECT` first and put the keep rule in the `ORDER BY`.

### 3. Employees earning more than their department average

```sql
SELECT Name, Dept, Salary FROM (
  SELECT *, AVG(Salary * 1.0) OVER (PARTITION BY Dept) AS av FROM Emp) x
WHERE Salary > av;
```

Result: B and C (Eng average 133.33), E (Ops average 105). Multiplying by `1.0` avoids integer truncation.

### 4. Gaps and islands

Given `Ids` of 1,2,3,7,8,10, find consecutive runs. The row-number difference is constant within an island.

```sql
SELECT MIN(Id) AS StartId, MAX(Id) AS EndId FROM (
  SELECT Id, Id - ROW_NUMBER() OVER (ORDER BY Id) AS grp FROM Ids) x
GROUP BY grp ORDER BY StartId;
```

Result: 1-3, 7-8, 10-10. For gaps instead: use `LEAD(Id) OVER (ORDER BY Id)` and keep rows where `LEAD - Id > 1`; the missing range is `Id + 1` to `LEAD - 1`. For dates, subtract `ROW_NUMBER()` days with `DATEADD`. Duplicate values need `DENSE_RANK` or a prior `DISTINCT`.

### 5. Running total

```sql
SELECT Id, Yr, Amt,
       SUM(Amt) OVER (ORDER BY Yr, Id ROWS UNBOUNDED PRECEDING) AS Running
FROM Sales;
```

Result: 10, 30, 60. Specify `ROWS`; the default frame with `ORDER BY` is `RANGE UNBOUNDED PRECEDING`, which treats peers as one group and spills to disk much more slowly.

### 6. Top N per group (top 2 salaries per department)

```sql
SELECT Dept, Name, Salary FROM (
  SELECT *, ROW_NUMBER() OVER (PARTITION BY Dept ORDER BY Salary DESC, EmpId) AS rn FROM Emp) x
WHERE rn <= 2;
```

Choose `ROW_NUMBER` for exactly N rows, `RANK` or `DENSE_RANK` to include ties. `CROSS APPLY (SELECT TOP (2) ...)` is the alternative and is faster when there are few groups and a supporting index.

### 7. Pivot: salary total by department as columns

```sql
SELECT SUM(CASE WHEN Dept='Eng' THEN Salary END) AS Eng,
       SUM(CASE WHEN Dept='Ops' THEN Salary END) AS Ops,
       SUM(CASE WHEN Dept='HR'  THEN Salary END) AS HR
FROM Emp;
```

Result: 400, 210, 70. Conditional aggregation works everywhere and is portable. The `PIVOT` operator needs a fixed column list; for dynamic columns build the list with `STRING_AGG` and `QUOTENAME` and run it through `sp_executesql`.

### 8. Employees with no matching row (anti-join)

```sql
SELECT d.DeptId FROM Dept d
WHERE NOT EXISTS (SELECT 1 FROM Emp e WHERE e.Dept = d.Name);
```

Prefer `NOT EXISTS` over `NOT IN`: if the subquery returns any `NULL`, `NOT IN` returns no rows at all. `LEFT JOIN ... WHERE e.EmpId IS NULL` is equivalent.

### 9. Change from the previous row with LAG

```sql
SELECT Yr, Amt, Amt - LAG(Amt) OVER (ORDER BY Yr, Id) AS Delta FROM Sales;
```

Result: `NULL`, 10, 10. `LAG(col, 1, 0)` supplies a default for the first row. Year-over-year growth is the same pattern with `PARTITION BY` on the entity.

### 10. Find duplicates

```sql
SELECT Name, Dept, COUNT(*) AS Cnt FROM Emp GROUP BY Name, Dept HAVING COUNT(*) > 1;
```

`HAVING` filters groups after aggregation; `WHERE` filters rows before. Use this to find, then exercise 2 to delete.

### 11. Employees and their managers (self join)

```sql
SELECT e.Name AS Employee, m.Name AS Manager
FROM Emp e LEFT JOIN Emp m ON m.EmpId = e.ManagerId;
```

`LEFT JOIN` keeps the top-level employee with a `NULL` manager. For the whole chain use a recursive CTE (see the T-SQL programming guide).

### 12. Median salary

```sql
SELECT DISTINCT PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY Salary) OVER () AS Median FROM Emp;
```

Result: 110 for the six salaries 70, 90, 100, 120, 150, 150 (average of 100 and 120). In SQL Server `PERCENTILE_CONT` is only a window function, hence `OVER ()` and `DISTINCT`; PostgreSQL and Snowflake allow it as a plain aggregate. Without it: take the middle one or two rows using `ROW_NUMBER` and `COUNT(*) OVER ()`.

## Common traps and red flags

- `ROW_NUMBER` where ties matter (use `RANK` or `DENSE_RANK`), or `RANK` where exactly N rows are required.
- `NOT IN` against a nullable column.
- Window `SUM` without an explicit `ROWS` frame.
- Integer division in averages and percentages.
- Paging with `ORDER BY` on a non-unique column and no tiebreaker.
- Foreign keys with no supporting index.
- `float` for money; `datetime` for new designs.
- Soft delete with a plain unique constraint, blocking re-creation of a deleted value.
- Partitioning as a first answer to a slow query.

## 10 questions to practise

1. Explain 3NF with an example of a violation. (Non-key column depending on another non-key column.)
2. When is denormalisation justified? (A measured read cost, with a named owner for keeping data in sync.)
3. Surrogate vs natural key, and why both? (Surrogate for joins; unique constraint on the natural key.)
4. Why does `OFFSET 100000` get slow? (The engine reads and discards the skipped rows.)
5. Write keyset pagination on `(date, id)` descending. (Expanded `OR` predicate plus a matching index.)
6. Why index a foreign key column? (Parent deletes and joins scan the child otherwise.)
7. `DENSE_RANK`, `RANK` and `ROW_NUMBER` on tied values 150, 150, 120? (1,1,2; 1,1,3; 1,2,3.)
8. How do you find islands of consecutive values? (Value minus `ROW_NUMBER` is constant per island.)
9. What does a temporal table give you that soft delete does not? (Automatic full history and point-in-time queries.)
10. What does partitioning help, and what does it not? (`SWITCH`, elimination and maintenance; not general speed.)

## Skill-upgrade checklist

- [ ] Normalise a flat orders spreadsheet to 3NF, then denormalise one column and write down the sync strategy.
- [ ] Add a `CHECK` and a foreign key `WITH NOCHECK`, then find them in the `is_not_trusted` catalog view.
- [ ] Load a million rows and compare `OFFSET` page 1 against page 20,000 with `SET STATISTICS IO ON`; then implement keyset.
- [ ] Create a system-versioned table, update a row, and query it with `FOR SYSTEM_TIME AS OF`.
- [ ] Build a partitioned table and `SWITCH` one month out to a staging table.
- [ ] Solve all 12 exercises from a blank file, timed, without notes.
- [ ] Re-solve exercises 1, 4 and 6 in PostgreSQL or Snowflake and note the dialect differences.

## Read next (official)

- [Database design basics](https://learn.microsoft.com/office/troubleshoot/access/database-design-basics)
- [Primary and foreign key constraints](https://learn.microsoft.com/sql/relational-databases/tables/primary-and-foreign-key-constraints)
- [Unique constraints and check constraints](https://learn.microsoft.com/sql/relational-databases/tables/unique-constraints-and-check-constraints)
- [ORDER BY clause: OFFSET and FETCH](https://learn.microsoft.com/sql/t-sql/queries/select-order-by-clause-transact-sql)
- [Temporal tables](https://learn.microsoft.com/sql/relational-databases/tables/temporal-tables)
- [Partitioned tables and indexes](https://learn.microsoft.com/sql/relational-databases/partitions/partitioned-tables-and-indexes)
- [SELECT: OVER clause (window functions)](https://learn.microsoft.com/sql/t-sql/queries/select-over-clause-transact-sql)
- [PERCENTILE_CONT (Transact-SQL)](https://learn.microsoft.com/sql/t-sql/functions/percentile-cont-transact-sql)
