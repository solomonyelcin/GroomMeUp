# SQL Server transactions, isolation and locking: senior study guide

**Who this is for:** an experienced .NET engineer who writes data-heavy services against SQL Server and must explain what a transaction really guarantees, why a deadlock happened, and how to choose an isolation level and concurrency strategy. Applies to SQL Server 2019 to 2025 and Azure SQL; notes mark version differences.

## What interviewers expect at senior level

- You explain ACID in terms of mechanisms (the log, locks, row versions), not slogans.
- You name each isolation level, the anomalies it allows and what it costs, and you know the SQL Server default.
- You can read a deadlock graph and give several different fixes, in order of preference.
- You choose optimistic or pessimistic concurrency with reasons, and implement both correctly.
- You write error handling that never leaves a transaction open, and you know why distributed transactions are a last resort.

## ACID in practice

| Property | Mechanism in SQL Server |
| --- | --- |
| Atomicity | the transaction log lets the engine undo uncommitted work after an error or crash |
| Consistency | constraints, keys and triggers reject invalid states; the rest is your application's invariants |
| Isolation | locks, or row versions, control what concurrent transactions see |
| Durability | write-ahead logging: a commit returns only after the log record is hardened to disk (unless delayed durability is on) |

Every statement runs in a transaction. By default SQL Server uses **autocommit**: each statement commits itself. `BEGIN TRANSACTION` starts an explicit one and `@@TRANCOUNT` tracks nesting. Nested `BEGIN TRAN` is only a counter: an inner `COMMIT` just decrements it, and a `ROLLBACK` undoes **everything** and sets the count to zero. Treat nesting as bookkeeping, not as independent units. Keep transactions short, never wait for user input inside one, and keep network calls out of them.

## Isolation levels and anomalies

The anomalies: **dirty read** (see uncommitted data), **non-repeatable read** (same row read twice gives different values), **phantom** (a repeated range query returns new rows) and **lost update** (two read-modify-write cycles overwrite each other). Write skew is a further anomaly possible under snapshot isolation.

| Level | Dirty | Non-repeatable | Phantom | How |
| --- | --- | --- | --- | --- |
| READ UNCOMMITTED | possible | possible | possible | no shared locks (same as `NOLOCK`) |
| READ COMMITTED (default, locking) | no | possible | possible | shared locks released after each read |
| READ COMMITTED SNAPSHOT (RCSI) | no | possible | possible | statement-level row versions, readers do not block |
| REPEATABLE READ | no | no | possible | shared locks held to end of transaction |
| SNAPSHOT | no | no | no | transaction-level row versions |
| SERIALIZABLE | no | no | no | key-range locks, or `HOLDLOCK` |

`NOLOCK` is a sloppy answer: it can skip rows, read rows twice and return data that never existed. Prefer RCSI.

**RCSI and snapshot.** Both use row versioning, with old versions kept in the version store (in `tempdb` by default, or in the user database when Accelerated Database Recovery is on). Readers never block writers and writers never block readers, which removes most reader/writer deadlocks.

```sql
ALTER DATABASE Shop SET READ_COMMITTED_SNAPSHOT ON;   -- changes the default behaviour of READ COMMITTED
ALTER DATABASE Shop SET ALLOW_SNAPSHOT_ISOLATION ON;  -- allows SET TRANSACTION ISOLATION LEVEL SNAPSHOT
```

Azure SQL Database has RCSI on by default; on-premises SQL Server defaults to locking read committed. Costs and caveats: more `tempdb` or version-store load and long-running transactions that stop version cleanup; writers still block writers; under **snapshot** an update to a row changed since your snapshot began fails with error 3960 and you must retry; and logic that relied on readers blocking (for example a check-then-insert) may now race and needs a lock hint or constraint. RCSI semantics also mean a statement sees data as of statement start, not transaction start.

## Locks

Lock granularity is row (key), page or table. Modes: **shared (S)** for reads, **exclusive (X)** for writes, **update (U)** to read-then-write without deadlocking on conversion, and **intent (IS, IX, SIX)** placed on higher levels to signal lower-level locks. **Schema locks** (Sch-S, Sch-M) protect DDL; `Sch-M` blocks everything. Compatibility is the key idea: S is compatible with S but not with X.

**Lock escalation** converts many fine locks to one table lock, triggered around 5,000 locks held by one statement, causing sudden blocking. Mitigate with batching, better indexes, and `ALTER TABLE ... SET (LOCK_ESCALATION = AUTO)` for partitioned tables. Newer engines (SQL Server 2025, Azure SQL) add **optimized locking**, which uses transaction-ID locking and lock-after-qualification to cut lock memory and blocking; check availability before relying on it.

Hints and tools:

| Tool | Purpose |
| --- | --- |
| `UPDLOCK` | take U locks when reading so a later update will not deadlock on conversion |
| `HOLDLOCK` / `SERIALIZABLE` | hold range locks to stop phantoms (check-then-insert) |
| `READPAST` | skip locked rows, ideal for a work-queue table |
| `ROWLOCK`, `TABLOCKX` | force granularity; rarely wise |
| `sp_getapplock` | named application lock, useful for singleton jobs |
| `sys.dm_tran_locks`, `sys.dm_exec_requests` | see who holds and who waits; blocking chain analysis |

Queue pattern:

```sql
WITH next AS (
  SELECT TOP (1) * FROM dbo.Jobs WITH (UPDLOCK, READPAST, ROWLOCK)
  WHERE Status = 'Pending' ORDER BY Id)
UPDATE next SET Status = 'Running', StartedAt = SYSUTCDATETIME()
OUTPUT inserted.Id, inserted.Payload;
```

**Blocking is not deadlock.** Blocking is a wait that ends when the holder finishes. Diagnose with `sp_whoisactive` or `sys.dm_exec_requests`, find the head blocker, and ask why its transaction is long (missing index causing scans, open transaction from the client, lock escalation).

## Deadlocks

A deadlock is a cycle of waits: session A holds a lock B needs while B holds one A needs. SQL Server's monitor detects it, picks a **victim** (lowest cost, or lowest `SET DEADLOCK_PRIORITY`) and rolls it back with **error 1205**. Capture the deadlock graph from the `system_health` extended event session, a dedicated XE session, or trace flag 1222; the graph shows resources, lock modes and the statements involved.

Fixes, roughly in order of preference:

1. **Shorten transactions** and move slow work (HTTP calls, big computations) outside them.
2. **Access objects in the same order** in every code path (parent before child, lower id before higher id).
3. **Add or fix indexes** so statements touch only the rows they need; scans lock more.
4. **Enable RCSI** to remove reader/writer conflicts.
5. **Use `UPDLOCK`** on the initial read of a read-then-update to avoid S-to-X conversion deadlocks.
6. **Reduce lock footprint**: batch large updates, avoid escalation.
7. **Retry** on error 1205 with a short randomized backoff. This is a safety net, not the cure, and the retried unit must be idempotent. In .NET the check is `SqlException.Number == 1205`; EF Core's SQL Server execution strategy (`EnableRetryOnFailure`) treats 1205 as transient, but a hand-written ADO.NET or Dapper path needs its own retry.

## Optimistic versus pessimistic concurrency

| | Pessimistic | Optimistic |
| --- | --- | --- |
| Idea | lock first, then work | work, then detect conflict on write |
| Tools | `UPDLOCK`, `SELECT ... WITH (UPDLOCK, HOLDLOCK)`, `sp_getapplock`, SERIALIZABLE | `rowversion`, version column, snapshot isolation |
| Best when | high contention on few rows (inventory counter, seat booking) | low contention, long user think time, web forms |
| Cost | blocking, deadlock risk | retries or failed saves when conflicts occur |

**`rowversion`** is an 8-byte value SQL Server changes automatically on every row update (the older name was `timestamp`; it has nothing to do with time). Pattern:

```sql
UPDATE dbo.Orders
SET Status = @status
WHERE Id = @id AND RowVer = @rowVer;      -- @rowVer is what the client read

IF @@ROWCOUNT = 0
    THROW 50001, 'Row was changed by another user or deleted.', 1;
```

EF Core maps it with `[Timestamp]` or `IsRowVersion()` and throws `DbUpdateConcurrencyException`; surface it as HTTP 409 or 412 with an `ETag`/`If-Match` flow. For hot counters prefer an atomic statement (`UPDATE ... SET Stock = Stock - @n WHERE Id = @id AND Stock >= @n`) over any read-modify-write: it needs neither version nor explicit lock.

## Error handling: TRY/CATCH, XACT_ABORT and savepoints

Without `SET XACT_ABORT ON`, many run-time errors abort only the statement and leave the transaction open and holding locks, and a client timeout can leave a connection with an orphaned open transaction. Turn it on in procedures that open transactions. Then check `XACT_STATE()` in the `CATCH`: `1` committable, `-1` doomed (you can only roll back), `0` none.

```sql
CREATE OR ALTER PROCEDURE dbo.Transfer @from int, @to int, @amt decimal(18,2)
AS
BEGIN
  SET NOCOUNT, XACT_ABORT ON;
  BEGIN TRY
    BEGIN TRAN;
      UPDATE dbo.Account SET Balance -= @amt WHERE Id = @from AND Balance >= @amt;
      IF @@ROWCOUNT = 0 THROW 50002, 'Insufficient funds', 1;
      UPDATE dbo.Account SET Balance += @amt WHERE Id = @to;
    COMMIT;
  END TRY
  BEGIN CATCH
    IF XACT_STATE() <> 0 ROLLBACK;
    THROW;                       -- re-raise with original number and message
  END CATCH
END
```

Use `THROW` rather than `RAISERROR` to re-raise; `THROW` keeps the original error and, with `XACT_ABORT ON`, ends the batch. Note that `THROW` requires the previous statement to end with a semicolon.

**Savepoints** allow partial rollback: `SAVE TRANSACTION sp1;` then `ROLLBACK TRANSACTION sp1;` undoes work since the savepoint while the outer transaction continues. Use them for "try this optional step, keep the rest". Locks acquired before the savepoint stay. They are not allowed in distributed transactions. Remember a plain `ROLLBACK` always rolls back to the outermost `BEGIN`.

## Transactions from .NET and distributed caveats

`TransactionScope` defaults to **Serializable** isolation, a classic trap: pass `new TransactionOptions { IsolationLevel = IsolationLevel.ReadCommitted }` and `TransactionScopeAsyncFlowOption.Enabled` (otherwise it breaks across `await`). Opening a second connection inside a scope may **promote** it to a distributed transaction coordinated by MSDTC. Modern .NET supports promotion to MSDTC only on Windows (added in .NET 7), so on Linux containers a promoted scope throws instead of coordinating. With EF Core, use `Database.BeginTransactionAsync(IsolationLevel.ReadCommitted)` and keep to one connection.

Distributed transactions (two-phase commit) hold locks while waiting for the coordinator, hurt availability, and need every resource manager to support them; message brokers and HTTP APIs do not. Prefer: a **single database transaction** where possible; the **outbox** to publish events reliably; **sagas** with compensating actions for multi-service workflows; and idempotent consumers. Cross-database transactions on one instance work (they are local), but across Always On availability groups or Azure SQL logical servers have restrictions.

## Common traps and red flags

- Using `NOLOCK` everywhere to "fix" blocking.
- Check-then-insert with no unique constraint or `HOLDLOCK`, creating duplicates under concurrency.
- Long transactions that wrap HTTP calls or user interaction.
- `TransactionScope` with default Serializable isolation, or without async flow.
- `CATCH` block that logs but never rolls back, or `XACT_ABORT` left off.
- Retrying deadlocks with non-idempotent side effects.
- Assuming RCSI changes nothing: logic that relied on blocking now races.
- Ignoring the `rowversion` result (`@@ROWCOUNT = 0`) so updates silently do nothing.

## 10 questions to practise

1. Explain ACID and which part depends on the transaction log. *Hint: atomicity and durability, write-ahead logging.*
2. List isolation levels and the anomaly each removes. *Hint: dirty, non-repeatable, phantom.*
3. What does RCSI change versus the default, and what does it cost? *Hint: row versions, tempdb, no reader blocking.*
4. Why can snapshot isolation fail an update, and what is write skew? *Hint: error 3960, disjoint rows with a shared rule.*
5. Why is `NOLOCK` dangerous? *Hint: missed or duplicate rows, uncommitted data.*
6. How does a deadlock differ from blocking, and how do you read a deadlock graph? *Hint: cycle, victim, resources and modes.*
7. Give four ways to prevent deadlocks. *Hint: order, short transactions, indexes, RCSI, `UPDLOCK`.*
8. Design optimistic concurrency with `rowversion` through to the HTTP response. *Hint: `@@ROWCOUNT`, 409, ETag.*
9. What do `XACT_ABORT` and `XACT_STATE()` do in a CATCH block? *Hint: doomed transactions, rollback, `THROW`.*
10. Why avoid distributed transactions and what replaces them? *Hint: 2PC locks, MSDTC, outbox, saga.*

## Skill-upgrade checklist

- [ ] Reproduce dirty read, non-repeatable read and phantom with two query windows at each level.
- [ ] Turn on RCSI on a test database and repeat a reader/writer block to see it vanish.
- [ ] Create a deadlock on purpose, capture the graph from `system_health` and fix it two ways.
- [ ] Implement a `READPAST` work queue and run several consumers against it.
- [ ] Add a `rowversion` column and write a test that triggers the conflict path.
- [ ] Write a stored procedure with `XACT_ABORT`, `TRY/CATCH` and a savepoint, and test failure at each step.
- [ ] Check what isolation level your `TransactionScope` code actually uses with `DBCC USEROPTIONS`.

## Read next (official)

- [Transaction locking and row versioning guide](https://learn.microsoft.com/sql/relational-databases/sql-server-transaction-locking-and-row-versioning-guide)
- [SET TRANSACTION ISOLATION LEVEL](https://learn.microsoft.com/sql/t-sql/statements/set-transaction-isolation-level-transact-sql)
- [Deadlocks guide](https://learn.microsoft.com/sql/relational-databases/sql-server-deadlocks-guide)
- [SET XACT_ABORT](https://learn.microsoft.com/sql/t-sql/statements/set-xact-abort-transact-sql)
- [SAVE TRANSACTION](https://learn.microsoft.com/sql/t-sql/language-elements/save-transaction-transact-sql)
- [Transactions in ADO.NET and System.Transactions](https://learn.microsoft.com/dotnet/framework/data/transactions/)
