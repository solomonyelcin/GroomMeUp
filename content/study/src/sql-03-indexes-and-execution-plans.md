# SQL Indexes and Execution Plans: senior interview guide

**Who this is for:** a senior .NET engineer (9+ years) who has added "an index" to fix a slow EF Core query but is now asked to explain why it worked, how to read the plan, and why the same query is fast for one customer and slow for another. Main platform is SQL Server; differences for ANSI SQL, PostgreSQL and Snowflake are noted where they change an answer.

## What interviewers expect at senior level

- You can describe a B-tree and say what a clustered index physically is, and why the clustering key choice affects every other index.
- You design composite indexes deliberately (equality columns, then range, then sort) and can say when `INCLUDE` or a filtered index beats a wider key.
- You spot non-SARGable predicates and implicit conversions on sight.
- You read an actual plan: seek vs scan, key lookup, estimated vs actual rows, spills, warnings.
- You treat statistics, parameter sniffing and Query Store as one connected story, not three buzzwords.
- You are sceptical of "rebuild all indexes nightly" and of the missing-index suggestions.

## Sample data used in this guide

```sql
CREATE TABLE Ord (
  OrderId int PRIMARY KEY,            -- clustered by default
  CustomerId int NOT NULL,
  OrderDate date NOT NULL,
  Status varchar(10) NOT NULL,
  Amount int NOT NULL);

INSERT INTO Ord VALUES
 (1,10,'2025-01-15','Shipped',100), (2,10,'2025-03-02','Open',40),
 (3,20,'2025-12-31','Shipped',75),  (4,30,'2026-01-01','Open',60),
 (5,20,'2026-02-10','Shipped',25);
```

The data is tiny so you can verify results by hand. Imagine the same shape with 50 million rows to reason about plans.

## Clustered vs nonclustered, and the B-tree

Every index is a balanced tree of 8 KB pages: one root page, zero or more intermediate levels, then leaf pages. A seek walks root to leaf, so even a table of hundreds of millions of rows usually needs only 3 to 5 page reads to find one key.

| | Clustered index | Nonclustered index |
| --- | --- | --- |
| Leaf level holds | The table's data rows themselves | Key columns, `INCLUDE` columns and a row locator |
| How many per table | One (table is otherwise a heap) | Many (up to 999) |
| Row locator | n/a | The clustering key (or an 8-byte RID on a heap) |
| Ordering | Defines physical/logical row order | Independent ordering of its own keys |

Consequences:

- The clustering key is copied into every nonclustered index. A wide key (for example a 36-character string) inflates all of them.
- A good clustering key is narrow, unique, static and ever-increasing. An identity `int` or `bigint` fits. A random `uniqueidentifier` causes page splits and fragmentation; `NEWSEQUENTIALID()` or a sequential id reduces that.
- A non-unique clustered index gets a hidden 4-byte uniqueifier on duplicate keys.
- A primary key is not necessarily the clustered index; it is only the default.
- Key size limits: 900 bytes for a clustered key, 1,700 bytes for a nonclustered key (SQL Server 2016 and later).

Dialect notes: PostgreSQL tables are heaps; `CLUSTER` reorders once and does not maintain order. Snowflake has no user-managed B-tree indexes: it uses micro-partitions, optional clustering keys and the search optimization service (its hybrid tables are the exception and do have indexes).

## Seek, scan and key lookup

| Operator | Meaning | Typical cause |
| --- | --- | --- |
| Index Seek | Navigates the tree to a key or range | Sargable predicate on leading key column |
| Index Scan | Reads the whole index (or a large range) | No usable predicate, or low selectivity |
| Key Lookup | One clustered-index seek per row to fetch missing columns | Nonclustered index does not cover the query |
| RID Lookup | Same, against a heap | No clustered index |

A scan is not automatically bad, and a seek is not automatically good. A seek that runs 2 million times inside a nested loop is worse than one scan. The optimiser abandons an index when the estimated number of key lookups is large, commonly once you fetch a few percent to roughly a quarter of the rows (the tipping point depends on page counts, not rows).

## Covering indexes and INCLUDE

An index is covering for a query when it holds every column the query needs, so no lookup is required. `INCLUDE` columns are stored only at the leaf, are not part of the key, cannot be searched by seek, but remove the lookup and do not count towards key size limits.

```sql
CREATE INDEX IX_Ord_Cust ON Ord (CustomerId) INCLUDE (Amount, OrderDate);

SELECT CustomerId, SUM(Amount) AS Total FROM Ord WHERE CustomerId = 10 GROUP BY CustomerId;
```

| CustomerId | Total |
| --- | --- |
| 10 | 140 |

The plan is a single nonclustered Index Seek with no Key Lookup. Without the `INCLUDE`, SQL Server would add a lookup per matching row for `Amount`. The price of every extra index is slower inserts, updates and deletes plus storage.

## Composite indexes: column order

Rule of thumb: equality predicates first, then one range column, then columns that satisfy `ORDER BY`. An index on `(a, b)` supports seeks on `a`, or on `a` and `b`, but not on `b` alone (it may scan the index instead).

```sql
CREATE INDEX IX_Ord_Cust_Date ON Ord (CustomerId, OrderDate);

SELECT OrderId FROM Ord
WHERE CustomerId = 20 AND OrderDate >= '2026-01-01'
ORDER BY OrderDate;
```

Result: 5. The seek lands on customer 20, starts at 2026-01-01 and reads rows already in date order, so no Sort operator is needed. The reversed index `(OrderDate, CustomerId)` would seek on the date but then filter the customer within the range. Selectivity matters for choosing between equality columns, but "most selective first" is a myth when a range or sort column is involved.

## Filtered indexes

A filtered index covers a subset of rows, so it is small and cheap to maintain.

```sql
CREATE INDEX IX_Ord_Open ON Ord (CustomerId) INCLUDE (Amount) WHERE Status = 'Open';
```

It holds orders 2 and 4 only. Good uses: a hot subset ("open" items), or a unique constraint ignoring NULLs or soft-deleted rows (`CREATE UNIQUE INDEX ... WHERE DeletedAt IS NULL`). Catches: the query predicate must imply the filter, and a parameterised `WHERE Status = @s` cannot use it unless the plan is recompiled with the literal. PostgreSQL calls these partial indexes.

## SARGability

A predicate is SARGable (search-ARGument-able) when the engine can seek on it, which requires the indexed column to stand alone on one side of the comparison.

| Non-SARGable | Rewrite | Why |
| --- | --- | --- |
| `WHERE YEAR(OrderDate) = 2025` | `WHERE OrderDate >= '2025-01-01' AND OrderDate < '2026-01-01'` | Function hides the column |
| `WHERE Amount + 10 = 70` | `WHERE Amount = 60` | Arithmetic on the column |
| `WHERE Status LIKE '%pen'` | Full-text search, or reverse index trick | Leading wildcard |
| `WHERE ISNULL(Col, 0) = 0` | `WHERE Col = 0 OR Col IS NULL` | Wrapped column |
| `WHERE VarcharCol = @nvarcharParam` | Match the parameter type | Implicit conversion |

Both the `YEAR` form and the range form return orders 1, 2 and 3, but only the range can seek. Use half-open ranges (`>=` and `<`) so you never lose times on the last day of a `datetime`. Implicit conversion follows data type precedence: comparing a `varchar` column to an `nvarchar` value can convert the column side and force a scan (it is most damaging with SQL collations). .NET detail: Dapper and ADO.NET send `string` as `nvarchar` by default, so use `DbString` or an explicit size/type for `varchar` columns; EF Core maps by the model's column type.

## Statistics

The optimiser estimates row counts from statistics: a histogram of up to 200 steps on the leading key column, plus density information for column combinations. Bad estimates cause bad join types, memory grants and index choices.

- Auto-update triggers after enough row modifications. The old rule was 20 percent plus 500 rows; with compatibility level 130 or higher the threshold shrinks on large tables (about the square root of 1,000 times the row count).
- Inspect with `DBCC SHOW_STATISTICS('Ord', 'IX_Ord_Cust')` and `sys.dm_db_stats_properties`.
- Refresh with `UPDATE STATISTICS Ord WITH FULLSCAN`. Rebuilding an index also refreshes its statistics (reorganizing does not).
- Skewed data and ascending keys (new dates beyond the histogram) are classic causes of underestimates.

## Parameter sniffing

On first execution SQL Server compiles a plan using the actual parameter values (it "sniffs" them) and caches it. If the data is skewed, that plan may be wrong for other values.

Illustration: customer 1 owns 1,000,000 orders, customer 2 owns 3. A first call with customer 2 caches a seek plus lookups; a later call for customer 1 reuses it and performs a million lookups. Reverse the order and customer 2 pays for a scan.

| Fix | Trade-off |
| --- | --- |
| `OPTION (RECOMPILE)` | Fresh plan each time; compile CPU; best for catch-all search queries |
| `OPTIMIZE FOR (@p = value)` or `OPTIMIZE FOR UNKNOWN` | Stable but possibly mediocre plan |
| Query Store plan forcing | Pins a known good plan without code change |
| Split into separate procedures or branches by cardinality | More code, very predictable |
| Parameter Sensitive Plan optimisation (SQL Server 2022, compat level 160) | Automatic multiple plans per statement, limited cases |

Local-variable copies of parameters (the "mask" trick) disable sniffing and give an average-density plan; it works but hides the problem. Disabling the plan cache is not a fix.

## Reading an execution plan

Get plans with "Include Actual Execution Plan" in SSMS, `SET STATISTICS XML ON`, or Query Store. Combine with `SET STATISTICS IO, TIME ON` to see logical reads, which is the most stable metric.

1. Data flows right to left, top to bottom; the first operator on the right is where rows start.
2. Compare estimated and actual rows on each operator. A gap of 10x or more points at statistics, sniffing or a non-SARGable predicate.
3. Look for warnings: implicit conversion, missing statistics, a Sort or Hash spill to tempdb, residual predicates.
4. Check the join choice: Nested Loops for few outer rows, Hash Match for large unsorted inputs, Merge Join for inputs already sorted.
5. Note thick arrows into a Key Lookup or Nested Loops inner side.
6. Remember that operator costs shown in an actual plan are still estimates.

## Columnstore overview

Columnstore stores each column separately in compressed segments, grouped into row groups of up to about 1,048,576 rows. It suits scans and aggregates over large fact tables (often 10x compression, batch-mode processing, segment elimination). New rows land in a delta store until compressed.

| | Rowstore B-tree | Columnstore |
| --- | --- | --- |
| Best for | OLTP, point lookups, small ranges | Analytics, big scans and aggregates |
| Writes | Cheap | Batched; many small inserts hurt |
| Forms | Clustered, nonclustered | Clustered (CCI) or nonclustered (NCCI) |

A nonclustered columnstore on an OLTP table enables real-time analytics, at some write cost.

## Maintenance and fragmentation

External fragmentation means leaf pages out of logical order; internal means pages half empty. On SSDs the effect on reads is smaller than folklore suggests, but page density still affects memory and reads.

```sql
SELECT OBJECT_NAME(ips.object_id) AS TableName, i.name AS IndexName,
       ips.avg_fragmentation_in_percent, ips.page_count
FROM sys.dm_db_index_physical_stats(DB_ID(), NULL, NULL, NULL, 'LIMITED') ips
JOIN sys.indexes i ON i.object_id = ips.object_id AND i.index_id = ips.index_id
WHERE ips.page_count > 1000
ORDER BY ips.avg_fragmentation_in_percent DESC;
```

Microsoft's guideline: ignore small indexes, reorganize at roughly 5 to 30 percent, rebuild above 30 percent. Reorganize is always online and interruptible; rebuild creates a new copy, updates statistics, and can be online (edition dependent) and resumable on newer versions. Lower `FILLFACTOR` only for indexes with random inserts. Updating statistics usually matters more than defragmenting.

## Missing-index DMVs and unused indexes

```sql
SELECT TOP (5) d.statement, d.equality_columns, d.inequality_columns, d.included_columns,
       s.user_seeks, s.avg_user_impact
FROM sys.dm_db_missing_index_group_stats s
JOIN sys.dm_db_missing_index_groups g ON g.index_group_handle = s.group_handle
JOIN sys.dm_db_missing_index_details d ON d.index_handle = g.index_handle
ORDER BY s.user_seeks * s.avg_total_user_cost * s.avg_user_impact DESC;
```

These views reset on restart, ignore existing near-duplicate indexes, do not suggest column order thoughtfully and ignore write cost. Treat them as hints: merge suggestions and validate. Pair them with `sys.dm_db_index_usage_stats` to find indexes with many updates and no reads.

## Query Store

Query Store (SQL Server 2016 and later, Azure SQL) persists query text, plans and runtime statistics per time interval inside the database, so history survives restarts and plan cache eviction. Use it to find regressions (top resource consumers, "regressed queries"), compare plans for the same query, and force a plan with `sp_query_store_force_plan`. Key views: `sys.query_store_query`, `sys.query_store_plan`, `sys.query_store_runtime_stats`. Enable with `ALTER DATABASE ... SET QUERY_STORE = ON`; keep size and capture mode sensible.

## Common traps and red flags

- Indexing every column "just in case"; write amplification and memory pressure.
- `SELECT *` defeating covering indexes.
- Functions or casts on indexed columns; `LIKE '%x'`.
- Catch-all `WHERE (@a IS NULL OR Col = @a)` without `OPTION (RECOMPILE)`.
- Nightly rebuild of everything while statistics stay stale.
- Creating each suggestion from the missing-index DMV.
- Random GUID clustering key on a hot insert table.

## 10 questions to practise

1. What is stored in the leaf of a clustered vs a nonclustered index? (Data rows vs keys, includes and locator.)
2. Why should a clustering key be narrow? (It is copied into every nonclustered index.)
3. How do key columns and `INCLUDE` columns differ? (Seekable and ordered vs leaf-only payload.)
4. Why can `(CustomerId, OrderDate)` not serve a query filtering only on `OrderDate`? (Leading column rule.)
5. Rewrite `WHERE YEAR(d) = 2025` so it can seek. (Half-open date range.)
6. When does the optimiser choose a scan over seek plus key lookups? (Tipping point.)
7. Explain parameter sniffing and three ways to fix it. (Recompile, optimize for, Query Store, PSP.)
8. How do you tell stale statistics from a missing index in a plan? (Estimated vs actual rows.)
9. When would you choose a filtered index? (Hot subset, unique-where-not-deleted.)
10. A query got slower after a deployment: what is your Query Store workflow? (Regressed queries, compare plans, force the old one.)

## Skill-upgrade checklist

- [ ] Run the sample script, then load 1 million generated rows and watch the plans change.
- [ ] Create the covering index and confirm the Key Lookup disappears with `SET STATISTICS IO ON`.
- [ ] Break SARGability with `YEAR()` and with an `nvarchar` parameter on a `varchar` column; read the warning.
- [ ] Reproduce parameter sniffing with a skewed table and fix it three ways.
- [ ] Enable Query Store and force and unforce a plan.
- [ ] Run the fragmentation and missing-index queries on a real database and decide what you would not act on.

## Read next (official)

- [SQL Server index architecture and design guide](https://learn.microsoft.com/sql/relational-databases/sql-server-index-design-guide)
- [Create indexes with included columns](https://learn.microsoft.com/sql/relational-databases/indexes/create-indexes-with-included-columns)
- [Create filtered indexes](https://learn.microsoft.com/sql/relational-databases/indexes/create-filtered-indexes)
- [Maintain indexes: reorganize and rebuild](https://learn.microsoft.com/sql/relational-databases/indexes/reorganize-and-rebuild-indexes)
- [Query processing architecture guide](https://learn.microsoft.com/sql/relational-databases/query-processing-architecture-guide)
- [Best practices for monitoring workloads with Query Store](https://learn.microsoft.com/sql/relational-databases/performance/best-practice-with-the-query-store)
