# C# types, equality and memory: senior interview guide

**Who this is for:** a .NET engineer with about 10 years of experience who can write correct code but must now explain how values, references, strings and memory really behave, and defend design choices (struct or class, record or class, Span or array) under questioning. Applies to .NET 8 and .NET 10 (LTS) unless a section says otherwise.

## What interviewers expect at senior level

- You correct the myths ("structs live on the stack", "strings are value types") instead of repeating them.
- You can predict the output of a short snippet involving boxing, copies, string identity or equality.
- You know the equality contract and can write it correctly for a class, a struct and a record.
- You choose `Span<T>`, `Memory<T>`, `stackalloc` and pooling because a measurement justified them, not by habit.
- You treat nullable reference types as a design tool and know exactly what they do not enforce.

## Value types, reference types and the stack myth

A variable of a value type holds the data itself. A variable of a reference type holds a reference to an object on the managed heap. Assignment copies the bits of the variable, so it copies the value, or copies the reference.

The popular claim "value types go on the stack, reference types on the heap" is wrong in both directions:

| Situation | Where the data lives |
| --- | --- |
| `int` local that is not captured | Stack or a CPU register (the JIT decides) |
| `int` field of a class | Inside the heap object |
| Elements of an `int[]` | Inside the array object on the heap |
| `int` captured by a lambda | In a compiler-generated closure object on the heap |
| `int` converted to `object` | In a new heap box |
| Reference held in a local | The reference is on the stack or in a register, the object it points to is usually on the heap |

The accurate statement is that a value type's storage lives wherever its container lives. Also, recent JIT versions (improved again in .NET 10) can allocate some non-escaping objects, boxes and small arrays on the stack. That is an optimisation you can observe, not a rule you can rely on.

## Boxing and unboxing

Boxing copies a value into a new object, roughly 24 bytes for an `int` on 64-bit once the object header and method table pointer are counted. Unboxing must name the exact original type.

```csharp
int i = 42;
object o = i;            // box: a copy
i = 99;
Console.WriteLine(o);    // 42
Console.WriteLine((int)o); // 42
long l = (long)o;        // throws InvalidCastException: the box holds an int
```

Hidden boxing sources: casting a struct to an interface, calling a non-generic API such as `string.Format("{0}", 5)`, using a struct as a key in a non-generic collection, and calling `Equals(object)` on a struct. Generic collections and generic constraints (`where T : IComparable<T>`) avoid it.

## struct, readonly struct, ref struct, record struct

| Kind | Key facts | Use when |
| --- | --- | --- |
| `struct` | Copied on assignment and when passed. Mutable by default. | Small, short-lived, logically a single value (about 16 bytes or less is the usual guideline) |
| `readonly struct` | Every member is read-only, so the compiler skips defensive copies, especially with `in` parameters | Default choice for any struct |
| `ref struct` | Can only live on the stack. Cannot be boxed or be a field of a class. `Span<T>` is one. | Wrappers around memory, parsers, enumerators |
| `record struct` | Struct with generated value equality, `ToString` and `with`. Properties are mutable unless you write `readonly record struct`. | Small immutable data, prefer the `readonly` form |

Mutable structs cause copy bugs. A method call on a `readonly` field of a non-readonly struct runs on a hidden copy:

```csharp
struct Counter { public int N; public void Inc() => N++; }
class Holder { public readonly Counter C = new(); }

var h = new Holder();
h.C.Inc();
Console.WriteLine(h.C.N);    // 0: Inc ran on a defensive copy

var arr = new Counter[1];
arr[0].Inc();
arr[0].Inc();
Console.WriteLine(arr[0].N); // 2: an array element is a variable, not a copy
// var list = new List<Counter> { default }; list[0].Inc(); // compile error CS1612
```

`ref struct` rules relaxed in C# 13: they can implement interfaces and be used with generics through the `allows ref struct` anti-constraint, and they can appear in async methods and iterators as long as they are not alive across an `await` or `yield`.

## Strings: internals and interning

A `string` is an immutable reference type holding UTF-16 code units and a length. Every "modification" creates a new string. That makes strings thread-safe and safe as dictionary keys, and it makes naive concatenation in a loop quadratic.

Literals and compile-time constants are interned: one shared instance per runtime. Strings built at run time are not, unless you call `string.Intern`.

```csharp
string a = "hel" + "lo";    // constant-folded by the compiler
string b = "hello";
string part = "hel";
string c = part + "lo";     // built at run time

Console.WriteLine(ReferenceEquals(a, b));                  // True
Console.WriteLine(ReferenceEquals(b, c));                  // False
Console.WriteLine(b == c);                                 // True
Console.WriteLine(ReferenceEquals(b, string.Intern(c)));   // True
```

`==` on strings is overloaded to compare content. Interned strings are not reclaimed while the process runs, so never intern user input.

| Need | Tool |
| --- | --- |
| A few pieces, one expression | `+` or `$"..."` (the compiler uses `string.Concat` or an interpolated string handler) |
| Loop with many appends | `StringBuilder` (chunked buffer, set `Capacity` if you know the size) |
| Joining a collection | `string.Join` |
| Hot path, known length | `string.Create` or `Span<char>` plus one final allocation |

Always pass a comparison for culture-sensitive APIs: `string.Equals(x, y, StringComparison.OrdinalIgnoreCase)` for identifiers and keys, and culture comparison only for text shown to people. Forgetting this is the classic Turkish "I" bug.

## Equality: ==, Equals, GetHashCode, IEquatable

- `==` on reference types is reference equality unless the type overloads it. `Equals(object)` is virtual and defaults to reference equality for classes. Structs get `ValueType.Equals`, which compares fields and can fall back to slow reflection, so override it.
- Rule: if `Equals` says two objects are equal, `GetHashCode` must return the same value. The reverse is not required.
- Implement `IEquatable<T>` so `Dictionary` and `HashSet` skip boxing and virtual calls. Override `Equals(object)`, `GetHashCode` and the operators together.
- Hash codes must not change while the object is a key. Use immutable members.

```csharp
public sealed class Money : IEquatable<Money>
{
    public decimal Amount { get; }
    public string Currency { get; }
    public Money(decimal amount, string currency) => (Amount, Currency) = (amount, currency);

    public bool Equals(Money? other) =>
        other is not null && Amount == other.Amount && Currency == other.Currency;
    public override bool Equals(object? obj) => Equals(obj as Money);
    public override int GetHashCode() => HashCode.Combine(Amount, Currency);
    public static bool operator ==(Money? l, Money? r) => l is null ? r is null : l.Equals(r);
    public static bool operator !=(Money? l, Money? r) => !(l == r);
}
```

## Records

A record generates value equality, `ToString`, a copy constructor and `with` support. `record` and `record class` are reference types; `record struct` is a value type.

```csharp
public record Person(string Name, int Age);

var p1 = new Person("Ada", 36);
var p2 = p1 with { Age = 37 };
Console.WriteLine(p1);                          // Person { Name = Ada, Age = 36 }
Console.WriteLine(p2);                          // Person { Name = Ada, Age = 37 }
Console.WriteLine(p1 == new Person("Ada", 36)); // True
```

Traps: equality is shallow, so a `List<T>` property compares by reference. `with` makes a shallow copy. Records are poor EF Core entities because identity matters more than values. A mutable record property used as a hash key breaks the dictionary:

```csharp
public record Key { public int Id { get; set; } }
var key = new Key { Id = 1 };
var set = new HashSet<Key> { key };
key.Id = 2;
Console.WriteLine(set.Contains(key)); // False: stored under the old hash
```

## Nullable reference types

With `<Nullable>enable</Nullable>`, `string` means "should not be null" and `string?` means "may be null". The checks are compiler flow analysis only. Nothing is enforced at run time, so JSON deserialisation, reflection and older libraries can still put `null` in a non-nullable property.

```csharp
public static bool TryFind(string key, [NotNullWhen(true)] out string? value)
{
    value = key == "id" ? "42" : null;
    return value is not null;
}
// if (TryFind("id", out var v)) Console.WriteLine(v.Length); // no warning
```

Use attributes (`NotNullWhen`, `MaybeNullWhen`, `NotNull`) to describe helper methods, `required` for must-set properties, and treat `!` and `default!` as debt that needs a comment. Turn on warnings-as-errors for nullability in new projects.

## Span, Memory and stackalloc

`Span<T>` is a stack-only view over contiguous memory (an array, a string, native memory or stack memory). Slicing does not allocate or copy.

```csharp
ReadOnlySpan<char> line = "id=42;name=Ada";
int semi = line.IndexOf(';');
ReadOnlySpan<char> first = line[..semi];                       // "id=42"
ReadOnlySpan<char> value = first[(first.IndexOf('=') + 1)..];  // "42"
int id = int.Parse(value);
Console.WriteLine(id + 1); // 43
```

Because `Span<T>` is a `ref struct`, it cannot be a class field, be boxed, or cross an `await`. When you need those, use `Memory<T>` (a normal struct) and call `.Span` when you do the work. `stackalloc` allocates on the stack and is fast, but an oversized request is a fatal, uncatchable `StackOverflowException`, so cap it and fall back:

```csharp
Span<char> buffer = length <= 256 ? stackalloc char[256] : new char[length];
```

C# 14 adds more implicit conversions between arrays, `Span<T>` and `ReadOnlySpan<T>`, so span-based APIs are easier to call and extension methods on spans now work on arrays.

## Common traps and red flags

- "Structs are faster because they are on the stack." Fast only if small, not boxed and not copied heavily.
- Mutable struct in a `List<T>` or a `readonly` field.
- Overriding `Equals` without `GetHashCode`, or hashing mutable fields.
- `Contains` or `Dictionary` with a struct key that has no `IEquatable<T>`.
- Using `+=` on strings in a loop, or interning dynamic strings.
- Believing `string?` stops a null at run time.
- Unbounded `stackalloc` sized from user input.

## 10 questions to practise

1. Where does an `int` field of a class live? (Inside the heap object: a value lives where its container lives.)
2. When does boxing happen without a visible cast? (Struct to interface, non-generic APIs, `Equals(object)`.)
3. Why is a `readonly` field holding a mutable struct dangerous? (Defensive copy on method calls.)
4. What does `readonly struct` buy you? (No defensive copies, intent, safe `in` passing.)
5. Why can `Span<T>` not be a class field? (It is a `ref struct` restricted to the stack.)
6. Why does `a == b` differ from `ReferenceEquals(a, b)` for strings? (Content comparison versus identity.)
7. State the `Equals`/`GetHashCode` contract and one consequence of breaking it. (Equal means same hash, otherwise hash lookups miss.)
8. Record versus class: when is each right? (Value semantics and immutability versus identity and mutable state.)
9. What do nullable reference types guarantee at run time? (Nothing, analysis only.)
10. How would you parse a CSV line with no allocations? (`ReadOnlySpan<char>`, `IndexOf`, slicing, `Parse` overloads.)

## Skill-upgrade checklist

- [ ] Write a benchmark showing boxing cost against a generic constrained method.
- [ ] Reproduce the readonly-field defensive copy and fix it with `readonly struct`.
- [ ] Implement `IEquatable<T>`, `GetHashCode` and operators for a value object, then test it in a `HashSet`.
- [ ] Rewrite a string-splitting routine with `ReadOnlySpan<char>` and compare allocations.
- [ ] Enable nullable warnings as errors in one project and fix every warning without using `!`.
- [ ] Explain stack-versus-heap aloud in 60 seconds with the correct caveats.

## Read next (official)

- [Value types (C# reference)](https://learn.microsoft.com/dotnet/csharp/language-reference/builtin-types/value-types)
- [Structure types](https://learn.microsoft.com/dotnet/csharp/language-reference/builtin-types/struct)
- [Records](https://learn.microsoft.com/dotnet/csharp/language-reference/builtin-types/record)
- [Nullable reference types](https://learn.microsoft.com/dotnet/csharp/nullable-references)
- [Memory and span usage guidelines](https://learn.microsoft.com/dotnet/standard/memory-and-spans/memory-t-usage-guidelines)
- [Best practices for comparing strings](https://learn.microsoft.com/dotnet/standard/base-types/best-practices-strings)
