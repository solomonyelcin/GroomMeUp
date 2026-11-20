# OOP, SOLID and design patterns in C#: senior study guide

**Who this is for:** an experienced .NET engineer who is asked in design rounds to justify structure, not recite acronyms: why this abstraction, why composition here, how a pattern shows up in the framework you already use. Examples use C# 12 to 14 on .NET 8 to 10.

## What interviewers expect at senior level

- You explain the four OOP pillars through trade-offs, not definitions.
- You apply SOLID to real code and also say when following it would over-engineer.
- You prefer composition and can show a decorator or strategy wired through DI.
- You recognise GoF patterns already inside .NET and ASP.NET Core.
- You can sketch an aggregate, a value object and a domain event, and handle failures with a result type or exceptions deliberately.
- You default to immutability and know the C# tools that support it.

## OOP essentials with C# trade-offs

| Pillar | C# tools | Senior-level point |
| --- | --- | --- |
| Encapsulation | `private`, `internal`, `init`, `required`, properties | protect invariants in one place, not just hide fields |
| Abstraction | interfaces, abstract classes | abstract at a seam you expect to vary or fake in tests |
| Inheritance | `virtual`, `override`, `sealed` | inheritance is a tight coupling; seal by default |
| Polymorphism | virtual dispatch, interfaces, generics | prefer small interfaces over deep hierarchies |

Practical details: interfaces can have default members (C# 8) and static abstract members (C# 11, used for generic math), but they are not a substitute for composition. An abstract class fits when you share state or a template method. `sealed` enables devirtualisation and signals that a type is not designed for extension. `new` hides rather than overrides and surprises callers holding the base type. Value types (`struct`, `record struct`) copy on assignment; use them for small immutable values, not for polymorphism.

## SOLID with C# examples

**S: single responsibility.** A class has one reason to change. An `OrderService` that validates, prices, persists and sends email changes for four reasons. Split by actor, not by line count.

**O: open/closed.** Add behaviour by adding code, not editing tested code. A discount `switch` that grows with each campaign becomes a list of strategies:

```csharp
public interface IDiscountRule { bool Applies(Order o); decimal Amount(Order o); }

public sealed class PricingService(IEnumerable<IDiscountRule> rules)
{
    public decimal Discount(Order o) => rules.Where(r => r.Applies(o)).Sum(r => r.Amount(o));
}
// services.AddSingleton<IDiscountRule, LoyaltyDiscount>(); add more without touching PricingService
```

**L: Liskov substitution.** A subtype must honour the base contract: no stronger preconditions, no weaker postconditions, no new exceptions callers do not expect. The classic failure is `Square : Rectangle`, where setting width changes height. A .NET example is a `ReadOnlyCollection<T>` exposed as `IList<T>`: `Add` throws `NotSupportedException`, so callers cannot substitute it safely. Fix with `IReadOnlyList<T>`.

**I: interface segregation.** Do not force clients to depend on methods they do not use. Split `IRepository` with ten methods into `IOrderReader` and `IOrderWriter`; a reporting job then depends only on the reader. .NET itself splits `IEnumerable<T>`, `IReadOnlyCollection<T>`, `IReadOnlyList<T>` and `IList<T>`.

**D: dependency inversion.** High-level policy depends on an abstraction it owns; the detail implements it.

```csharp
public interface IClock { DateTimeOffset UtcNow { get; } }   // or TimeProvider in .NET 8+

public sealed class InvoiceService(IInvoiceStore store, TimeProvider time)
{
    public Task IssueAsync(Invoice i, CancellationToken ct) => store.SaveAsync(i with { IssuedAt = time.GetUtcNow() }, ct);
}
```

`TimeProvider` (.NET 8) is the built-in clock abstraction, which makes time-based logic testable. Dependency inversion is not the same as dependency injection: injection is the mechanism, inversion is who owns the interface.

When SOLID goes wrong: an interface per class with one implementation, a factory for a constructor call, and ten layers for a CRUD endpoint. Introduce an abstraction when there is a second implementation, a test seam, or a boundary (database, network, clock).

## Composition over inheritance and DI lifetimes

Inheritance couples a subclass to its base's internals (the fragile base class problem). Composition gives the behaviour by holding a collaborator and delegating, which can be swapped at runtime and tested in isolation. A decorator is composition in its cleanest form:

```csharp
public sealed class CachedProductReader(IProductReader inner, IMemoryCache cache) : IProductReader
{
    public async Task<Product?> GetAsync(int id, CancellationToken ct) =>
        await cache.GetOrCreateAsync(id, _ => inner.GetAsync(id, ct));
}
```

Wire it with Scrutor's `Decorate`, or manually in a factory lambda. For several implementations of one interface, **keyed services** (`AddKeyedSingleton`, `[FromKeyedServices("key")]`, .NET 8) avoid hand-rolled factories.

| Lifetime | Instance per | Danger |
| --- | --- | --- |
| Singleton | application | must be thread-safe; cannot hold scoped services |
| Scoped | request or scope | do not capture in a singleton (captive dependency) |
| Transient | resolution | disposables kept alive by the container |

ASP.NET Core validates scopes in Development and throws on a captive dependency; keep that check on in tests too.

## GoF patterns you already use in .NET

| Pattern | Where it appears |
| --- | --- |
| Strategy | `IComparer<T>`, `IEqualityComparer<T>`, pluggable rules via DI |
| Decorator | `Stream` wrappers (`BufferedStream`, `GZipStream`), `DelegatingHandler` for `HttpClient` |
| Chain of responsibility | ASP.NET Core middleware pipeline, MVC filters |
| Factory / abstract factory | `IHttpClientFactory`, `ILoggerFactory`, `DbProviderFactory` |
| Builder | `WebApplication.CreateBuilder`, `StringBuilder`, `ModelBuilder` |
| Observer | events, `IObservable<T>`/`IObserver<T>`, `INotifyPropertyChanged`, `Channel<T>` for producer-consumer |
| Adapter | wrapping a third-party SDK behind your interface; anti-corruption layer |
| Template method | `BackgroundService.ExecuteAsync`, `ControllerBase` overrides |
| Proxy | EF Core lazy-loading proxies, `DispatchProxy`, gRPC and refit clients |
| Mediator | in-process request handlers; MediatR changed to commercial licensing from v13, so check cost, or write a small dispatcher |
| Singleton | prefer DI singleton lifetime to a static `Instance`, which hides dependencies and blocks testing |
| Unit of Work and Repository | `DbContext` is already both; add a repository only for a domain-specific query abstraction |

Interviewers like to ask what you would avoid: a generic `IRepository<T>` wrapping `DbSet<T>` adds ceremony and leaks `IQueryable`; static singletons and service locators hide coupling.

## DDD basics

Domain-driven design is useful where the business rules are complex; for plain CRUD it is overhead.

- **Ubiquitous language:** code names match what the business says. **Bounded context:** a boundary within which a model and its terms are consistent; the same word (`Customer`) may mean different things in billing and support.
- **Entity:** has identity and a lifecycle. **Value object:** defined by its values, immutable, compared by content. A `record` fits well:

```csharp
public sealed record Money(decimal Amount, string Currency)
{
    public Money Add(Money other) =>
        other.Currency == Currency ? this with { Amount = Amount + other.Amount }
                                   : throw new InvalidOperationException("Currency mismatch");
}
```

- **Aggregate:** a cluster of objects with one **root** that enforces invariants; outside code references only the root, one transaction changes one aggregate, and aggregates refer to each other by id. Keep them small.
- **Domain events:** facts that happened (`OrderPlaced`), raised by the aggregate and dispatched after the save, or through an outbox for reliable messaging.
- **Repository:** collection-like access to aggregate roots. **Domain service:** logic that fits no single entity. **Anemic model:** entities that are only property bags with all rules in services; the usual smell to name.
- Application services orchestrate (load, call domain, save); the domain layer has no dependency on EF Core or HTTP.

## Result pattern versus exceptions

Exceptions suit unexpected faults. Expected business outcomes (not found, validation failed, insufficient funds) are ordinary results; modelling them as return values keeps them visible in signatures and cheap.

```csharp
public readonly record struct Error(string Code, string Message);

public sealed class Result<T>
{
    public T? Value { get; }
    public Error? Error { get; }
    public bool IsSuccess => Error is null;
    private Result(T? v, Error? e) => (Value, Error) = (v, e);
    public static Result<T> Ok(T value) => new(value, null);
    public static Result<T> Fail(Error e) => new(default, e);
    public TOut Match<TOut>(Func<T, TOut> ok, Func<Error, TOut> fail) => Error is { } e ? fail(e) : ok(Value!);
}
```

At the API edge map errors to `ProblemDetails` and status codes (404, 409, 422). Do not replace every exception: infrastructure failures, programmer errors and cancellation still throw. Libraries such as `ErrorOr` or `FluentResults` exist; C# has no built-in union type as of C# 14 (union proposals are in progress), so a sealed hierarchy with pattern-matching `switch` is the alternative for several outcome shapes.

## Immutability

Immutable objects are thread-safe, safe as dictionary keys and easy to reason about.

| Tool | Notes |
| --- | --- |
| `record` / `record struct` | value equality, `with` expressions, positional properties are `init` |
| `init` and `required` (C# 11) | set at construction, then read-only |
| `readonly struct` | compiler guarantees no mutation, avoids defensive copies |
| `IReadOnlyList<T>`, `ImmutableArray<T>` | a read-only view is not immutable: the owner can still change the list |
| `FrozenDictionary` / `FrozenSet` | immutable, optimised for lookup (.NET 8) |
| Primary constructors (C# 12) | on classes the parameters are mutable captured state, not `readonly`; on records they become properties |

Records are shallow: a record holding a `List<T>` is not deeply immutable. EF Core and JSON serialisation both work with `init` setters and constructors, so immutability and persistence can coexist.

## Common traps and red flags

- Interfaces for everything, each with a single implementation and a mock-only reason.
- Deep inheritance hierarchies and `protected` fields shared with subclasses.
- Violating Liskov: overrides that throw `NotSupportedException` or ignore the contract.
- Static singletons and service locator (`IServiceProvider` injected everywhere).
- Scoped service injected into a singleton.
- Anemic domain model with an all-powerful `OrderService`.
- Aggregates that are huge or reference each other by object graph.
- Exceptions as the main business-flow tool, or results that carry stack traces and secrets.
- Calling a record "immutable" while it exposes a mutable collection.
- Generic repository over EF Core that hides `Include` and tracking decisions.

## 10 questions to practise

1. Explain encapsulation beyond "private fields". *Protecting invariants so an object cannot be put into an invalid state.*
2. Give a Liskov violation from real code. *A read-only collection implementing `IList<T>`, or a subtype that tightens preconditions.*
3. How does open/closed look in DI? *New behaviour as a new registered implementation, selected by a collection or key, without editing the consumer.*
4. Difference between dependency inversion and dependency injection? *Inversion is who owns the abstraction; injection is how instances arrive.*
5. Composition versus inheritance: pick one for a caching layer. *Decorator around the reader; no subclassing of the data class.*
6. Which GoF patterns are in the ASP.NET Core pipeline? *Chain of responsibility (middleware), builder, factory, options and strategy via DI.*
7. When would you not add a repository over EF Core? *When `DbContext` already serves as repository and unit of work and the abstraction would only mirror it.*
8. What is an aggregate and what rule governs transactions? *A consistency boundary with one root; modify one aggregate per transaction.*
9. When use a Result type instead of exceptions? *For expected, handled outcomes; keep exceptions for unexpected faults.*
10. Why are records not automatically immutable? *Shallow immutability; `init` and a `List<T>` property still allow mutation of the contents.*

## Skill-upgrade checklist

- [ ] Refactor a `switch` on type into strategies registered in DI.
- [ ] Add a caching decorator and a logging decorator to one service and test the order.
- [ ] Use keyed services to select among two implementations.
- [ ] Model `Money` and `OrderLine` as value objects and an `Order` aggregate with invariants.
- [ ] Raise a domain event from the aggregate and dispatch it after `SaveChanges`.
- [ ] Implement `Result<T>` and map it to `ProblemDetails` in a minimal API.
- [ ] Turn on scope validation in a test host and trigger a captive dependency.
- [ ] Review one of your services against each SOLID letter and write down what you would not change.

## Read next (official)

- [Dependency injection guidelines](https://learn.microsoft.com/dotnet/core/extensions/dependency-injection-guidelines)
- [Dependency injection in ASP.NET Core](https://learn.microsoft.com/aspnet/core/fundamentals/dependency-injection)
- [Records (C# reference)](https://learn.microsoft.com/dotnet/csharp/language-reference/builtin-types/record)
- [Design a DDD-oriented microservice](https://learn.microsoft.com/dotnet/architecture/microservices/microservice-ddd-cqrs-patterns/ddd-oriented-microservice)
- [Framework design guidelines](https://learn.microsoft.com/dotnet/standard/design-guidelines/)
- [What's new in C# 14](https://learn.microsoft.com/dotnet/csharp/whats-new/csharp-14)
