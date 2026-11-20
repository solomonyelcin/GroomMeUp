# Modern C# 12 to 14: features, trade-offs and adoption advice

**Who this is for:** a .NET engineer with about 10 years of experience who learned C# before 2020 and must now talk fluently about what the last three language versions added, which features are risky, and how to adopt them in a real codebase. Targets C# 14 on .NET 10 (LTS). C# 12 ships with .NET 8 and C# 13 with .NET 9; where a feature needs a newer runtime library than the compiler, the section says so.

## What interviewers expect at senior level

- You can place each feature in the right version, and say which are compiler-only and which need a runtime type.
- You know the semantic traps: primary constructor parameters are not properties, `field` can shadow a member, `lock` only uses the new type for `Lock` variables.
- You adopt features with a policy (analyzers, `LangVersion`, team conventions), not by rewriting everything.
- You can read and write list, property and relational patterns, and you know when a pattern is clearer than an `if` chain.
- You use `required`, `init` and records to make invalid objects hard to construct.

## Version map

| Version | Ships with | Headline additions |
| --- | --- | --- |
| C# 12 | .NET 8 | Primary constructors for classes and structs, collection expressions, `using` alias for any type, default lambda parameters, `ref readonly` parameters, inline arrays, `Experimental` attribute |
| C# 13 | .NET 9 | `params` collections, `System.Threading.Lock`, `\e` escape, implicit `^` index in object initializers, `ref struct` interfaces and `allows ref struct`, partial properties and indexers, `OverloadResolutionPriority` |
| C# 14 | .NET 10 | Extension members, `field` keyword, null-conditional assignment, partial constructors and events, lambda parameter modifiers without types, `nameof` on unbound generics, implicit span conversions, user-defined compound assignment |

Rule of thumb for .NET 8 projects: the C# 12 features all work. Newer language versions can be selected with `LangVersion` on an older runtime, but only features that need no new runtime types will work (extension members and `field` do; `Lock` and the new BCL `params` overloads do not).

## C# 12

### Primary constructors

Parameters declared on a class or struct are in scope for the whole type. The compiler captures them into hidden fields when a member uses them. They are not properties, and they are mutable.

```csharp
public class Counter(int start)
{
    public int Next() => start++;
}

var c = new Counter(5);
Console.WriteLine(c.Next()); // 5
Console.WriteLine(c.Next()); // 6
```

Records are different: a record's primary constructor parameters become public properties. Advice: primary constructors suit service classes that only need injected dependencies. Avoid them when you need validation, a readonly guarantee, or when the captured parameter is also passed to a base constructor (the compiler warns, because you would hold two copies). If you want immutability, assign to a `readonly` field in the initializer: `private readonly ILogger _log = log;`.

### Collection expressions

One literal syntax for arrays, spans, `List<T>`, immutable collections and interfaces such as `IEnumerable<T>` and `IReadOnlyList<T>`. The spread element `..` inlines another sequence. The expression needs a target type, so `var x = [1, 2];` does not compile.

```csharp
int[] a = [1, 2, 3];
int[] b = [..a, 4, 5];
List<int> evens = [..b.Where(x => x % 2 == 0)];
Console.WriteLine(string.Join(",", b));     // 1,2,3,4,5
Console.WriteLine(string.Join(",", evens)); // 2,4
```

Custom collections opt in with `[CollectionBuilder]`.

### Smaller C# 12 features

```csharp
using Point = (int X, int Y);               // alias any type, including tuples

var inc = (int x, int step = 1) => x + step; // default lambda parameter
Console.WriteLine(inc(5));     // 6
Console.WriteLine(inc(5, 10)); // 15
```

`ref readonly` parameters document that a caller passes by reference but the callee cannot modify (a stricter, clearer `in`). `[InlineArray(n)]` declares a fixed-size buffer struct that is safe and spannable; mostly library authors use it. `[Experimental("ID")]` marks APIs that produce a diagnostic when used.

## C# 13

### params collections

`params` is no longer limited to arrays. It accepts `Span<T>`, `ReadOnlySpan<T>` and collection types or interfaces such as `IEnumerable<T>`. The span forms avoid the array allocation per call.

```csharp
static int Sum(params ReadOnlySpan<int> values)
{
    int total = 0;
    foreach (var v in values) total += v;
    return total;
}
Console.WriteLine(Sum(1, 2, 3)); // 6
Console.WriteLine(Sum());        // 0
```

.NET 9 added span-based `params` overloads to many BCL methods such as `string.Join` and `Path.Combine`, so recompiling on .NET 9 or later reduces allocations without code changes.

### The Lock type

```csharp
private readonly Lock _gate = new();
private int _count;
public void Add() { lock (_gate) { _count++; } }
```

`System.Threading.Lock` is .NET 9+. The `lock` statement uses its `EnterScope` API only when the compiler sees the static type `Lock`. If you cast the variable to `object`, you silently get a plain `Monitor`. Changing `private readonly object _gate` to `Lock` is the whole migration.

### Other C# 13 items

- Partial properties and indexers: a declaring part and an implementing part; the implementation cannot be an auto-property. Source generators use this.
- `ref struct` types can implement interfaces and be used as type arguments when the parameter says `where T : allows ref struct`. They still cannot be boxed to an interface.
- `ref` locals and `ref struct` locals are allowed in `async` methods, but not across an `await`.
- `[OverloadResolutionPriority(1)]` lets a library add a better overload (say a span version) without ambiguity for existing callers.
- `\e` is the escape character (U+001B). It avoids the `\x1b` trap where following hex digits are swallowed.

## C# 14

### The field keyword

`field` refers to the compiler-generated backing field inside an accessor. It shipped in C# 14 (it was a preview in 13).

```csharp
public class Product
{
    public string Name
    {
        get;
        set => field = value?.Trim() ?? throw new ArgumentNullException(nameof(value));
    } = "";
}

var p = new Product { Name = "  Pen " };
Console.WriteLine($"[{p.Name}]"); // [Pen]
```

The initializer `= ""` writes the backing field directly and does not call the setter. Lazy properties become `get => field ??= Load();`. Breaking-change trap: if your type already has a member named `field`, inside accessors the keyword wins; write `@field` or `this.field` to mean the member.

### Extension members

`extension` blocks declare extension properties, methods, operators and static members. The receiver goes on the block.

```csharp
public static class StringExtensions
{
    extension(string s)
    {
        public bool IsBlank => string.IsNullOrWhiteSpace(s);
        public string Truncate(int max) => s.Length <= max ? s : s[..max];
    }
}

Console.WriteLine("  ".IsBlank);         // True
Console.WriteLine("abcdef".Truncate(3)); // abc
```

A block whose receiver has no name, such as `extension(string)`, declares static members called on the type. Existing `this` extension methods keep working, so migration is optional. Advice: use extension properties for obvious, cheap, side-effect-free values; do not hide I/O behind a property.

### Null-conditional assignment

```csharp
class Order { }
class Customer { public Order? Order { get; set; } }

int calls = 0;
Order Make() { calls++; return new Order(); }

Customer? c = null;
c?.Order = Make();
Console.WriteLine(calls); // 0: right side not evaluated
c = new Customer();
c?.Order = Make();
Console.WriteLine(calls); // 1
```

`?.` and `?[]` may be on the left of `=` and of compound assignments such as `+=`. `++` and `--` are not allowed.

### Other C# 14 items

- Lambda parameters can carry modifiers without types: `(text, out result) => int.TryParse(text, out result)` for a delegate with an `out` parameter. `params` still needs explicit types.
- Partial constructors and partial events: one defining and one implementing declaration; only the implementing constructor part has the `this(...)` or `base(...)` initializer.
- `nameof(List<>)` is `"List"`; unbound generic types are allowed.
- New implicit conversions among `T[]`, `Span<T>` and `ReadOnlySpan<T>` make span extension methods callable on arrays.
- User-defined compound assignment operators let a type define `+=` as an in-place operation instead of `a = a + b`, which helps mutable large types avoid a new allocation.

## Pattern matching you must read fluently

| Pattern | Example | Meaning |
| --- | --- | --- |
| Relational | `< 100m`, `>= 18` | Compare with a constant |
| Logical | `> 0 and < 10`, `not null`, `"a" or "b"` | Combine patterns |
| Property (extended) | `{ Ship.Country: "IN" }` | Nested member test; fails if `Ship` is null |
| List and slice | `[1, .., 9]`, `[var first, ..]` | Length and element shape |
| Type with designation | `Circle { Radius: > 0 } c` | Test, narrow, bind |

```csharp
static string Describe(int[] xs) => xs switch
{
    [] => "empty",
    [var only] => $"one:{only}",
    [1, .., 9] => "starts 1 ends 9",
    _ => "other"
};
Console.WriteLine(Describe([]));        // empty
Console.WriteLine(Describe([7]));       // one:7
Console.WriteLine(Describe([1, 5, 9])); // starts 1 ends 9
Console.WriteLine(Describe([4, 5, 6])); // other
```

Arm order matters: the compiler rejects an arm already covered by an earlier one. Property patterns on a record:

```csharp
record Address(string Country);
record Order(string Status, decimal Total, Address? Ship);

static string Fee(Order o) => o switch
{
    { Total: >= 100m, Ship.Country: "IN" } => "free",
    { Total: < 100m and > 0m } => "flat",
    { Status: "Cancelled" or "Refunded" } => "none",
    _ => "standard"
};
Console.WriteLine(Fee(new("Paid", 150m, new("IN")))); // free
Console.WriteLine(Fee(new("Paid", 50m, null)));       // flat
Console.WriteLine(Fee(new("Cancelled", 0m, null)));   // none
Console.WriteLine(Fee(new("Paid", 150m, null)));      // standard
```

## required, init and raw strings

`init` accessors can be set only during construction (constructor, object initializer, `with`). `required` forces callers to set a member in an initializer, which the compiler checks.

```csharp
public class User
{
    public required string Name { get; init; }
    public int Age { get; init; }
}
var u = new User { Name = "Ada" };   // fine
// new User { Age = 3 };             // error CS9035: required member 'Name' must be set
```

A constructor marked `[SetsRequiredMembers]` promises to set them all. `System.Text.Json` honours `required` and fails deserialisation when the property is missing. Caveat: `required` is enforced by the compiler only, so reflection-based tools can bypass it.

Raw string literals use three or more quotes, need no escaping, and strip indentation up to the closing quotes. Interpolation uses `$` repeated to set how many braces start a hole.

```csharp
int id = 5;
string json = $$"""
    {
      "id": {{id}}
    }
    """;
Console.WriteLine(json);
// {
//   "id": 5
// }
```

## Adoption advice

- Set `LangVersion` explicitly in a shared `Directory.Build.props` so builds are reproducible.
- Enforce style with `.editorconfig` and IDE analyzers (collection expressions, primary constructors) as suggestions first, warnings later.
- Convert in small mechanical commits, separate from behavior changes.
- Prefer features that remove allocations or bugs (`Lock`, `params` spans, `required`) over purely cosmetic ones.

## Common traps and red flags

- Assuming a primary constructor parameter is `readonly` or a property.
- Capturing a primary constructor parameter and also passing it to `base(...)`.
- Casting a `Lock` to `object` and losing the new behavior.
- Naming a member `field` in a type that now uses the keyword.
- `var x = [1, 2];` (no natural type).
- Believing `required` blocks `null` values (that is nullable analysis, not `required`).

## 10 questions to practise

1. How does a primary constructor on a class differ from one on a record? (Hidden captured fields versus generated public properties.)
2. What does a collection expression need that `var` cannot give it? (A target type.)
3. Why is `params ReadOnlySpan<T>` cheaper than `params T[]`? (No array allocation per call.)
4. What does `lock` compile to for a `Lock` field versus an `object` field? (`EnterScope` versus `Monitor`.)
5. What problem does the `field` keyword solve, and what can it break? (Boilerplate backing fields; members named `field`.)
6. What do extension members add over extension methods? (Properties, operators and static extensions.)
7. In `c?.Order = Make();` when does `Make` run? (Only if `c` is not null.)
8. Show a list pattern matching "first element 1, last element 9". (`[1, .., 9]`.)
9. `required` versus a constructor parameter: trade-offs? (Object initializer friendliness and serializers versus a guaranteed invariant in one place.)
10. When would you choose a raw string literal? (JSON, regex, SQL or multi-line text with quotes.)

## Skill-upgrade checklist

- [ ] Convert one DI-heavy service to a primary constructor and note what you lose.
- [ ] Replace `object` lock fields with `Lock` in a sample and confirm with a decompiler.
- [ ] Write a switch expression using list, property and relational patterns with tests for every arm.
- [ ] Rewrite a lazily initialized property with `field ??=`.
- [ ] Add one extension property and one extension static member in an `extension` block.

## Read next (official)

- [What's new in C# 14](https://learn.microsoft.com/dotnet/csharp/whats-new/csharp-14)
- [What's new in C# 13](https://learn.microsoft.com/dotnet/csharp/whats-new/csharp-13)
- [What's new in C# 12](https://learn.microsoft.com/dotnet/csharp/whats-new/csharp-12)
- [Extension member declarations](https://learn.microsoft.com/dotnet/csharp/language-reference/keywords/extension)
- [Collection expressions](https://learn.microsoft.com/dotnet/csharp/language-reference/operators/collection-expressions)
- [Patterns](https://learn.microsoft.com/dotnet/csharp/language-reference/operators/patterns)
