# Async, tasks and concurrency in C#: senior interview guide

**Who this is for:** a .NET engineer with about 10 years of experience who writes async code every day and must explain what the compiler and thread pool actually do, and how production systems fail. Applies to .NET 8 and .NET 10 (LTS). Items that need .NET 9 or later are marked.

## What interviewers expect at senior level

- You describe `async/await` as a state machine plus continuations, not as "running on another thread".
- You diagnose thread-pool starvation and deadlocks from symptoms, and you know the fix is "async all the way", not more threads.
- You choose between `Task.WhenAll`, `Parallel.ForEachAsync`, `Channel<T>` and `SemaphoreSlim` for a given workload.
- You pick the lightest correct synchronisation primitive and never hold a lock across an `await`.

## How async/await works

The compiler rewrites an `async` method into a state machine (a struct in Release builds, to avoid an allocation when the method completes synchronously). The method runs synchronously until it hits an `await` on something that is not yet complete. At that point it registers the rest of the method as a continuation, returns an incomplete `Task` to the caller, and the thread goes back to doing other work. No thread waits for the I/O.

```csharp
static async Task Demo()
{
    Console.WriteLine("A");
    await Task.Delay(10);
    Console.WriteLine("C");
}

var t = Demo();
Console.WriteLine("B");
await t;
// A
// B
// C
```

Key consequences: an async method that never awaits an incomplete task runs entirely synchronously. Exceptions thrown inside are stored in the returned `Task`, so even an argument check surfaces at the `await`, not at the call. Where the continuation resumes depends on the captured `SynchronizationContext` or `TaskScheduler`. ASP.NET Core has no `SynchronizationContext`, so it resumes on a thread-pool thread.

## Task versus ValueTask

| | `Task<T>` | `ValueTask<T>` |
| --- | --- | --- |
| Allocation | One object per call (cached for some results) | None when the result is already available |
| Await many times | Yes | No, only once |
| Await concurrently, or block with `.Result` | Allowed (not advised) | Not allowed |
| Default choice | Yes | Only for hot paths that often complete synchronously, and interface methods where implementations may |

```csharp
public ValueTask<User> GetAsync(int id) =>
    _cache.TryGetValue(id, out var user)
        ? new ValueTask<User>(user)              // no allocation on a cache hit
        : new ValueTask<User>(LoadAsync(id));    // falls back to a real Task
```

If you need to await twice or store it, call `.AsTask()` once. Measure before adopting it, because misuse bugs are subtle.

## ConfigureAwait and cancellation

`ConfigureAwait(false)` says "do not resume on the captured context". It matters in library code that may be called from UI or legacy ASP.NET (with a context). In ASP.NET Core application code it does nothing useful, so most teams only apply it in shared libraries. .NET 8 added `ConfigureAwait(ConfigureAwaitOptions)` with `SuppressThrowing` and `ForceYielding`.

Cancellation is cooperative. The caller owns a `CancellationTokenSource`, the callee observes the token.

```csharp
using var cts = new CancellationTokenSource(TimeSpan.FromMilliseconds(50));
try
{
    await Task.Delay(TimeSpan.FromSeconds(5), cts.Token);
}
catch (OperationCanceledException)   // TaskCanceledException derives from it
{
    Console.WriteLine("cancelled");  // cancelled
}
```

Rules: accept a token on every public async method and pass it down; link tokens with `CancellationTokenSource.CreateLinkedTokenSource` (timeout plus caller); dispose sources you create; treat `OperationCanceledException` as normal flow, not as an error to log. `task.WaitAsync(timeout, token)` (.NET 6) abandons waiting but does not stop the underlying work.

## Sync over async, deadlocks and starvation

Blocking on a task (`.Result`, `.Wait()`, `GetAwaiter().GetResult()`) fails in two ways:

- **Deadlock** where a `SynchronizationContext` exists (WinForms, WPF, legacy ASP.NET): the blocked thread owns the context, the continuation needs that same context, and neither can proceed.
- **Thread-pool starvation** everywhere, including ASP.NET Core: each blocked request holds a pool thread while its continuation needs another. The pool adds threads only slowly once it passes its minimum, so latency climbs and requests time out while CPU stays low.

```csharp
// UI event handler: deadlocks
void Button_Click(object s, EventArgs e) { var data = LoadAsync().Result; Show(data); }

// Fix: async all the way
async void Button_Click(object s, EventArgs e) { Show(await LoadAsync()); }  // allowed: it is an event handler
```

Symptoms of starvation: high request latency, low CPU, a growing thread count, and `dotnet-counters` showing a large thread-pool queue length. `Task.Run(() => Sync())` inside a web request only moves the blocking to another pool thread, it does not fix it.

`async void` is for event handlers only. An exception escaping it cannot be caught by the caller and tears down the process (or is raised on the captured context). Fire-and-forget `Task`s hide failures: capture and log them, or use a queue or `BackgroundService`.

When you build a `TaskCompletionSource`, pass `TaskCreationOptions.RunContinuationsAsynchronously` so completing it does not run continuations inline on your thread.

## WhenAll, WhenAny, Parallel.ForEachAsync

`Task.WhenAll` starts nothing, it only awaits tasks already running, so create them first. When several fail, `await` rethrows just one exception, and the full set is on the task.

```csharp
static async Task Fail(string m) { await Task.Yield(); throw new InvalidOperationException(m); }

var all = Task.WhenAll(Fail("one"), Fail("two"));
try { await all; }
catch (Exception e)
{
    Console.WriteLine(e is InvalidOperationException);       // True
    Console.WriteLine(all.Exception!.InnerExceptions.Count); // 2
}
```

`Task.WhenAny` returns the first task to finish, useful for racing, but the losers keep running unless you cancel them. For a timeout prefer `WaitAsync(TimeSpan)`. `Task.WhenEach` (.NET 9) yields tasks as they complete, replacing the old loop of `WhenAny` calls that was quadratic.

`Parallel.ForEachAsync` (.NET 6) runs an async body with a bounded degree of parallelism and cancellation. Use `Parallel.For` for CPU-bound work and `ForEachAsync` for I/O:

```csharp
await Parallel.ForEachAsync(ids,
    new ParallelOptions { MaxDegreeOfParallelism = 4, CancellationToken = ct },
    async (id, token) => await ProcessAsync(id, token));
```

## Channels and throttling

`Channel<T>` is an async-friendly producer and consumer queue. A bounded channel applies back-pressure: `WriteAsync` waits when it is full.

```csharp
using System.Threading.Channels;

var channel = Channel.CreateBounded<int>(new BoundedChannelOptions(2)
    { FullMode = BoundedChannelFullMode.Wait });

var producer = Task.Run(async () =>
{
    for (int i = 1; i <= 3; i++) await channel.Writer.WriteAsync(i);
    channel.Writer.Complete();
});

await foreach (var item in channel.Reader.ReadAllAsync()) Console.Write(item + " ");
await producer;
// 1 2 3
```

`SemaphoreSlim` limits concurrency across async code, because `WaitAsync` does not block a thread. Always release in `finally`:

```csharp
private readonly SemaphoreSlim _gate = new(5);
public async Task<string> CallAsync(string url, CancellationToken ct)
{
    await _gate.WaitAsync(ct);
    try { return await _http.GetStringAsync(url, ct); }
    finally { _gate.Release(); }
}
```

## lock, Interlocked and System.Threading.Lock

| Tool | Use for | Notes |
| --- | --- | --- |
| `Interlocked` | One counter or reference swap | Lock-free, fastest |
| `lock` on a private object | Short critical sections over several fields | Monitor-based, cannot contain `await` (compile error CS1996) |
| `System.Threading.Lock` (.NET 9, C# 13) | Same as `lock`, cheaper | `lock (_gate)` on a `Lock` instance uses `EnterScope`. Not available on .NET 8. |
| `SemaphoreSlim` | Async-compatible mutual exclusion or throttling | Heavier, needs `try/finally` |
| `ReaderWriterLockSlim` | Many reads, rare writes | Easy to misuse, measure first |

```csharp
int counter = 0;
Parallel.For(0, 1000, _ => Interlocked.Increment(ref counter));
Console.WriteLine(counter);   // 1000 (a plain counter++ would lose updates)

private readonly Lock _gate = new();      // .NET 9+
public void Add() { lock (_gate) { _items++; } }
```

Never lock on `this`, a `Type` or a string: other code can lock the same object. Keep critical sections tiny and never call unknown code inside them. Lock-ordering deadlocks need one global acquisition order.

## ConcurrentDictionary.GetOrAdd pitfalls

`GetOrAdd(key, factory)` is atomic for the dictionary, not for the factory. Under a race the factory may run several times, only one result is stored, and the others are discarded. Expensive or side-effecting factories therefore misbehave. Cache a `Lazy<>` so only one factory runs:

```csharp
var cache = new ConcurrentDictionary<string, Lazy<Task<string>>>();
Task<string> Get(string key) =>
    cache.GetOrAdd(key, k => new Lazy<Task<string>>(() => LoadAsync(k))).Value;
```

Also remember that a cached faulted `Task` stays faulted, and the overload `GetOrAdd(key, static (k, arg) => ..., arg)` avoids a closure allocation.

## Async streams

`IAsyncEnumerable<T>` lets a producer yield items as they become available. Use `[EnumeratorCancellation]` so a token passed through `WithCancellation` reaches the method.

```csharp
static async IAsyncEnumerable<int> Count([EnumeratorCancellation] CancellationToken ct = default)
{
    for (int i = 1; i <= 3; i++)
    {
        await Task.Delay(10, ct);
        yield return i;
    }
}

await foreach (var n in Count()) Console.Write(n + " ");
// 1 2 3
```

ASP.NET Core can return an `IAsyncEnumerable<T>` from an endpoint and stream the JSON array. In EF Core use `AsAsyncEnumerable()` for the same effect over query results.

## Common traps and red flags

- `.Result` or `.Wait()` in request code, or `Task.Run` wrapped around synchronous I/O in ASP.NET Core.
- `async void` outside event handlers, and un-awaited tasks.
- `await` inside `lock`, or locking on `this`.
- Passing no `CancellationToken`, or swallowing `OperationCanceledException` as an error.
- Unbounded `Task.WhenAll` over thousands of items with no throttling.
- Assuming `ConcurrentDictionary` makes compound operations (check then add) atomic.
- Using `ValueTask` twice or blocking on it.

## 10 questions to practise

1. What does `await` do to the calling thread? (Releases it, registers a continuation.)
2. Why can `.Result` deadlock in WPF but not in ASP.NET Core, and what still goes wrong there? (Context capture versus starvation.)
3. How would you prove thread-pool starvation in production? (`dotnet-counters`, queue length, dumps.)
4. `Task` or `ValueTask` for a cached lookup? (ValueTask if measured, with its single-await rules.)
5. What does `Task.WhenAll` throw when three tasks fail? (One exception, all in `Exception.InnerExceptions`.)
6. Design a pipeline that reads 1 million IDs and calls an API with at most 10 in flight. (Bounded channel plus workers, or `Parallel.ForEachAsync`.)
7. `lock`, `Interlocked`, `SemaphoreSlim`: how do you choose? (Scope, async need, cost.)
8. Why might `GetOrAdd` run a factory twice? (Factory is outside the dictionary lock.)
9. Why is `async void` dangerous? (Cannot await or catch, crashes the process.)
10. How do you cancel a long async stream correctly? (Token, `[EnumeratorCancellation]`, `WithCancellation`.)

## Skill-upgrade checklist

- [ ] Reproduce a starvation scenario with a sync-over-async endpoint and watch it with `dotnet-counters`.
- [ ] Write a bounded `Channel<T>` pipeline with several consumers and clean shutdown on cancellation.
- [ ] Add a timeout plus caller token using a linked source and `WaitAsync`.
- [ ] Replace a `lock` with `System.Threading.Lock` in a .NET 9+ project and note the difference.
- [ ] Write a `GetOrAdd` cache that runs the factory exactly once.
- [ ] Decompile a small async method (ILSpy or sharplab.io) and find `MoveNext` and the state field.

## Read next (official)

- [Asynchronous programming scenarios](https://learn.microsoft.com/dotnet/csharp/asynchronous-programming/async-scenarios)
- [Task asynchronous programming model](https://learn.microsoft.com/dotnet/csharp/asynchronous-programming/task-asynchronous-programming-model)
- [Channels](https://learn.microsoft.com/dotnet/core/extensions/channels)
- [Cancellation in managed threads](https://learn.microsoft.com/dotnet/standard/threading/cancellation-in-managed-threads)
- [Generate and consume async streams](https://learn.microsoft.com/dotnet/csharp/asynchronous-programming/generate-consume-asynchronous-stream)
- [The lock statement](https://learn.microsoft.com/dotnet/csharp/language-reference/statements/lock)
