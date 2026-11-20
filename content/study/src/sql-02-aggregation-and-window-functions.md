# SQL Aggregation and Window Functions: senior interview guide

**Who this is for:** a senior .NET engineer (9+ years) who can write `GROUP BY` in their sleep but is asked to produce subtotals, rankings, running totals and "top N per group" live, and to explain why each query behaves as it does. Main platform is SQL Server; ANSI, PostgreSQL and Snowflake differences are flagged.

## What interviewers expect at senior level

- You choose between a `GROUP BY` and a window function by asking "do I want to collapse rows or keep them?".
- You know `RANK` from `DENSE_RANK` from `ROW_NUMBER`, and you always add a tie-breaker when a deterministic answer matters.
- You explain the default window frame and why `LAST_VALUE` surprises people.
- You can solve gaps-and-islands, de-duplication and top-N-per-group without looking anything up.
- You connect window queries to indexes: an index on (partition columns, order columns) removes the sort.

## Aggregation basics

Sample data used for this section:

```sql
CREATE TABLE Sale (SaleId int PRIMARY KEY, Region nvarchar(10), Rep nvarchar(10), Amount int NULL, Status nvarchar(10));
INSERT INTO Sale VALUES
 (1,N'North',N'Amy',100,N'Paid'), (2,N'North',N'Amy',50,N'Open'), (3,N'North',N'Raj',70,N'Paid'),
 (4,N'South',N'Lee',90,N'Paid'),  (5,N'South',N'Lee',NULL,N'Open'), (6,N'South',N'Mia',40,N'Paid');
```

```sql
SELECT Region,
       COUNT(*)                                          AS Rows_,
       COUNT(Amount)                                     AS WithAmount,
       SUM(Amount)                                       AS Total,
       SUM(CASE WHEN Status = N'Paid' THEN Amount ELSE 0 END) AS PaidTotal,
       COUNT(CASE WHEN Status = N'Open' THEN 1 END)      AS OpenCount,
       COUNT(DISTINCT Rep)                               AS Reps
FROM Sale
GROUP BY Region
ORDER BY Region;
```

| Region | Rows_ | WithAmount | Total | PaidTotal | OpenCount | Reps |
| --- | --- | --- | --- | --- | --- | --- |
| North | 3 | 3 | 220 | 170 | 1 | 2 |
| South | 3 | 2 | 130 | 130 | 1 | 2 |

Points to make:

- `COUNT(*)` counts rows. `COUNT(col)` counts non-NULL values. `COUNT(DISTINCT col)` counts distinct non-NULL values. `SUM`, `AVG`, `MIN`, `MAX` ignore NULLs; `SUM` over zero non-NULL rows is NULL, not 0 (wrap in `COALESCE`).
- **Conditional aggregation** (`SUM(CASE ...)`, `COUNT(CASE ... THEN 1 END)`) is the portable way to compute several filtered measures in one pass. PostgreSQL also has `COUNT(*) FILTER (WHERE ...)`.
- **WHERE vs HAVING:** `WHERE` filters rows before grouping and can use indexes. `HAVING` filters groups after aggregation. `HAVING SUM(Amount) > 200` returns only North (220).
- Every selected column must be in `GROUP BY` or inside an aggregate. (MySQL's old leniency does not exist here.)
- `AVG` over an `int` column returns an `int` in SQL Server; cast to `decimal(18,2)` for real averages.

## GROUPING SETS, ROLLUP and CUBE

They compute several levels of grouping in one scan. `GROUPING(col)` returns 1 when the column is rolled up in that row, which is how you tell a subtotal NULL from a real NULL.

```sql
SELECT Region, Rep, SUM(Amount) AS Total, GROUPING(Rep) AS IsRolledUp
FROM Sale
GROUP BY ROLLUP (Region, Rep)
ORDER BY GROUPING(Region), Region, GROUPING(Rep), Rep;
```

| Region | Rep | Total | IsRolledUp |
| --- | --- | --- | --- |
| North | Amy | 150 | 0 |
| North | Raj | 70 | 0 |
| North | NULL | 220 | 1 |
| South | Lee | 90 | 0 |
| South | Mia | 40 | 0 |
| South | NULL | 130 | 1 |
| NULL | NULL | 350 | 1 |

| Construct | Grouping sets produced |
| --- | --- |
| `ROLLUP (a, b)` | (a,b), (a), () : hierarchical subtotals, n+1 sets |
| `CUBE (a, b)` | (a,b), (a), (b), () : every combination, 2^n sets |
| `GROUPING SETS ((a),(b))` | Exactly the sets you list |

`GROUP BY GROUPING SETS ((Region), ())` gives the two region totals plus a grand total of 350. All three constructs are standard and work in PostgreSQL and Snowflake with the same syntax.

## Window functions

A window function computes over a set of rows related to the current row and does **not** collapse them. Syntax: `func() OVER (PARTITION BY ... ORDER BY ... frame)`.

```sql
CREATE TABLE Staff (Id int PRIMARY KEY, Name nvarchar(10), Dept nvarchar(5), Salary int);
INSERT INTO Staff VALUES (1,N'Ann',N'Eng',100),(2,N'Bob',N'Eng',100),(3,N'Cy',N'Eng',80),
                         (4,N'Di',N'Eng',60),(5,N'Eve',N'Ops',90),(6,N'Fay',N'Ops',70);

SELECT Name, Dept, Salary,
  ROW_NUMBER() OVER (PARTITION BY Dept ORDER BY Salary DESC, Id) AS rn,
  RANK()       OVER (PARTITION BY Dept ORDER BY Salary DESC)     AS rnk,
  DENSE_RANK() OVER (PARTITION BY Dept ORDER BY Salary DESC)     AS drnk
FROM Staff ORDER BY Dept, rn;
```

| Name | Dept | Salary | rn | rnk | drnk |
| --- | --- | --- | --- | --- | --- |
| Ann | Eng | 100 | 1 | 1 | 1 |
| Bob | Eng | 100 | 2 | 1 | 1 |
| Cy | Eng | 80 | 3 | 3 | 2 |
| Di | Eng | 60 | 4 | 4 | 3 |
| Eve | Ops | 90 | 1 | 1 | 1 |
| Fay | Ops | 70 | 2 | 2 | 2 |

- `ROW_NUMBER` is unique even for ties (order among ties is arbitrary without a tie-breaker). `RANK` leaves gaps after ties (1,1,3). `DENSE_RANK` does not (1,1,2).
- `NTILE(2) OVER (ORDER BY Salary DESC, Id)` on these six rows puts Ann, Bob, Eve in tile 1 and Cy, Fay, Di in tile 2. When rows do not divide evenly, the first tiles get one extra row.
- Window functions run in the `SELECT` step, so you cannot put them in `WHERE`. Use a CTE. Snowflake offers `QUALIFY` to filter directly; SQL Server and PostgreSQL do not.
- SQL Server does not support `DISTINCT` inside a window aggregate (`COUNT(DISTINCT x) OVER` fails).

### LAG and LEAD

```sql
CREATE TABLE Rev (Mon date PRIMARY KEY, Amount int);
INSERT INTO Rev VALUES ('2026-01-01',100),('2026-02-01',120),('2026-03-01',90),('2026-04-01',150);

SELECT Mon, Amount,
       LAG(Amount)  OVER (ORDER BY Mon) AS Prev,
       Amount - LAG(Amount) OVER (ORDER BY Mon) AS Change,
       LEAD(Amount) OVER (ORDER BY Mon) AS Nxt
FROM Rev ORDER BY Mon;
```

| Mon | Amount | Prev | Change | Nxt |
| --- | --- | --- | --- | --- |
| 2026-01-01 | 100 | NULL | NULL | 120 |
| 2026-02-01 | 120 | 100 | 20 | 90 |
| 2026-03-01 | 90 | 120 | -30 | 150 |
| 2026-04-01 | 150 | 90 | 60 | NULL |

`LAG(Amount, 1, 0)` supplies a default instead of NULL. Both functions need an `ORDER BY` and work per partition when you add `PARTITION BY`.

### Running totals and frames: ROWS vs RANGE

```sql
CREATE TABLE Pay (Day_ int, Amt int);
INSERT INTO Pay VALUES (1,10),(2,20),(2,30),(3,5);

SELECT Day_, Amt,
  SUM(Amt) OVER (ORDER BY Day_)                           AS RangeSum,  -- default frame
  SUM(Amt) OVER (ORDER BY Day_, Amt ROWS UNBOUNDED PRECEDING) AS RowsSum
FROM Pay ORDER BY Day_, Amt;
```

| Day_ | Amt | RangeSum | RowsSum |
| --- | --- | --- | --- |
| 1 | 10 | 10 | 10 |
| 2 | 20 | 60 | 30 |
| 2 | 30 | 60 | 60 |
| 3 | 5 | 65 | 65 |

- With `ORDER BY` and no explicit frame, the default is `RANGE BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW`. `RANGE` treats rows with equal sort values (peers) as one unit, so both day-2 rows show 60.
- `ROWS` counts physical positions, so each row gets its own running value. **Prefer explicit `ROWS`**: results are predictable, and in SQL Server it is also much cheaper than the default `RANGE`, which uses an on-disk worktable.
- SQL Server `RANGE` supports only `UNBOUNDED` and `CURRENT ROW` as bounds. PostgreSQL and Snowflake allow value offsets.
- A moving average over the `Rev` table: `AVG(Amount) OVER (ORDER BY Mon ROWS BETWEEN 1 PRECEDING AND CURRENT ROW)` gives 100, 110, 105, 120.

### FIRST_VALUE and LAST_VALUE

`FIRST_VALUE(Name) OVER (PARTITION BY Dept ORDER BY Salary DESC, Id)` returns the best-paid name for every row of the department: Ann for all Eng rows, Eve for Ops. `LAST_VALUE` with the default frame returns the **current** row's value (the frame ends at the current row), a classic trap. Fix it with `ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING`, which gives the lowest-paid name (Di for Eng, Fay for Ops).

## Top N per group

```sql
WITH r AS (
  SELECT Name, Dept, Salary,
         ROW_NUMBER() OVER (PARTITION BY Dept ORDER BY Salary DESC, Id) AS rn
  FROM Staff)
SELECT Dept, Name, Salary FROM r WHERE rn <= 2 ORDER BY Dept, rn;
```

| Dept | Name | Salary |
| --- | --- | --- |
| Eng | Ann | 100 |
| Eng | Bob | 100 |
| Ops | Eve | 90 |
| Ops | Fay | 70 |

Choose the function by the tie rule: `ROW_NUMBER` gives exactly N rows, `RANK`/`DENSE_RANK` keep all tied rows. For few groups, `CROSS APPLY (SELECT TOP (2) ... WHERE x.Dept = d.Dept ORDER BY ...)` over a department table can be faster with a supporting index.

## Gaps and islands

Group consecutive values by subtracting a row number: within a consecutive run the difference is constant.

```sql
CREATE TABLE Login (LoginDay date PRIMARY KEY);
INSERT INTO Login VALUES ('2026-03-01'),('2026-03-02'),('2026-03-03'),('2026-03-05'),('2026-03-06'),('2026-03-09');

WITH n AS (
  SELECT LoginDay, DATEADD(day, -ROW_NUMBER() OVER (ORDER BY LoginDay), LoginDay) AS Grp FROM Login)
SELECT MIN(LoginDay) AS StartDay, MAX(LoginDay) AS EndDay, COUNT(*) AS Days
FROM n GROUP BY Grp ORDER BY StartDay;
```

| StartDay | EndDay | Days |
| --- | --- | --- |
| 2026-03-01 | 2026-03-03 | 3 |
| 2026-03-05 | 2026-03-06 | 2 |
| 2026-03-09 | 2026-03-09 | 1 |

The keys are 2026-02-28 for the first run, 2026-03-01 for the second and 2026-03-03 for the third. Duplicates break the trick, so make values distinct first. To list the gaps instead, compare each day with `LEAD(LoginDay)` and keep rows where the difference exceeds one day.

## Deduplication

```sql
CREATE TABLE Contact (Id int PRIMARY KEY, Email nvarchar(20));
INSERT INTO Contact VALUES (1,N'a@x.com'),(2,N'b@x.com'),(3,N'a@x.com'),(4,N'a@x.com'),(5,N'b@x.com');

WITH d AS (SELECT ROW_NUMBER() OVER (PARTITION BY Email ORDER BY Id) AS rn FROM Contact)
DELETE FROM d WHERE rn > 1;      -- T-SQL allows deleting through a CTE
```

Rows 1 and 2 remain (the lowest Id per email); 3, 4 and 5 are deleted. PostgreSQL needs `DELETE ... WHERE ctid IN (...)` or `USING`, and Snowflake commonly rebuilds the table with `QUALIFY ROW_NUMBER() ... = 1`. Always run the `SELECT` form first and wrap the delete in a transaction.

## PIVOT, UNPIVOT and STRING_AGG

```sql
CREATE TABLE SalesQ (Region nvarchar(10), Qtr nvarchar(2), Amount int);
INSERT INTO SalesQ VALUES (N'North',N'Q1',10),(N'North',N'Q2',20),(N'South',N'Q1',5),(N'South',N'Q2',15),(N'North',N'Q1',3);

SELECT Region, [Q1], [Q2]
FROM (SELECT Region, Qtr, Amount FROM SalesQ) s
PIVOT (SUM(Amount) FOR Qtr IN ([Q1], [Q2])) p
ORDER BY Region;
```

| Region | Q1 | Q2 |
| --- | --- | --- |
| North | 13 | 20 |
| South | 5 | 15 |

`PIVOT` needs a fixed column list (dynamic columns require dynamic SQL) and groups by every column not used in the pivot, so feed it a narrow derived table. The portable alternative is conditional aggregation: `SUM(CASE WHEN Qtr = N'Q1' THEN Amount END) AS Q1`. `UNPIVOT` goes the other way but silently drops NULL cells; `CROSS APPLY (VALUES (N'Q1', Q1), (N'Q2', Q2)) v(Qtr, Amount)` keeps them.

```sql
SELECT Dept, STRING_AGG(Name, N', ') WITHIN GROUP (ORDER BY Name) AS Members
FROM Staff GROUP BY Dept ORDER BY Dept;
```

| Dept | Members |
| --- | --- |
| Eng | Ann, Bob, Cy, Di |
| Ops | Eve, Fay |

`STRING_AGG` (SQL Server 2017+) skips NULLs. If the input is not `nvarchar(max)` the result is capped at 8000 bytes and can fail with error 9829, so cast to `nvarchar(max)`. Equivalents: `string_agg(x, ', ' ORDER BY x)` in PostgreSQL, `LISTAGG(x, ', ') WITHIN GROUP (ORDER BY x)` in Snowflake. Before 2017 people used `FOR XML PATH`.

## Common traps and red flags

- `SELECT Region, Rep, SUM(Amount) ... GROUP BY Region` (a non-aggregated column).
- Using `COUNT(col)` and expecting NULL rows to count.
- Forgetting a tie-breaker in `ROW_NUMBER` and getting different "top" rows per run.
- `LAST_VALUE` without a frame; relying on the default `RANGE` frame for running totals.
- Filtering a window result in `WHERE`.
- `SELECT DISTINCT` plus window functions to "fix" duplicates.
- Pivoting in SQL for a UI that could pivot client-side.

## 10 questions to practise

1. `COUNT(*)` vs `COUNT(col)` vs `COUNT(DISTINCT col)`? (NULL handling.)
2. Why can't `HAVING` be replaced by `WHERE` for aggregates? (Evaluation order.)
3. `RANK` vs `DENSE_RANK` vs `ROW_NUMBER` on ties? (Gaps, uniqueness.)
4. Explain the default frame and why `LAST_VALUE` misbehaves. (`RANGE` to current row.)
5. `ROWS` vs `RANGE` with duplicate sort keys? (Peers.)
6. Get the top 3 salaries per department including ties. (`DENSE_RANK <= 3`.)
7. Find consecutive-day streaks of at least 3 days. (Islands, `HAVING COUNT(*) >= 3`.)
8. Delete duplicate rows keeping the newest. (`ROW_NUMBER` descending by date.)
9. When do you prefer `ROLLUP` to `UNION ALL` of several `GROUP BY`s? (One scan, `GROUPING`.)
10. Which index helps `ROW_NUMBER() OVER (PARTITION BY a ORDER BY b)`? (Key on (a, b), include the other columns.)

## Skill-upgrade checklist

- [ ] Run every example in this guide and compare to the tables.
- [ ] Show `RANGE` vs `ROWS` spooling with `SET STATISTICS IO ON` on a million-row table.
- [ ] Solve gaps-and-islands for a table that contains duplicates.
- [ ] Rewrite a `UNION ALL` of three aggregations as `GROUPING SETS`.
- [ ] Add the supporting index for a partitioned `ROW_NUMBER` and confirm the Sort operator disappears from the plan.
- [ ] Port the top-N query to Snowflake using `QUALIFY`.

## Read next (official)

- [SELECT - OVER clause (Transact-SQL)](https://learn.microsoft.com/sql/t-sql/queries/select-over-clause-transact-sql)
- [Ranking functions (Transact-SQL)](https://learn.microsoft.com/sql/t-sql/functions/ranking-functions-transact-sql)
- [SELECT - GROUP BY (Transact-SQL)](https://learn.microsoft.com/sql/t-sql/queries/select-group-by-transact-sql)
- [Using PIVOT and UNPIVOT](https://learn.microsoft.com/sql/t-sql/queries/from-using-pivot-and-unpivot)
- [STRING_AGG (Transact-SQL)](https://learn.microsoft.com/sql/t-sql/functions/string-agg-transact-sql)
- [LAG (Transact-SQL)](https://learn.microsoft.com/sql/t-sql/functions/lag-transact-sql)
