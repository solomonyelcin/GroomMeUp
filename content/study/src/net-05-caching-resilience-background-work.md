# Caching, resilience and background work: senior study guide

**Who this is for:** an experienced .NET engineer who already ships ASP.NET Core services and now has to explain how they stay fast, survive flaky dependencies and run work outside the request path. Targets .NET 10 (LTS) with notes for the .NET 8 line, which many teams still run.

## What interviewers expect at senior level

- You pick a cache layer deliberately, state the invalidation story, and can explain a cache stampede and how to stop one.
- You configure timeouts, retries and circuit breakers as a system, not as three unrelated settings, and you know when a retry is dangerous.
- You treat every retry, redelivery and replay as a duplicate and design handlers to be idempotent.
- You can explain the outbox pattern and why "save, then publish" is a bug.
- You choose between `BackgroundService`, a channel, a job scheduler and a broker, and say what is lost on a crash.

## Caching layers

| Layer | Scope | Strength | Weakness |
| --- | --- | --- | --- |
| `IMemoryCache` | one process | fastest, no serialization, stores live objects | per instance, so replicas disagree; uses app memory |
| `IDistributedCache` (Redis, SQL Server) | shared | one copy for all pods, survives restarts | network hop, serialization, byte/string API only |
| `HybridCache` | L1 memory plus L2 distributed | both of the above, built-in stampede protection | newer API, you must think about L1 staleness across nodes |
| Output caching and HTTP caching | whole responses | skips the pipeline entirely | coarse; vary rules and invalidation need care |

**`IMemoryCache`.** Always bound it: set `SizeLimit` and give every entry a `Size`, otherwise a high-cardinality key space grows without limit. Use absolute expiration for correctness and sliding expiration only with an absolute cap, since a hot key with sliding expiry never dies. Do not cache mutable objects that callers might change. `GetOrCreateAsync` is **not** single-flight: two concurrent misses both run the factory.

**`HybridCache`** (`Microsoft.Extensions.Caching.Hybrid`, registered with `AddHybridCache()`, generally available since the .NET 9 era and usable on .NET 8) fronts an in-process L1 with whatever `IDistributedCache` you registered as L2 (usually Redis). Its `GetOrCreateAsync` coalesces concurrent callers for the same key so only one runs the factory, and it handles serialization for you. Tags let you evict groups with `RemoveByTagAsync`.

```csharp
builder.Services.AddStackExchangeRedisCache(o => o.Configuration = cs);
builder.Services.AddHybridCache(o =>
{
    o.DefaultEntryOptions = new HybridCacheEntryOptions
    {
        Expiration = TimeSpan.FromMinutes(10),       // L2
        LocalCacheExpiration = TimeSpan.FromMinutes(1) // L1, keep it short
    };
});

public async Task<ProductDto?> GetAsync(int id, CancellationToken ct) =>
    await cache.GetOrCreateAsync(
        $"product:{id}",
        async token => await repo.LoadAsync(id, token),
        tags: ["products"], cancellationToken: ct);
```

Keep L1 lifetimes short because evicting a key in Redis does not clear other pods' L1 copies.

**Redis in practice.** Use the multiplexer as a singleton (`StackExchange.Redis` is designed for one shared connection), set a key prefix per app and environment, and set a `maxmemory` policy such as `allkeys-lru` for a pure cache. Redis is single-threaded per shard for commands, so avoid huge values and `KEYS` scans.

## Invalidation, stampedes and failure modes

Cache-aside (read through the cache, load on miss, write to the store then remove the key) is the default. Delete on write rather than update, since a racing reader can re-insert a stale value after an update.

| Problem | What happens | Mitigation |
| --- | --- | --- |
| Stampede (thundering herd) | a hot key expires and hundreds of requests hit the database together | single-flight (`HybridCache`, per-key `SemaphoreSlim`/`Lazy<Task>`), early refresh, serve stale while one caller refreshes |
| Synchronized expiry | many keys set together expire together | add random jitter to TTLs |
| Penetration | requests for keys that never exist bypass the cache | cache negative results briefly, validate input |
| Stale data | consumer sees old value | short TTL, tag eviction, event-driven invalidation |
| Cache outage | every request falls through to the database | timeouts on the cache call, fail open with a circuit breaker, protect the database with a concurrency limit |

Treat cache failure as a degraded mode, never as a 500. A cache call should have a tight timeout of tens of milliseconds.

## Timeouts, retries and circuit breakers

On .NET 8 and later the supported library is **Polly v8**, surfaced through `Microsoft.Extensions.Resilience` and `Microsoft.Extensions.Http.Resilience`. The unit is a `ResiliencePipeline` built from strategies: timeout, retry, circuit breaker, hedging, fallback, rate limiter.

```csharp
builder.Services.AddHttpClient<PaymentsClient>(c => c.BaseAddress = new(url))
    .AddStandardResilienceHandler(o =>
    {
        o.Retry.MaxRetryAttempts = 2;
        o.Retry.DisableForUnsafeHttpMethods();        // no automatic POST retry
        o.AttemptTimeout.Timeout = TimeSpan.FromSeconds(3);
        o.TotalRequestTimeout.Timeout = TimeSpan.FromSeconds(10);
    });
```

The standard handler stacks, from outside in: rate limiter, total-request timeout, retry (exponential backoff with jitter), circuit breaker, then a per-attempt timeout. The defaults are sensible but generic, so tune them to the dependency's real latency. `AddStandardHedgingHandler` instead sends a second request to another endpoint when the first is slow, which suits idempotent reads. Use `AddResiliencePipeline` for non-HTTP work such as database or queue calls.

Rules worth stating in an interview:

- **Timeouts first.** Without a timeout, retries and breakers never see a failure. Pass the `CancellationToken` all the way down.
- **Retry only transient, idempotent failures**: 408, 429 (honour `Retry-After`), 5xx, connection resets. Never retry a 400 or a business error.
- **Backoff with jitter**, or clients retry in lockstep and prolong the outage. Cap total elapsed time.
- **Retries multiply.** Three layers each retrying three times means 27 calls against a struggling service. Retry at one layer only.
- **Circuit breaker** states: closed, open (fail fast), half-open (probe). It protects the dependency and your threads. Pair it with a fallback or a clear error.
- **Bulkheads** (concurrency limiters) stop one slow dependency from consuming every thread or connection.

## Idempotency and the outbox

At-least-once delivery is the realistic guarantee for HTTP retries and brokers. Exactly-once effects come from idempotent handlers.

**Idempotent API.** The client sends an `Idempotency-Key` header. The server stores the key with the response (or a "processing" marker) under a **unique constraint**, in the same transaction as the business write. A repeat returns the stored result. Natural idempotency also works: `PUT` semantics, upserts, and conditional updates such as `SET Status = 'Paid' WHERE Status = 'Pending'`.

**Outbox.** Writing to the database and then publishing a message is two systems, so a crash between them loses the event, and publishing first can announce something that rolls back. Instead, insert the message into an `Outbox` table inside the same transaction as the state change. A separate relay (a `BackgroundService` polling, or change data capture) reads unsent rows, publishes, then marks them sent. A relay crash after publish but before marking sent causes a duplicate, so consumers need an **inbox** (a processed-message-id table) or idempotent logic. Frameworks such as MassTransit and NServiceBus ship outbox features; check current licence terms before adopting one.

## Background work in .NET

| Tool | Durable | Good for | Notes |
| --- | --- | --- | --- |
| `BackgroundService` | no | polling loops, relays, consumers | runs in-process; dies with the pod |
| `Channel<T>` | no | in-process producer/consumer hand-off | bounded for back-pressure; queue is lost on crash |
| Hangfire | yes (SQL, Redis) | fire-and-forget, delayed, recurring jobs, dashboard | retries built in; jobs must be idempotent |
| Quartz.NET | yes (ADO job store) | cron schedules, clustered scheduling | more control over triggers and misfire policy |
| Broker consumer | yes | cross-service work, load levelling | at-least-once, dead-letter queues |

**`BackgroundService` rules.** Override `ExecuteAsync`, honour the stopping token, and catch exceptions inside the loop: since .NET 6 an unhandled exception stops the host by default (`BackgroundServiceExceptionBehavior.StopHost`). Hosted services are singletons, so create a scope with `IServiceScopeFactory` for scoped services such as `DbContext`. Use `PeriodicTimer` rather than `Task.Delay` in a loop to avoid drift. On shutdown the host waits up to `HostOptions.ShutdownTimeout` (30 seconds by default in current versions) and then abandons work, so finish or checkpoint quickly. A scaled-out service runs the loop in every replica: use a database lock, leader election or a scheduler with clustering for singleton jobs.

```csharp
var channel = Channel.CreateBounded<Job>(new BoundedChannelOptions(500)
{
    FullMode = BoundedChannelFullMode.Wait, SingleReader = true
});

protected override async Task ExecuteAsync(CancellationToken ct)
{
    await foreach (var job in channel.Reader.ReadAllAsync(ct))
    {
        try { await HandleAsync(job, ct); }
        catch (Exception ex) when (ex is not OperationCanceledException)
        { logger.LogError(ex, "Job {Id} failed", job.Id); }
    }
}
```

A bounded channel applies back-pressure: `WriteAsync` waits when full, so producers slow down instead of memory growing. Choose `DropOldest` or `DropWrite` only when losing items is acceptable.

## Message queue basics

- **Queue vs topic.** A queue gives competing consumers (each message to one worker); a topic or exchange fans out to subscribers.
- **Ack and redelivery.** A message is removed only after the consumer acknowledges. Crash before ack means redelivery, hence duplicates. Azure Service Bus uses a peek-lock; RabbitMQ uses manual acks and prefetch.
- **Poison messages.** After N failed deliveries move the message to a dead-letter queue and alert, rather than blocking the queue.
- **Ordering** is guaranteed only within a partition, session or single consumer; parallel consumers break global order.
- **Back-pressure.** Limit prefetch and concurrency to what the database behind the handler can absorb.
- **Schema evolution.** Version messages and tolerate unknown fields.

## Common traps and red flags

- `GetOrCreateAsync` on `IMemoryCache` assumed to be single-flight.
- Unbounded memory cache keyed by user input.
- Retrying `POST` without an idempotency key, or stacking retries in client, handler and gateway.
- No timeout on `HttpClient` calls (the default is 100 seconds) and no cancellation token.
- Publishing to a broker after `SaveChanges` with nothing guarding the gap.
- `BackgroundService` that swallows nothing and takes the host down, or swallows everything and spins.
- Using `Task.Run` or fire-and-forget inside a request for work that must not be lost.
- Scheduled job running in all replicas and double-charging.

## 10 questions to practise

1. When would you pick `HybridCache` over `IMemoryCache` or raw Redis? *Hint: L1 plus L2, stampede protection, tags.*
2. What is a cache stampede and three ways to prevent it? *Hint: single-flight, jitter, serve stale.*
3. How do you invalidate a cache across several pods? *Hint: short L1 TTL, tags, events, delete on write.*
4. Walk through what `AddStandardResilienceHandler` adds and why the order matters. *Hint: total timeout, retry, breaker, attempt timeout.*
5. When is retrying unsafe? *Hint: non-idempotent calls, non-transient errors, retry amplification.*
6. Describe the three circuit breaker states and what the caller sees when open. *Hint: fail fast, probe, fallback.*
7. How do you make a payment endpoint idempotent? *Hint: key, unique constraint, same transaction, stored response.*
8. Explain the outbox pattern and what duplicates it still allows. *Hint: same transaction, relay, inbox.*
9. A `BackgroundService` crashes the app at 3 a.m. Why, and how do you fix it? *Hint: unhandled exception behaviour, loop-level try/catch.*
10. Channel, Hangfire or a broker for sending 50,000 emails? *Hint: durability, retries, scale-out, rate limits.*

## Skill-upgrade checklist

- [ ] Reproduce a stampede with a load test, then fix it with `HybridCache` and compare database calls.
- [ ] Add Redis as L2 and watch two local instances disagree on L1 until the TTL passes.
- [ ] Configure a standard resilience handler and test it against a stub that returns 503, 429 and slow responses.
- [ ] Implement an idempotency-key filter with a unique index and a concurrent duplicate test.
- [ ] Build an outbox table with a polling relay and kill the process between publish and mark-sent.
- [ ] Write a `BackgroundService` consuming a bounded channel with graceful shutdown.
- [ ] Run a Hangfire or Quartz job in two instances and prove only one executes it.

## Read next (official)

- [Caching overview in ASP.NET Core](https://learn.microsoft.com/aspnet/core/performance/caching/overview)
- [HybridCache library in ASP.NET Core](https://learn.microsoft.com/aspnet/core/performance/caching/hybrid)
- [Build resilient HTTP apps](https://learn.microsoft.com/dotnet/core/resilience/http-resilience)
- [Introduction to resilient app development](https://learn.microsoft.com/dotnet/core/resilience/)
- [Background tasks with hosted services](https://learn.microsoft.com/aspnet/core/fundamentals/host/hosted-services)
- [System.Threading.Channels](https://learn.microsoft.com/dotnet/core/extensions/channels)
