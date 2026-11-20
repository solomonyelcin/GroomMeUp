# SQL Joins, Set Operators and Subqueries: senior interview guide

**Who this is for:** a senior .NET engineer (9+ years) who writes T-SQL daily through EF Core or Dapper but must now explain joins, NULL behaviour and subquery semantics from first principles on a whiteboard. Main platform is SQL Server; differences for ANSI SQL, PostgreSQL and Snowflake are noted where they change an answer.

## What interviewers expect at senior level

- You pick the right join without trial and error, and you can say what happens to unmatched rows on each side.
- You know that `NOT IN` plus a NULL silently returns nothing, and you reach for `NOT EXISTS` by reflex.
- You explain the logical order in which a query is evaluated, so you can say why an alias fails in `WHERE` and why a filter in `ON` differs from one in `WHERE`.
- You treat semi-joins and anti-joins as concepts (existence tests), not as syntax.

## Sample data used in this guide

```sql
CREATE TABLE Customer (CustomerId int PRIMARY KEY, Name nvarchar(20) NOT NULL);
CREATE TABLE Orders   (OrderId int PRIMARY KEY, CustomerId int NULL, Amount int NOT NULL);

INSERT INTO Customer VALUES (1, N'Asha'), (2, N'Ben'), (3, N'Chen'), (4, N'Dina');
INSERT INTO Orders   VALUES (101, 1, 50), (102, 1, 70), (103, 2, 20), (104, NULL, 15);
```

| Customer | | Orders | | |
| --- | --- | --- | --- | --- |
| 1 Asha | | 101 | 1 | 50 |
| 2 Ben | | 102 | 1 | 70 |
| 3 Chen (no orders) | | 103 | 2 | 20 |
| 4 Dina (no orders) | | 104 | NULL | 15 |

Order 104 is an orphan with a NULL customer. It is deliberate: it exposes the NULL traps below.

## The join types

| Join | Keeps | Unmatched rows |
| --- | --- | --- |
| `INNER JOIN` | Only pairs where `ON` is true | Dropped on both sides |
| `LEFT [OUTER] JOIN` | All left rows | Right columns are NULL |
| `RIGHT [OUTER] JOIN` | All right rows | Left columns are NULL |
| `FULL [OUTER] JOIN` | All rows of both | NULL on the missing side |
| `CROSS JOIN` | Every left row paired with every right row | No `ON`; N x M rows |

```sql
SELECT c.Name, o.OrderId
FROM Customer c INNER JOIN Orders o ON o.CustomerId = c.CustomerId
ORDER BY o.OrderId;
```

| Name | OrderId |
| --- | --- |
| Asha | 101 |
| Asha | 102 |
| Ben | 103 |

Change `INNER` to `LEFT` (order by `c.CustomerId, o.OrderId`) and Chen and Dina appear with NULL: rows are Asha 101, Asha 102, Ben 103, Chen NULL, Dina NULL. With `RIGHT` you get Asha 101, Asha 102, Ben 103 and `NULL 104`. With `FULL` you get all six distinct rows: the five from `LEFT` plus `NULL 104`.

```sql
SELECT c.Name, o.OrderId
FROM Customer c FULL JOIN Orders o ON o.CustomerId = c.CustomerId
ORDER BY o.OrderId, c.CustomerId;   -- SQL Server sorts NULL first
```

| Name | OrderId |
| --- | --- |
| Chen | NULL |
| Dina | NULL |
| Asha | 101 |
| Asha | 102 |
| Ben | 103 |
| NULL | 104 |

Notes worth saying aloud:

- `RIGHT JOIN` is just a mirrored `LEFT JOIN`; most teams standardise on `LEFT` for readability.
- A one-to-many join repeats the "one" side. Joining then `SUM`-ming a parent column inflates totals (the classic "fan-out" bug).
- `CROSS JOIN` is useful for generating combinations or a calendar-times-product grid. An accidental cross join happens when the `ON` clause is missing in old comma syntax (`FROM a, b`).

## Semi-joins and anti-joins

These are existence tests. They never multiply rows, and they return columns from the left side only.

```sql
-- Semi-join: customers that have at least one order
SELECT c.Name FROM Customer c
WHERE EXISTS (SELECT 1 FROM Orders o WHERE o.CustomerId = c.CustomerId)
ORDER BY c.CustomerId;
```

Result: Asha, Ben (Asha once, although she has two orders; an inner join would list her twice).

```sql
-- Anti-join: customers with no orders
SELECT c.Name FROM Customer c
WHERE NOT EXISTS (SELECT 1 FROM Orders o WHERE o.CustomerId = c.CustomerId)
ORDER BY c.CustomerId;
```

Result: Chen, Dina. The equivalent `LEFT JOIN ... WHERE o.OrderId IS NULL` returns the same rows (test a column that is never NULL in the right table). SQL Server usually compiles both to the same plan (a left anti semi join), so choose for clarity.

## CROSS APPLY and OUTER APPLY

`APPLY` is a join whose right side is evaluated once per left row and may reference the left row's columns. It is T-SQL's lateral join (`LATERAL` in PostgreSQL and Snowflake). Typical use: top N rows per parent, or calling an inline table-valued function per row.

```sql
SELECT c.Name, t.OrderId, t.Amount
FROM Customer c
CROSS APPLY (SELECT TOP (1) o.OrderId, o.Amount
             FROM Orders o
             WHERE o.CustomerId = c.CustomerId
             ORDER BY o.Amount DESC) t
ORDER BY c.CustomerId;
```

| Name | OrderId | Amount |
| --- | --- | --- |
| Asha | 102 | 70 |
| Ben | 103 | 20 |

`CROSS APPLY` behaves like an inner join (customers with no match vanish). `OUTER APPLY` behaves like a left join, so the result also contains `Chen NULL NULL` and `Dina NULL NULL`.

## Self joins

Join a table to itself using two aliases. The usual case is a hierarchy stored as `ManagerId`.

```sql
CREATE TABLE Employee (EmpId int PRIMARY KEY, Name nvarchar(10), ManagerId int NULL);
INSERT INTO Employee VALUES (1,N'Ann',NULL),(2,N'Bob',1),(3,N'Cy',1),(4,N'Di',2);

SELECT e.Name AS Employee, m.Name AS Manager
FROM Employee e LEFT JOIN Employee m ON m.EmpId = e.ManagerId
ORDER BY e.EmpId;
```

| Employee | Manager |
| --- | --- |
| Ann | NULL |
| Bob | Ann |
| Cy | Ann |
| Di | Bob |

Use `LEFT` or the top of the tree (Ann) disappears. A self join sees one level only; for arbitrary depth use a recursive CTE (see guide 05).

## Set operators

```sql
CREATE TABLE SetA (V int); INSERT INTO SetA VALUES (1),(2),(2),(3);
CREATE TABLE SetB (V int); INSERT INTO SetB VALUES (2),(3),(3),(4);
```

| Query | Result | Why |
| --- | --- | --- |
| `SELECT V FROM SetA UNION SELECT V FROM SetB` | 1, 2, 3, 4 | Combines and removes duplicates |
| `... UNION ALL ...` | 8 rows: 1,2,2,3,2,3,3,4 | Combines, keeps duplicates, no sort or hash needed |
| `... INTERSECT ...` | 2, 3 | Distinct rows present in both |
| `SetA EXCEPT SetB` | 1 | Distinct rows of A not in B |
| `SetB EXCEPT SetA` | 4 | Direction matters |

Rules and facts:

- Both queries need the same column count and compatible types; column names come from the first query; `ORDER BY` is allowed once, at the very end.
- **Prefer `UNION ALL`** unless you need de-duplication. `UNION` adds a distinct sort or hash step.
- Set operators treat two NULLs as equal, unlike `=`. That makes `EXCEPT` a null-safe way to compare rowsets.
- Precedence: `INTERSECT` binds tighter than `UNION` and `EXCEPT`; use parentheses.
- Dialects: SQL Server has no `INTERSECT ALL` or `EXCEPT ALL` (PostgreSQL has). Oracle and Snowflake also accept `MINUS` as a synonym for `EXCEPT`.

## NULL semantics and three-valued logic

NULL means "unknown", not "empty". A comparison with NULL yields UNKNOWN, and `WHERE` keeps only rows where the predicate is TRUE.

| A | B | A AND B | A OR B |
| --- | --- | --- | --- |
| TRUE | UNKNOWN | UNKNOWN | TRUE |
| FALSE | UNKNOWN | FALSE | UNKNOWN |
| UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN |

`NOT UNKNOWN` is UNKNOWN. Sample: `T(Id, Val)` = (1,10), (2,NULL), (3,30).

| Predicate | Rows returned |
| --- | --- |
| `Val <> 10` | Id 3 only (row 2 is UNKNOWN) |
| `Val = NULL` | none (always UNKNOWN) |
| `Val IS NULL` | Id 2 |
| `NOT (Val = 10)` | Id 3 only |

Aggregates: `COUNT(*)` = 3, `COUNT(Val)` = 2, `AVG(Val)` = 20 (NULLs are ignored, so it is 40/2, not 40/3).

**The NOT IN trap:**

```sql
SELECT Name FROM Customer
WHERE CustomerId NOT IN (SELECT CustomerId FROM Orders);   -- subquery contains NULL
```

Result: zero rows. For Chen, `3 <> 1 AND 3 <> 2 AND 3 <> NULL` ends UNKNOWN, so he is filtered out. The fix is `NOT EXISTS`, or add `WHERE CustomerId IS NOT NULL` inside the subquery. `IN` itself is fine because UNKNOWN branches inside an `OR` chain do not change a TRUE.

More NULL facts: `ISNULL(a, b)` is T-SQL only and takes the type of its first argument (it can truncate), while `COALESCE` is ANSI and returns the highest-precedence type. A unique index in SQL Server allows only one NULL; PostgreSQL allows many (use a filtered unique index on SQL Server to emulate it). NULLs sort first ascending in SQL Server, but last in PostgreSQL and Snowflake by default; use `NULLS FIRST/LAST` where supported, or `ORDER BY CASE WHEN col IS NULL THEN 1 ELSE 0 END, col` on SQL Server.

## Correlated and uncorrelated subqueries

- **Uncorrelated:** runs independently, conceptually once. `WHERE Salary > (SELECT AVG(Salary) FROM Emp)`.
- **Correlated:** references the outer row, so it is conceptually evaluated per row. The optimiser often rewrites it into a join, so do not assume "per row" means slow.

```sql
CREATE TABLE Emp (EmpId int, Name nvarchar(10), DeptId int, Salary int);
INSERT INTO Emp VALUES (1,N'Ann',10,100),(2,N'Bob',10,60),(3,N'Cy',10,80),(4,N'Di',20,50),(5,N'Eve',20,70);

SELECT e.Name FROM Emp e
WHERE e.Salary > (SELECT AVG(x.Salary) FROM Emp x WHERE x.DeptId = e.DeptId)
ORDER BY e.EmpId;
```

Department 10 averages 80 and department 20 averages 60, so the result is Ann (100 > 80) and Eve (70 > 60). Cy equals the average and is excluded. Trap: `AVG` over an `int` column returns an `int` in SQL Server, truncating; cast to `decimal` first when averages are fractional.

**EXISTS vs IN**

| Aspect | `EXISTS` | `IN` |
| --- | --- | --- |
| Semantics | True if the subquery returns any row | True if the value equals any listed value |
| Select list | Ignored (`SELECT 1` is a convention) | Single column used |
| NULL safety | Safe, including `NOT EXISTS` | `NOT IN` breaks when the list has NULL |
| Performance | Both become semi-joins; usually identical plans | Same |

## Logical query processing order

SQL is written starting with `SELECT`, but evaluated roughly in this order:

1. `FROM` (including `JOIN` and `ON`, `APPLY`)
2. `WHERE`
3. `GROUP BY`
4. `HAVING`
5. `SELECT` (expressions, window functions, then `DISTINCT`)
6. `ORDER BY`
7. `TOP` or `OFFSET ... FETCH`

Consequences you should be able to state:

- A `SELECT` alias cannot be used in `WHERE`, `GROUP BY` or `HAVING` in T-SQL, but it can be used in `ORDER BY`. (Snowflake lets you reuse aliases in `WHERE`; PostgreSQL allows them in `GROUP BY` and `ORDER BY` only.)
- Window functions are evaluated at step 5, so you cannot filter on them in `WHERE`; wrap them in a CTE or subquery.

**ON vs WHERE in outer joins:**

```sql
-- filter in WHERE: the LEFT JOIN degrades to an inner join
SELECT c.Name, o.OrderId FROM Customer c
LEFT JOIN Orders o ON o.CustomerId = c.CustomerId
WHERE o.Amount > 30 ORDER BY o.OrderId;
```

Result: Asha 101, Asha 102. Move the condition into `ON` (`ON o.CustomerId = c.CustomerId AND o.Amount > 30`) and the unmatched customers return: Asha 101, Asha 102, Ben NULL, Chen NULL, Dina NULL (Ben's only order, 20, fails the condition).

## Common traps and red flags

- `NOT IN` against a nullable column or subquery.
- Filtering the right table of a `LEFT JOIN` in `WHERE`, silently making it inner.
- `SELECT DISTINCT` used to hide a join fan-out instead of fixing the join.
- Summing a parent amount after a one-to-many join.
- `UNION` where `UNION ALL` was meant, costing a sort.
- `= NULL` instead of `IS NULL`.

## 10 questions to practise

1. When does `LEFT JOIN` return more rows than the left table has? (One-to-many matches.)
2. Why does `NOT IN` return no rows here, and how do you fix it? (NULL in list, `NOT EXISTS`.)
3. Write an anti-join three ways and compare. (`NOT EXISTS`, `LEFT JOIN ... IS NULL`, `EXCEPT`.)
4. What is the difference between `UNION` and `UNION ALL` for performance and results? (Distinct step.)
5. When would you use `OUTER APPLY` instead of `LEFT JOIN`? (Per-row top N, table-valued function.)
6. Why can you use a column alias in `ORDER BY` but not in `WHERE`? (Logical order.)
7. How do `ON` and `WHERE` differ for an outer join? (Unmatched-row preservation.)
8. What does `COUNT(col)` skip that `COUNT(*)` does not? (NULL values.)
9. How does `EXCEPT` treat NULLs compared with `<>`? (Equal in set ops.)
10. Explain a semi-join and which physical operators implement it. (Existence test; nested loops, hash or merge semi join.)

## Skill-upgrade checklist

- [ ] Recreate the sample tables locally (SQL Server in Docker or LocalDB) and run every query above.
- [ ] Prove the `NOT IN` trap, then fix it two ways.
- [ ] Read an actual plan for `EXISTS`, `IN` and `LEFT JOIN ... IS NULL` and see the shared anti semi join.
- [ ] Rewrite a correlated subquery as `CROSS APPLY` and as a join, and compare reads with `SET STATISTICS IO ON`.
- [ ] Translate three queries to PostgreSQL (`LATERAL`, `LIMIT`) and Snowflake.
- [ ] Explain logical processing order out loud in under a minute.

## Read next (official)

- [SELECT (Transact-SQL), including logical processing order](https://learn.microsoft.com/sql/t-sql/queries/select-transact-sql)
- [FROM clause: joins and APPLY](https://learn.microsoft.com/sql/t-sql/queries/from-transact-sql)
- [Joins (SQL Server)](https://learn.microsoft.com/sql/relational-databases/performance/joins)
- [Set operators: UNION](https://learn.microsoft.com/sql/t-sql/language-elements/set-operators-union-transact-sql)
- [Set operators: EXCEPT and INTERSECT](https://learn.microsoft.com/sql/t-sql/language-elements/set-operators-except-and-intersect-transact-sql)
- [Subqueries](https://learn.microsoft.com/sql/relational-databases/performance/subqueries)
