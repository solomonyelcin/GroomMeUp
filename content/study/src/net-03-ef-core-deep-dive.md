# EF Core deep dive: senior study guide

**Who this is for:** an experienced .NET engineer who uses EF Core daily and must now explain what it does with each query and each `SaveChanges`, diagnose performance and concurrency problems, and run migrations safely in production. Targets EF Core 10 on .NET 10 (LTS). Notes mark what already exists in EF Core 8, because many teams are still on the .NET 8 line.

## What interviewers expect at senior level

- You can predict the SQL a LINQ query produces and spot N+1, cartesian explosion and client-side surprises.
- You know the change tracker well enough to say when tracking helps and when it only costs memory.
- You choose between EF, `ExecuteUpdate` and Dapper for a given job, with reasons.
- You handle concurrency, transient failures and transactions without double-writing.
- You describe a production migration process that does not run on app startup in every pod.

## DbContext lifetime, pooling and tracking

A `DbContext` is a unit of work: a short-lived, **not thread-safe** object that holds a connection lease, a change tracker and a model cache reference. Register it scoped (`AddDbContext`), one per web request. Do not share it between concurrent tasks (`Task.WhenAll` over one context throws or corrupts state), and do not keep it in a singleton. In background services and Blazor Server, create short-lived contexts from `IDbContextFactory<T>` (`AddDbContextFactory`).

`AddDbContextPool` reuses context instances and resets their state, which trims allocation on hot paths. It requires that the context holds no per-request state in its own fields; inject per-request data through the model's query filters via a service, not via constructor state you mutate.

| Question | Tracking query (default) | `AsNoTracking` |
| --- | --- | --- |
| Entities snapshotted for change detection | yes | no |
| Identity resolution (one instance per key) | yes | no, duplicates possible |
| Memory and CPU | higher | lower |
| Use for | load, modify, save | read-only endpoints, reports |

`AsNoTrackingWithIdentityResolution` gives de-duplicated graphs without tracking. Setting `QueryTrackingBehavior.NoTracking` as the context default and opting in with `AsTracking()` suits read-heavy APIs. `SaveChanges` runs `DetectChanges`, generates one batch of commands in a transaction, and stays atomic.

## Loading strategies, N+1 and projections

| Strategy | How | Danger |
| --- | --- | --- |
| Eager | `Include`, `ThenInclude`, filtered include | wide joins, duplicated parent data |
| Explicit | `db.Entry(x).Collection(c => c.Items).LoadAsync()` | extra round trip per call |
| Lazy | proxies plus virtual navigations | hidden N+1 inside loops; avoid by default |
| Projection | `Select` into a DTO | none, and usually best |

**N+1** means one query for the parents and one more per parent. It appears when a navigation is touched in a loop with lazy loading, or when you call the database inside `foreach`. Fix by `Include`, a projection or a batched `Where(x => ids.Contains(x.Id))`.

Projection selects only the columns you need and needs no tracking:

```csharp
var rows = await db.Orders
    .Where(o => o.CustomerId == customerId)
    .OrderByDescending(o => o.CreatedAt)
    .Select(o => new OrderRow(o.Id, o.CreatedAt, o.Lines.Sum(l => l.Quantity * l.UnitPrice)))
    .Take(50)
    .ToListAsync(ct);
```

**Split queries.** One query that includes several collections returns a cartesian product of their rows. `AsSplitQuery()` (or `UseQuerySplittingBehavior` globally) issues one SQL statement per collection instead. The trade-off: several round trips, and without a transaction at serializable or snapshot isolation the pieces can disagree if data changes between them. EF Core 10 made ordering consistent across split queries. Combine a split query with a projection when you can.

Also remember: `ToList()` before `Where` pulls everything into memory; `IQueryable` extends the SQL, `IEnumerable` filters in memory. Calling your own methods inside a predicate may fail to translate, and EF throws rather than silently filtering on the client in current versions.

## Compiled queries, query filters, owned and complex types, converters

**Compiled queries** cache the translated query delegate to skip repeated expression-tree work. EF already caches translations, so the gain is modest and only visible in tight hot paths. Measure first.

```csharp
static readonly Func<AppDbContext, int, Task<Order?>> ById =
    EF.CompileAsyncQuery((AppDbContext db, int id) =>
        db.Orders.SingleOrDefault(o => o.Id == id));

var order = await ById(db, 42);
```

**Global query filters** apply a predicate to every query for an entity, typical for soft delete and multi-tenancy. They are bypassed with `IgnoreQueryFilters()`, they interact surprisingly with required navigations (a filtered parent hides children, so mark filters consistently), and `ExecuteDelete` respects them. **EF Core 10 adds named filters**, so one entity can have both a tenant filter and a soft-delete filter and you disable just one:

```csharp
modelBuilder.Entity<Post>()
    .HasQueryFilter("SoftDelete", p => !p.IsDeleted)
    .HasQueryFilter("Tenant", p => p.TenantId == _tenantId);

var all = await db.Posts.IgnoreQueryFilters(["SoftDelete"]).ToListAsync();
```

**Owned types** (`OwnsOne`, `OwnsMany`) model value objects owned by an aggregate; by default they share the owner's table. **Complex types** (EF Core 8, extended in 10 with optional complex types and JSON mapping) are the modern choice for value objects: they have value semantics, can be assigned and compared by content, and in EF 10 work with `ExecuteUpdate`. Microsoft's guidance is to prefer complex types over owned entities when you do not need identity.

**Value converters** translate between the CLR type and the stored type: enums to strings, strongly typed IDs, encrypted columns.

```csharp
protected override void ConfigureConventions(ModelConfigurationBuilder b)
{
    b.Properties<OrderStatus>().HaveConversion<string>().HaveMaxLength(32);
}
```

For mutable types stored through a converter, supply a `ValueComparer`, otherwise changes inside the object go undetected.

## Concurrency, transactions and execution strategies

**Optimistic concurrency** uses a concurrency token, commonly a `rowversion` column (`[Timestamp]` on a `byte[]`) on SQL Server. `UPDATE ... WHERE Id = @id AND RowVersion = @old` affecting zero rows raises `DbUpdateConcurrencyException`. Decide the policy: client wins, database wins, or merge, using `entry.GetDatabaseValues()`. Return HTTP 409 or 412 to the caller with the current state. PostgreSQL uses the `xmin` system column as its token.

**Transactions.** One `SaveChanges` is already atomic. Use an explicit transaction to span several saves or raw SQL:

```csharp
var strategy = db.Database.CreateExecutionStrategy();
await strategy.ExecuteAsync(async () =>
{
    await using var tx = await db.Database.BeginTransactionAsync(ct);
    db.Accounts.Update(from); db.Accounts.Update(to);
    await db.SaveChangesAsync(ct);
    await tx.CommitAsync(ct);
});
```

`EnableRetryOnFailure` (for example `UseSqlServer(cs, o => o.EnableRetryOnFailure())`) retries transient errors, but a retry must replay the whole unit, so a user-started transaction **must** live inside `strategy.ExecuteAsync` as above. Retried work must be idempotent: if the commit succeeded but the acknowledgement was lost, the replay could write twice, so design with natural keys or an idempotency table.

## ExecuteUpdate, ExecuteDelete and raw SQL

`ExecuteUpdateAsync` and `ExecuteDeleteAsync` (EF Core 7) issue a single set-based statement, with no entity loading and no tracking:

```csharp
var n = await db.Products
    .Where(p => p.Discontinued && p.Stock == 0)
    .ExecuteUpdateAsync(s => s.SetProperty(p => p.IsArchived, true), ct);
```

They bypass the change tracker, `SaveChanges` interceptors and concurrency tokens, so do not use them where you rely on those. EF Core 10 lets `ExecuteUpdateAsync` take an ordinary lambda with conditional `SetProperty` calls.

**Raw SQL:** `FromSql($"...")` and `Database.ExecuteSql($"...")` turn interpolated values into parameters, which is safe. `FromSqlRaw` with concatenated strings is injectable. `Database.SqlQuery<T>` maps unmapped scalar and DTO results (EF Core 7 and 8). EF Core 10 adds an analyzer warning for string concatenation in raw SQL calls. **Dapper** is a good fit for reporting queries, bulk reads and hand-tuned SQL; it can share EF's connection via `db.Database.GetDbConnection()` and its transaction via `GetDbTransaction()`. Do not rewrite the whole app: mix the two.

## Migrations in production

`context.Database.Migrate()` at startup is convenient and risky: several pods race, the app needs schema-altering rights, and a failed migration crash-loops the service. EF Core 9 added a lock so concurrent `Migrate` calls are safer, but the practice is still discouraged. Prefer:

| Option | Command | Notes |
| --- | --- | --- |
| SQL script | `dotnet ef migrations script --idempotent` | reviewable by a DBA, safe to re-run |
| Migration bundle | `dotnet ef migrations bundle --self-contained -r linux-x64` | single executable, no SDK needed, run with `./efbundle --connection "..."` as a pipeline step |
| Startup `Migrate` | in code | acceptable for dev and demos only |

Practise **expand and contract**: add nullable column, deploy code that writes both, backfill, switch reads, then drop the old column in a later release. Never rename in one step while old pods still run. EF Core 9 and later throw if the model has pending changes not captured by a migration (`PendingModelChangesWarning`), which is a useful CI check. In EF Core 10 migrations are no longer all wrapped in one transaction, reverting an EF 9 change, so keep each migration safe to fail halfway.

## Performance checklist

- Project to DTOs and use `AsNoTracking` for reads; page with keyset pagination for deep pages.
- Filter, sort and aggregate in the database; avoid `ToList()` mid-query.
- Add indexes that match your `Where` and `OrderBy`; check execution plans, not just LINQ.
- Batch writes in one `SaveChanges`; use `ExecuteUpdate` for set-based changes.
- Use `AddDbContextPool` and a sensible connection pool size; dispose contexts promptly.
- Log slow queries (`LogTo`, or `EnableSensitiveDataLogging` only in development) and watch EF metrics.
- Beware `Contains` with huge lists; EF Core 10 parameterizes each element by default, which avoids plan-cache bloat, and you can pick another mode with `UseParameterizedCollectionMode`.

## Notable EF Core 8 to 10 additions

| Version | Highlights |
| --- | --- |
| EF Core 8 | complex types, primitive collections, raw SQL for unmapped types, `HierarchyId` and `DateOnly`/`TimeOnly` support |
| EF Core 9 | lock for concurrent `Migrate`, pending-model-change check, `UseSeeding`/`UseAsyncSeeding`, many LINQ translation improvements |
| EF Core 10 | named query filters, `LeftJoin`/`RightJoin` LINQ methods, optional complex types and JSON mapping, lambda `ExecuteUpdate`, SQL Server vector and `json` types, parameterized collections |

EF Core 10 needs the .NET 10 runtime; it does not run on older .NET versions. Confirm each item against the official what's-new pages before quoting it in an interview.

## Common traps and red flags

- One `DbContext` shared across parallel tasks, or registered as a singleton.
- Lazy loading enabled and a navigation read in a loop.
- `Include` of several collections with no split query, then a slow cartesian result.
- `FromSqlRaw` with string concatenation.
- `Migrate()` on startup in a scaled-out service, or running the app with a schema-owner login.
- `ExecuteUpdate` where an audit interceptor or concurrency token was expected.
- Retry strategy plus a manual transaction not wrapped in `ExecuteAsync`.
- Soft-delete filter forgotten in reports that use raw SQL.

## 10 questions to practise

1. Why is `DbContext` scoped and not thread-safe, and when do you use a factory? *Hint: unit of work, background work.*
2. What does tracking cost and when do you disable it? *Hint: snapshots, identity resolution, read-only paths.*
3. Explain N+1 and three ways to fix it. *Hint: include, projection, batching.*
4. When is a split query better and what can go wrong? *Hint: cartesian rows versus consistency.*
5. Are compiled queries worth it? *Hint: only on measured hot paths.*
6. How do global query filters work and how do named filters help? *Hint: tenant plus soft delete.*
7. Show how you would implement optimistic concurrency and report it to a client. *Hint: rowversion, 409.*
8. Why must transactions sit inside an execution strategy? *Hint: retry replays the unit.*
9. What does `ExecuteUpdate` skip compared with `SaveChanges`? *Hint: tracker, interceptors, tokens.*
10. Describe a zero-downtime migration process. *Hint: bundle in the pipeline, expand and contract.*

## Skill-upgrade checklist

- [ ] Reproduce an N+1 with logging on, then fix it with a projection and compare the SQL.
- [ ] Measure a collection-heavy query with single and split behaviour.
- [ ] Add a `rowversion` token and write a test that forces `DbUpdateConcurrencyException`.
- [ ] Enable `EnableRetryOnFailure` and wrap a user transaction in the execution strategy.
- [ ] Generate a migration bundle and run it from a pipeline step against a throwaway database.
- [ ] Replace a load-modify-save loop with `ExecuteUpdateAsync` and compare timings.
- [ ] Try named query filters for tenant and soft delete on a sample model.

## Read next (official)

- [Efficient querying](https://learn.microsoft.com/ef/core/performance/efficient-querying)
- [Single vs. split queries](https://learn.microsoft.com/ef/core/querying/single-split-queries)
- [Applying migrations](https://learn.microsoft.com/ef/core/managing-schemas/migrations/applying)
- [Advanced performance topics](https://learn.microsoft.com/ef/core/performance/advanced-performance-topics)
- [What's new in EF Core 10](https://learn.microsoft.com/ef/core/what-is-new/ef-core-10.0/whatsnew)
