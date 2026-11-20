# T-SQL Programming: CTEs, procedures, MERGE and dynamic SQL, senior interview guide

**Who this is for:** a senior .NET engineer (9+ years) who calls stored procedures from C# every day but is now asked to write a recursive CTE on a whiteboard, defend a `MERGE`, explain why a table variable misled the optimiser, or show that a dynamic search query is not injectable. Main platform is SQL Server 2019 to 2022; differences for ANSI SQL, PostgreSQL and Snowflake are noted where they change an answer.

## What interviewers expect at senior level

- You choose between a CTE, a temp table, a table variable and a view on purpose, and can say what each does to the plan.
- You write recursive CTEs with a termination guarantee and know the `MAXRECURSION` default.
- You know the difference between inline and multi-statement table-valued functions and why scalar functions were historically a performance trap.
- You build dynamic SQL with `sp_executesql` and `QUOTENAME`, never by concatenating user input.
- You are wary of `MERGE` and can name concrete reasons.
- You write `TRY...CATCH` with `THROW`, `XACT_ABORT` and a correct transaction pattern.
- You can use `OUTPUT`, `APPLY`, `STRING_AGG` and `OPENJSON` without looking them up.

## Sample data used in this guide

```sql
CREATE TABLE Emp (
  EmpId int PRIMARY KEY,
  Name varchar(20) NOT NULL,
  ManagerId int NULL,
  Dept varchar(10) NOT NULL,
  Salary int NOT NULL);

INSERT INTO Emp VALUES
 (1,'Asha',NULL,'Exec',200), (2,'Ben',1,'Eng',150), (3,'Chitra',1,'Ops',120),
 (4,'Dev',2,'Eng',100),      (5,'Esha',2,'Eng',110), (6,'Farid',3,'Ops',90);
```

Six rows, a three-level hierarchy: Asha manages Ben and Chitra; Ben manages Dev and Esha; Chitra manages Farid.

## CTEs, and what they are not

A common table expression is a named, single-statement query scope. It is not materialised: SQL Server inlines it like a view, so referencing it twice runs the logic twice, and there is no hint to cache it (unlike PostgreSQL 12+, which has `MATERIALIZED`). If you need the result once and reused, use a temp table.

```sql
WITH DeptAvg AS (
  SELECT Dept, AVG(Salary) AS Avg_ FROM Emp GROUP BY Dept)
SELECT e.Name FROM Emp e JOIN DeptAvg d ON d.Dept = e.Dept
WHERE e.Salary > d.Avg_;
```

Result: Ben and Chitra. The Eng average is (150+100+110)/3 = 120, so only Ben beats it; the Ops average is (120+90)/2 = 105, so Chitra beats it; Asha is the only Exec row and equals her own average. Note that `AVG` over `int` returns an integer, so an average of 120.67 would truncate to 120. Cast to `decimal` when it matters.

Rules worth remembering: the statement before `WITH` must end with a semicolon; a CTE can be the target of `UPDATE` and `DELETE` (this is the standard way to delete duplicates); column names must be unique.

## Recursive CTEs

A recursive CTE has an anchor member, `UNION ALL`, and a recursive member that references the CTE. It stops when the recursive member returns no rows.

```sql
WITH Tree AS (
  SELECT EmpId, Name, ManagerId, 0 AS Lvl,
         CAST(Name AS varchar(200)) AS Path
  FROM Emp WHERE ManagerId IS NULL
  UNION ALL
  SELECT e.EmpId, e.Name, e.ManagerId, t.Lvl + 1,
         CAST(t.Path + ' > ' + e.Name AS varchar(200))
  FROM Emp e JOIN Tree t ON e.ManagerId = t.EmpId)
SELECT * FROM Tree ORDER BY Path
OPTION (MAXRECURSION 100);
```

| Name | Lvl | Path |
| --- | --- | --- |
| Asha | 0 | Asha |
| Ben | 1 | Asha > Ben |
| Dev | 2 | Asha > Ben > Dev |
| Esha | 2 | Asha > Ben > Esha |
| Chitra | 1 | Asha > Chitra |
| Farid | 2 | Asha > Chitra > Farid |

Points to make: the default limit is 100 levels and exceeding it raises error 530; `MAXRECURSION 0` removes the limit and is dangerous with cyclic data. The anchor and recursive column types must match exactly, which is why the `CAST` appears. SQL Server 2019 and later still has no `CYCLE` clause, so track a path string and stop when the id is already in it. For very deep or very wide hierarchies, consider `hierarchyid` or a closure table. PostgreSQL needs the `RECURSIVE` keyword; SQL Server does not use it.

## Temp tables vs table variables vs CTEs

| | `#temp` table | `@table` variable | CTE |
| --- | --- | --- | --- |
| Lives in | tempdb | tempdb (not memory-only) | Query text only |
| Statistics | Yes, auto-created | No column stats (cardinality is fixed at 1 before 2019) | Uses base table stats |
| Indexes | Any, after creation | Inline constraints and indexes only | None |
| Scope | Session and child scopes | Batch or procedure | One statement |
| Rolled back with transaction | Yes | No | n/a |
| Can recompile plan on change | Yes | Mostly no | n/a |

Since SQL Server 2019 (compatibility level 150), deferred compilation gives table variables a real row count at first compile. It still gives no column statistics, so joins and predicates on them can be misestimated. The common guidance: table variable for a few rows or when you want to avoid recompiles; temp table once you reach hundreds of rows or join it to large tables. Table variables survive a `ROLLBACK`, which is occasionally useful for logging inside a failed transaction. Table-valued parameters are read-only table variables and are the right way to pass a list from .NET.

## Stored procedures vs functions

| | Stored procedure | Inline TVF | Multi-statement TVF | Scalar UDF |
| --- | --- | --- | --- | --- |
| Returns | Result sets, `OUTPUT`, return code | A table | A table | One value |
| Usable in `FROM` or `SELECT` | No | Yes | Yes | Yes |
| Side effects (DML on real tables) | Allowed | No | No | No |
| Optimiser view | Own plan | Expanded like a view | Opaque; fixed row guess (interleaved execution helps in 2017+) | Row-by-row call, historically blocked parallelism |

SQL Server 2019 added scalar UDF inlining (compat level 150), which rewrites many simple scalar functions into the calling query; it has restrictions (no time-dependent functions, no certain constructs), so check `sys.sql_modules.is_inlineable`. The senior answer: prefer inline TVFs, treat scalar UDFs with suspicion on older compat levels, and keep procedures for operations with side effects, permissions boundaries and a stable API for the app.

Procedure habits: `SET NOCOUNT ON` to cut chatter to the client; schema-qualify objects; avoid the `sp_` prefix (it makes SQL Server look in `master` first); use `RETURN` only for status codes.

## Dynamic SQL, safely

String concatenation of user input is SQL injection. Parameterise values with `sp_executesql`, and quote identifiers with `QUOTENAME`, because identifiers cannot be parameters.

```sql
CREATE OR ALTER PROCEDURE dbo.SearchEmp
  @Dept varchar(10) = NULL, @MinSalary int = NULL, @SortCol sysname = 'Name'
AS
BEGIN
  SET NOCOUNT ON;
  IF @SortCol NOT IN ('Name','Salary','Dept') THROW 50001, 'Bad sort column', 1;

  DECLARE @sql nvarchar(max) = N'SELECT EmpId, Name, Salary FROM dbo.Emp WHERE 1 = 1';
  IF @Dept IS NOT NULL      SET @sql += N' AND Dept = @Dept';
  IF @MinSalary IS NOT NULL SET @sql += N' AND Salary >= @MinSalary';
  SET @sql += N' ORDER BY ' + QUOTENAME(@SortCol);

  EXEC sys.sp_executesql @sql,
       N'@Dept varchar(10), @MinSalary int', @Dept, @MinSalary;
END;
```

Why this is the preferred shape for catch-all searches: each combination of filters gets its own cached plan, and none of it is injectable (values are parameters, the identifier is allow-listed and quoted). Compare with `WHERE (@Dept IS NULL OR Dept = @Dept)`, which compiles one plan for all cases unless you add `OPTION (RECOMPILE)`. Traps: dynamic SQL runs in its own scope, so local variables and `#temp` tables created inside are not visible outside (the reverse works); permissions are checked against the caller unless you use `EXECUTE AS`; `EXEC(@sql)` cannot take parameters; keep the `nvarchar` prefix `N'...'`.

## MERGE and why people avoid it

`MERGE` performs insert, update and delete in one statement based on a join.

```sql
MERGE dbo.Target AS t
USING dbo.Source AS s ON t.Id = s.Id
WHEN MATCHED AND t.Val <> s.Val THEN UPDATE SET Val = s.Val
WHEN NOT MATCHED BY TARGET THEN INSERT (Id, Val) VALUES (s.Id, s.Val)
WHEN NOT MATCHED BY SOURCE THEN DELETE
OUTPUT $action, inserted.Id, deleted.Id;
```

Known problems, which is what interviewers probe:

- Race conditions: under concurrency, two sessions can both decide "not matched" and one fails on a key violation. Add `WITH (HOLDLOCK)` (serializable semantics) on the target, or use a unique index and retry.
- A long history of bugs (wrong results with filtered indexes, indexed views, triggers, and some foreign key scenarios); Microsoft documents them. Many teams ban `MERGE` in production code.
- The source must not produce two rows matching one target row; otherwise error 8672.
- The statement must end with a semicolon.
- Triggers fire once per action type, and `OUTPUT ... INTO` is needed when the target has triggers.
- `<>` comparison misses `NULL` changes; use `EXCEPT` or `IS DISTINCT FROM` (the latter is SQL Server 2022 and later).

The safer alternative is an explicit `UPDATE ... FROM` then `INSERT ... WHERE NOT EXISTS` inside one transaction with `UPDLOCK, HOLDLOCK` hints. Use `MERGE` where batch ETL runs single-threaded and you have tested it.

## OUTPUT clause

`OUTPUT` returns rows affected by `INSERT`, `UPDATE`, `DELETE` or `MERGE` using the `inserted` and `deleted` pseudo-tables. It is how you get generated keys for many rows, which `SCOPE_IDENTITY()` cannot do.

```sql
DELETE FROM Emp
OUTPUT deleted.EmpId, deleted.Name
WHERE Dept = 'Ops' AND Salary < 100;
```

This deletes Farid and returns row 6. Use `OUTPUT ... INTO @table` to feed later statements or an audit table. Prefer `SCOPE_IDENTITY()` over `@@IDENTITY` (which sees trigger inserts) for single rows. EF Core uses `OUTPUT` behind `SaveChanges` for batching, which is why tables with triggers need `UseSqlOutputClause(false)` in recent versions.

## APPLY

`CROSS APPLY` is an inner join to a correlated subquery or function; `OUTER APPLY` keeps left rows with no match. It lets the right side reference the left row and use `TOP` or `ORDER BY`.

```sql
SELECT d.Dept, x.Name, x.Salary
FROM (SELECT DISTINCT Dept FROM Emp) d
CROSS APPLY (SELECT TOP (1) Name, Salary FROM Emp e
             WHERE e.Dept = d.Dept ORDER BY Salary DESC) x;
```

Output: Eng Ben 150, Exec Asha 200, Ops Chitra 120. Typical uses: top N per group, calling an inline TVF per row, unpivoting with `VALUES`, and reusing a computed expression. Snowflake and PostgreSQL write this as `LATERAL`.

## JSON and STRING_AGG

```sql
SELECT Dept, STRING_AGG(Name, ', ') WITHIN GROUP (ORDER BY Name) AS Names
FROM Emp GROUP BY Dept;
```

Result: Eng gives `Ben, Dev, Esha`, Exec gives `Asha`, Ops gives `Chitra, Farid`. `STRING_AGG` arrived in SQL Server 2017; before that the `FOR XML PATH` trick was used. The result is `nvarchar(max)` for unicode input but is capped at 8000 bytes for non-max varchar input unless you cast to `varchar(max)`, a classic truncation error.

```sql
DECLARE @j nvarchar(max) = N'[{"id":1,"tags":["a","b"]},{"id":2,"tags":[]}]';
SELECT j.id, JSON_VALUE(j.raw, '$.id') AS idCheck
FROM OPENJSON(@j) WITH (id int '$.id', raw nvarchar(max) '$' AS JSON) j;
```

`JSON_VALUE` extracts a scalar, `JSON_QUERY` an object or array, `OPENJSON` shreds into rows, `FOR JSON PATH` produces JSON, `ISJSON` validates. JSON is stored as plain `nvarchar`; there is no native `json` type in SQL Server 2019 to 2022 (a native type exists only in Azure SQL and SQL Server 2025). Index a hot path with a computed column on `JSON_VALUE`. Passing an id list as JSON to `OPENJSON` is a lightweight alternative to a table-valued parameter; `STRING_SPLIT` (2016 and later, with an ordinal column from 2022) covers simple lists.

## Error handling and transactions

```sql
SET XACT_ABORT ON;
BEGIN TRY
  BEGIN TRAN;
    UPDATE dbo.Account SET Bal -= 100 WHERE Id = 1;
    UPDATE dbo.Account SET Bal += 100 WHERE Id = 2;
  COMMIT;
END TRY
BEGIN CATCH
  IF @@TRANCOUNT > 0 ROLLBACK;
  THROW;   -- re-raise the original error with its number and line
END CATCH;
```

- `XACT_ABORT ON` makes most run-time errors doom the transaction and roll it back, which avoids half-committed work and is required for distributed transactions.
- `THROW` (2012 and later) re-raises exactly; `RAISERROR` needs manual message building and cannot rethrow the original number. Use `THROW` with no arguments inside `CATCH`.
- Some errors are not caught by `TRY...CATCH` in the same scope: compile errors, and severity 20 and above that kill the connection.
- Check `XACT_STATE()` when `XACT_ABORT` is off: `-1` means the transaction is uncommittable.
- `@@TRANCOUNT` nesting is a counter, not real nested transactions; a rollback undoes everything. Savepoints (`SAVE TRANSACTION`) give partial rollback.

## Triggers and views

Triggers: `AFTER` (default, per statement, not per row) and `INSTEAD OF` (common on views). Inside, use the `inserted` and `deleted` tables and always handle multi-row statements; a trigger written as `SELECT @x = col FROM inserted` silently processes one row. Triggers hide logic, run inside the caller's transaction, extend lock time and complicate `OUTPUT`. Good uses: audit, enforcing rules a constraint cannot express. Prefer constraints, procedures or temporal tables when they fit. `UPDATE()` and `COLUMNS_UPDATED()` test which columns were in the `SET` list, not whether values changed.

Views: a stored query, not stored data, unless indexed. A view is expanded into the outer query, so it carries no performance of its own. `ORDER BY` is invalid in a view without `TOP`. A view with `SELECT *` freezes its column list at creation (use `sp_refreshview`). Indexed (materialised) views need `SCHEMABINDING`, deterministic expressions and `COUNT_BIG(*)` with `GROUP BY`; they speed aggregates and slow writes, and Enterprise edition matches them automatically while other editions require `NOEXPAND`.

## Common traps and red flags

- Using a CTE twice expecting it to run once.
- Recursive CTE on possibly cyclic data with `MAXRECURSION 0`.
- Building filters by string concatenation instead of `sp_executesql`.
- `MERGE` without `HOLDLOCK` in a concurrent workload.
- Scalar UDF in a `WHERE` clause on a 100-million-row table (compat level below 150).
- A table variable joined to a large table, expecting good estimates.
- Trigger code that assumes one row per statement.
- `CATCH` block that swallows the error or uses `RAISERROR` with a new number.
- `SELECT @id = SCOPE_IDENTITY()` after a multi-row insert.

## 10 questions to practise

1. Is a CTE materialised in SQL Server? (No, it is inlined; use a temp table to reuse.)
2. What stops a recursive CTE, and what is the default limit? (Empty recursive step; 100 levels, error 530.)
3. When would you pick a temp table over a table variable? (Many rows, joins, need statistics or indexes.)
4. Inline TVF vs multi-statement TVF? (Inline is expanded like a view with real estimates.)
5. How do you write a catch-all search procedure safely? (`sp_executesql`, parameters, `QUOTENAME`, allow-list.)
6. Name three problems with `MERGE`. (Race conditions, historic bugs, duplicate source rows, trigger quirks.)
7. How do you capture the generated keys of a multi-row insert? (`OUTPUT inserted.Id`.)
8. When use `CROSS APPLY` rather than a join? (Correlated top N, per-row function call.)
9. What does `XACT_ABORT ON` change? (Run-time errors abort and roll back the transaction.)
10. What can go wrong in a trigger? (Multi-row statements, recursion, hidden cost, interaction with `OUTPUT`.)

## Skill-upgrade checklist

- [ ] Run the sample script and write the org-chart recursive CTE from memory, with `Lvl` and `Path`.
- [ ] Add a cycle to the data and make the query stop safely instead of hitting error 530.
- [ ] Compare a `#temp` and a `@table` variable joined to a large table on compat level 140 and 150; read both plans.
- [ ] Write a dynamic search procedure and attack it with `'; DROP TABLE x;--`.
- [ ] Run a `MERGE` from two sessions in parallel, reproduce a key violation, then fix it with `HOLDLOCK`.
- [ ] Build an audit trigger that handles multi-row updates, then replace it with `OUTPUT` and compare.
- [ ] Rewrite a scalar UDF as an inline TVF and compare logical reads.

## Read next (official)

- [WITH common_table_expression (Transact-SQL)](https://learn.microsoft.com/sql/t-sql/queries/with-common-table-expression-transact-sql)
- [MERGE (Transact-SQL)](https://learn.microsoft.com/sql/t-sql/statements/merge-transact-sql)
- [OUTPUT clause (Transact-SQL)](https://learn.microsoft.com/sql/t-sql/queries/output-clause-transact-sql)
- [FROM clause: APPLY](https://learn.microsoft.com/sql/t-sql/queries/from-transact-sql)
- [sp_executesql (Transact-SQL)](https://learn.microsoft.com/sql/relational-databases/system-stored-procedures/sp-executesql-transact-sql)
- [THROW (Transact-SQL)](https://learn.microsoft.com/sql/t-sql/language-elements/throw-transact-sql)
- [JSON data in SQL Server](https://learn.microsoft.com/sql/relational-databases/json/json-data-sql-server)
- [Intelligent query processing: scalar UDF inlining](https://learn.microsoft.com/sql/relational-databases/user-defined-functions/scalar-udf-inlining)
