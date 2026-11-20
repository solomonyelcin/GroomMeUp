# Generics, delegates, LINQ and collections: senior interview guide

**Who this is for:** a .NET engineer with about 10 years of experience who uses these features daily and must now explain their mechanics, costs and failure modes in an interview. Applies to .NET 8 and .NET 10 (LTS) unless noted.

## What interviewers expect at senior level

- You explain generics as a run-time feature (reified), including variance and static abstract members.
- You predict what a closure captures and when a LINQ query actually runs.
- You can say whether a query runs in the database or in memory, and why that matters.
- You pick a collection from its complexity, thread-safety and lifetime (build once, read many) rather than defaulting to `List` and `Dictionary`.
- You implement comparers correctly and know they must agree with each other.

## Generics

Generics in .NET are reified: `List<int>` and `List<string>` are distinct run-time types. For value-type arguments the JIT produces specialised code (no boxing). Reference-type arguments share one compiled body. That is why `List<int>` has no boxing cost but `List<object>` holding ints does.

| Constraint | Meaning |
| --- | --- |
| `where T : class` / `struct` | Reference type / non-nullable value type |
| `where T : new()` | Public parameterless constructor, enables `new T()` |
| `where T : BaseType` or `IFoo` | Inherits or implements, enables calling members |
| `where T : notnull` | Not a nullable type |
| `where T : unmanaged` | Struct with no references, usable with pointers and `stackalloc` |
| `where T : allows ref struct` | C# 13: `T` may be a `Span<T>`-like type |

**Variance** applies only to generic interfaces and delegates, and only for reference-type arguments. `out T` (covariant) means T appears only as output, `in T` (contravariant) only as input.

```csharp
IEnumerable<string> strings = new List<string> { "a" };
IEnumerable<object> objects = strings;          // covariance: OK
// List<object> bad = new List<string>();       // compile error: List<T> is invariant

Action<object> printObj = o => Console.WriteLine(o);
Action<string> printStr = printObj;             // contravariance: OK
printStr("x");                                   // x

object[] arr = new string[1];                    // array covariance is unsafe
arr[0] = 1;                                      // throws ArrayTypeMismatchException
```

**Static abstract members in interfaces** (C# 11, .NET 7+) let generic code call static members and operators of `T`. This powers generic math (`INumber<T>`) and the curiously recurring `TSelf` pattern.

```csharp
public interface IShape<TSelf> where TSelf : IShape<TSelf>
{
    static abstract TSelf Create(double size);
    double Area { get; }
}

public readonly record struct Square(double Side) : IShape<Square>
{
    public static Square Create(double size) => new(size);
    public double Area => Side * Side;
}

static T Build<T>(double size) where T : IShape<T> => T.Create(size);
Console.WriteLine(Build<Square>(3).Area);        // 9

static T Sum<T>(IEnumerable<T> items) where T : System.Numerics.INumber<T>
{
    T total = T.Zero;
    foreach (var x in items) total += x;
    return total;
}
Console.WriteLine(Sum(new[] { 1, 2, 3 }));       // 6
Console.WriteLine(Sum(new[] { 1.5, 2.5 }));      // 4
```

## Delegates, events and closures

A delegate is an immutable object holding a method and optionally a target. Combining with `+=` creates a new multicast delegate. `Func<>` returns a value, `Action<>` does not, `Predicate<T>` is `Func<T,bool>` in older clothing.

Events wrap a delegate so outsiders can only subscribe and unsubscribe. Raise defensively with `Changed?.Invoke(this, e)`, which reads the field once and is thread-safe against concurrent unsubscribe. A handler that throws stops the remaining handlers.

**Event leaks:** a long-lived publisher (static event, singleton) holds subscribers alive through its delegate list. Unsubscribe, use weak events, or tie subscription to a disposable.

**Closures** capture variables, not values. The compiler hoists captured variables into a heap object shared by every lambda that captured them.

```csharp
var actions = new List<Action>();
for (int i = 0; i < 3; i++) actions.Add(() => Console.Write(i + " "));
foreach (var a in actions) a();                  // 3 3 3

var actions2 = new List<Action>();
foreach (var n in new[] { 0, 1, 2 }) actions2.Add(() => Console.Write(n + " "));
foreach (var a in actions2) a();                 // 0 1 2
```

The `for` loop has one `i` for all iterations. A `foreach` variable is fresh per iteration (since C# 5). Mark lambdas `static` when they must not capture, which also avoids closure allocation on hot paths.

## LINQ: deferred execution and pitfalls

Operators such as `Where`, `Select`, `OrderBy` build a pipeline and run only when enumerated. `ToList`, `ToArray`, `Count`, `First`, `foreach` force execution.

```csharp
var numbers = new List<int> { 1, 2, 3 };
var query = numbers.Where(n => n > 1);
numbers.Add(4);
Console.WriteLine(string.Join(",", query));      // 2,3,4

var snapshot = numbers.Where(n => n > 1).ToList();
numbers.Add(5);
Console.WriteLine(snapshot.Count);               // 3

int calls = 0;
IEnumerable<int> Source() { calls++; yield return 1; yield return 2; }
var q = Source();
Console.WriteLine(q.Count());                    // 2
Console.WriteLine(q.Any());                      // True
Console.WriteLine(calls);                        // 2: the source ran twice
```

Pitfalls to name:

- **Multiple enumeration** re-runs the source (a database call, a file read). Materialise once or accept `IReadOnlyCollection<T>`.
- `Count() > 0` instead of `Any()`, and `.ToList()` followed by `.Count()` instead of `.Count`.
- `First` throws on empty, `FirstOrDefault` returns default, `Single` throws on zero or more than one.
- Lambdas capture variables, so changing a variable after building the query changes its result.
- `OrderBy` is stable, `List<T>.Sort` is not.
- In hot paths LINQ allocates delegates and enumerators. A plain loop or `Span<T>` is often several times faster, so measure before deciding.
- Newer operators worth knowing: `CountBy`, `AggregateBy` and `Index` (.NET 9), `Order` and `OrderDescending` (.NET 7), `Chunk` (.NET 6).

## IEnumerable versus IQueryable

`IEnumerable<T>` takes `Func<>` delegates and runs in memory. `IQueryable<T>` takes `Expression<Func<>>` trees that a provider (EF Core) translates, for example into SQL.

```csharp
IQueryable<Order> orders = db.Orders;

var bad  = orders.AsEnumerable().Where(o => o.Total > 100).ToList(); // loads all rows, filters in memory
var good = orders.Where(o => o.Total > 100).ToList();                // WHERE in SQL
```

Traps: calling `AsEnumerable()`, `ToList()` or a non-translatable method too early moves work to the client. Returning `IQueryable` from a repository leaks the persistence layer, and the query can run after the context is disposed. Return materialised results from the data layer unless you deliberately compose queries there.

## Iterators and yield

A method with `yield return` becomes a compiler-generated state machine class. It is lazy: nothing in the body runs until the first `MoveNext`. That includes argument validation, so split it:

```csharp
public static IEnumerable<int> TakeFirst(IEnumerable<int> source, int count)
{
    ArgumentNullException.ThrowIfNull(source);
    ArgumentOutOfRangeException.ThrowIfNegative(count);
    return Iterator();

    IEnumerable<int> Iterator()
    {
        if (count == 0) yield break;
        int taken = 0;
        foreach (var item in source)
        {
            yield return item;
            if (++taken == count) yield break;
        }
    }
}
```

`yield return` cannot appear in a `try` block that has a `catch`, inside an `unsafe` block, or in a method with `ref`, `in` or `out` parameters. `try/finally` is allowed and the `finally` runs when enumeration is disposed.

## Choosing a collection

| Type | Lookup | Add | Notes |
| --- | --- | --- | --- |
| `List<T>` | O(1) by index, O(n) search | Amortised O(1) at end, O(n) in middle | Default sequence. Presize with capacity. |
| `Dictionary<K,V>` | O(1) average | O(1) average | Unordered, do not rely on enumeration order. Removal during enumeration is allowed since .NET Core 3.0. |
| `HashSet<T>` | O(1) average | O(1) average | Uniqueness, set operations |
| `SortedDictionary<K,V>` | O(log n) | O(log n) | Tree, ordered enumeration |
| `SortedList<K,V>` | O(log n) | O(n) | Sorted arrays, less memory, fast reads |
| `PriorityQueue<T,P>` | Peek O(1) | O(log n) | Min-heap, no stable ordering |
| `ConcurrentDictionary<K,V>` | O(1) average | O(1) average | Thread-safe, fine-grained locking, reads are lock-free |
| `ImmutableArray<T>` | O(1) index | O(n) copy per change | Struct around an array, great for read-mostly data |
| `ImmutableList<T>` | O(log n) | O(log n) | Tree, cheap structural sharing, slower reads |
| `FrozenDictionary<K,V>` / `FrozenSet<T>` | Fastest reads | Cannot add | .NET 8+. Costly to create, build once at startup |

Rule of thumb: a lookup table that never changes after start-up should be a `FrozenDictionary`. A cache shared across threads is a `ConcurrentDictionary` (or `MemoryCache` if you need expiry). Do not use `ImmutableList` expecting `List` speed.

## IComparer and IEqualityComparer

`IComparer<T>` defines ordering for sorting and sorted collections. `IEqualityComparer<T>` defines `Equals` and `GetHashCode` for dictionaries and sets. If two items compare equal for lookup, their hashes must match, so a comparer that ignores case must hash ignoring case too. `StringComparer.OrdinalIgnoreCase` does this correctly.

```csharp
var dict = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase) { ["Id"] = 1 };
Console.WriteLine(dict["ID"]);                   // 1

var people = new List<(string Name, int Age)> { ("Bo", 30), ("Al", 30), ("Cy", 25) };
people.Sort(Comparer<(string Name, int Age)>.Create((a, b) =>
{
    int c = b.Age.CompareTo(a.Age);              // age descending
    return c != 0 ? c : string.CompareOrdinal(a.Name, b.Name);
}));
Console.WriteLine(string.Join(",", people.Select(p => p.Name)));   // Al,Bo,Cy
```

## Common traps and red flags

- Closing over a `for` loop variable and expecting per-iteration values.
- Enumerating a lazy query twice, or after the data source or `DbContext` is gone.
- Using `ConcurrentDictionary` when a plain `Dictionary` under a single owner is enough, or `Dictionary` shared across threads without a lock.
- Modifying a `List<T>` inside `foreach` (throws `InvalidOperationException`).
- Calling `.ToList()` on an `IQueryable` before filtering.
- Event subscriptions to long-lived publishers that are never removed.
- Comparer with inconsistent `Equals` and `GetHashCode`, or a sort comparison that is not transitive.

## 10 questions to practise

1. Why does `List<int>` not box but `ArrayList` does? (Reified generics with value-type specialisation.)
2. Explain covariance and contravariance with one example each. (`IEnumerable<out T>`, `Action<in T>`.)
3. Why is `List<T>` invariant? (It both reads and writes `T`.)
4. What problem do static abstract interface members solve? (Calling operators and factories on `T`, generic math.)
5. What does a lambda capture, and what is printed by the `for` loop example? (Variables, `3 3 3`.)
6. How can an event cause a memory leak? (The publisher's delegate list roots subscribers.)
7. When exactly does a LINQ `Where` run? (On enumeration, every time it is enumerated.)
8. `IEnumerable` versus `IQueryable` in EF Core? (Delegates in memory versus expression trees translated to SQL.)
9. Why validate arguments outside an iterator method? (The body runs lazily on first `MoveNext`.)
10. Which collection for a read-only lookup built at start-up? (`FrozenDictionary`, because reads are optimised after a costly build.)

## Skill-upgrade checklist

- [ ] Write a generic `Sum`/`Average` using `INumber<T>` and test it with `int`, `double` and `decimal`.
- [ ] Reproduce the closure bug and fix it two ways.
- [ ] Log SQL from EF Core and prove which query shape runs on the server.
- [ ] Benchmark `Dictionary`, `FrozenDictionary` and a switch on 50 string keys.
- [ ] Write an iterator with a validating wrapper and a `finally` block, and test the order of execution.
- [ ] Find one event subscription in your codebase and confirm it is unsubscribed.

## Read next (official)

- [Generics in .NET](https://learn.microsoft.com/dotnet/standard/generics/)
- [Covariance and contravariance](https://learn.microsoft.com/dotnet/standard/generics/covariance-and-contravariance)
- [Generic math](https://learn.microsoft.com/dotnet/standard/generics/math)
- [LINQ overview](https://learn.microsoft.com/dotnet/csharp/linq/)
- [Collections and data structures](https://learn.microsoft.com/dotnet/standard/collections/)
- [Events (C# programming guide)](https://learn.microsoft.com/dotnet/csharp/programming-guide/events/)
