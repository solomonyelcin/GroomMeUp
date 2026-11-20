# .NET runtime, DI, configuration and logging: senior study guide

**Who this is for:** an experienced .NET engineer who can build services but must now explain what happens underneath (JIT, hosting, container behaviour) and defend design choices around dependency injection, options and logging. Targets .NET 10 (LTS). Most of this also applies to .NET 8, which is relevant because .NET 8 and 9 reached end of support on 10 November 2026, so expect questions about upgrading.

## What interviewers expect at senior level

- You can describe the path from C# source to running machine code, and say when you would choose ReadyToRun or Native AOT.
- You know the Generic Host as the thing that wires configuration, DI, logging and lifetime together.
- You spot lifetime bugs (captive dependencies, disposable transients) from a code snippet.
- You pick the right options interface and make bad configuration fail at startup rather than at 3 a.m.
- You treat logs as structured data, not strings, and you know the cost of logging on hot paths.

## CLR, JIT, tiered compilation, ReadyToRun and Native AOT

C# compiles to IL inside an assembly. At run time the CLR's JIT turns IL into machine code per method. **Tiered compilation** (on by default) first produces quick, lightly optimised tier-0 code so startup is fast. Methods that are called often are rejitted in the background at tier 1 with full optimisation. Loops in a method that is still running at tier 0 are handled by on-stack replacement (OSR). Since .NET 8 **dynamic PGO** is on by default: tier-0 code is instrumented, and the tier-1 rejit uses the observed behaviour (hot branches, likely types for guarded devirtualisation).

| Mode | How | Startup | Peak speed | Constraints |
| --- | --- | --- | --- | --- |
| JIT (default) | normal publish | slowest | best (PGO) | needs the runtime and JIT on the box |
| ReadyToRun | `PublishReadyToRun` | faster | slightly lower at first, then tiers up | larger files, needs a runtime identifier |
| Native AOT | `PublishAot` | fastest, small memory | no PGO, no JIT | trimming, no `Assembly.LoadFrom`, reflection and dynamic code are restricted, use source generators |

```xml
<PropertyGroup>
  <TargetFramework>net10.0</TargetFramework>
  <RuntimeIdentifier>linux-x64</RuntimeIdentifier>
  <PublishReadyToRun>true</PublishReadyToRun>   <!-- or: <PublishAot>true</PublishAot> -->
  <InvariantGlobalization>true</InvariantGlobalization>
</PropertyGroup>
```

Interview angle: ReadyToRun is a startup optimisation for services that scale out or cold-start (containers, serverless). Native AOT suits CLI tools and small APIs built with `WebApplication.CreateSlimBuilder`, but it constrains libraries (EF Core and heavy reflection stacks are poor fits). Never claim AOT is "just faster": peak throughput of a long-running JIT service can be higher.

**SDK vs runtime.** The SDK (compiler, MSBuild, `dotnet` CLI) builds; the runtime runs. ASP.NET Core apps need the shared framework `Microsoft.AspNetCore.App` on top of `Microsoft.NETCore.App`. Publish **framework-dependent** (small, patched by the host image) or **self-contained** (bundles the runtime). Pin the SDK with `global.json` and `rollForward`, and keep one SDK for the whole team and CI.

## Generic Host and application lifetime

`WebApplication.CreateBuilder` and `Host.CreateApplicationBuilder` create a host that owns configuration, DI, logging and `IHostedService` instances. Hosted services start in registration order and stop in reverse. On SIGTERM the host stops accepting work and waits up to `HostOptions.ShutdownTimeout` (30 seconds by default). `IHostApplicationLifetime` exposes `ApplicationStarted`, `ApplicationStopping` and `ApplicationStopped`. If a `BackgroundService` throws, the default behaviour stops the host.

## DI lifetimes and captive dependencies

| Lifetime | Instance | Typical use |
| --- | --- | --- |
| Singleton | one per container | stateless services, caches, `HttpClient` handlers, thread-safe only |
| Scoped | one per scope (a web request) | `DbContext`, unit of work, current-user context |
| Transient | new on every resolve | lightweight, stateless helpers |

**Captive dependency:** a longer-lived service holding a shorter-lived one. The classic case is a singleton with a scoped `DbContext`, which then lives forever and is used by many threads. Development mode validates this (`ValidateScopes` and `ValidateOnBuild`), but only for what it can see. Production is usually not validated, so turn validation on in tests too.

```csharp
public sealed class ReportJob(IServiceScopeFactory scopes) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken ct)
    {
        using var timer = new PeriodicTimer(TimeSpan.FromMinutes(1));
        while (await timer.WaitForNextTickAsync(ct))
        {
            await using var scope = scopes.CreateAsyncScope();   // fresh scope per run
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            // use db
        }
    }
}
```

More DI facts worth knowing:

- Resolving an `IDisposable` transient from the **root** provider keeps it alive until shutdown, a quiet memory leak.
- The container disposes what it creates. Instances you pass in (`AddSingleton(instance)`) are yours to dispose.
- Single resolution returns the **last** registration; `IEnumerable<T>` returns all. `TryAdd*` avoids overriding.
- Open generics (`AddScoped(typeof(IRepo<>), typeof(Repo<>))` ) are supported.
- **Keyed services** replace hand-written factories:

```csharp
builder.Services.AddKeyedSingleton<IPaymentGateway, StripeGateway>("stripe");
builder.Services.AddKeyedSingleton<IPaymentGateway, AdyenGateway>("adyen");

app.MapPost("/pay", ([FromKeyedServices("stripe")] IPaymentGateway gw) => gw.Name);
```

Avoid injecting `IServiceProvider` to resolve dependencies ad hoc (service locator). The legitimate exceptions are factories and creating scopes.

## Options pattern

| Interface | Lifetime | Reloads on file change | Use when |
| --- | --- | --- | --- |
| `IOptions<T>` | singleton | no | settings read once at startup |
| `IOptionsSnapshot<T>` | scoped | yes, per request | web request needs a stable value for its duration |
| `IOptionsMonitor<T>` | singleton | yes, live, with `OnChange` | singletons and background services that must see changes |

Named options (`Configure<T>("name", ...)`, `Get("name")`) give several instances of one type. Validate at startup:

```csharp
public sealed class PaymentOptions
{
    public const string Section = "Payments";
    [Required, Url] public string BaseUrl { get; set; } = "";
    [Range(1, 60)] public int TimeoutSeconds { get; set; } = 10;
}

builder.Services.AddOptions<PaymentOptions>()
    .Bind(builder.Configuration.GetSection(PaymentOptions.Section))
    .ValidateDataAnnotations()
    .Validate(o => !o.BaseUrl.EndsWith('/'), "BaseUrl must not end with a slash")
    .ValidateOnStart();   // fail fast instead of on first use
```

For complex rules implement `IValidateOptions<T>`. A source generator (`[OptionsValidator]`) produces reflection-free validation, useful for AOT. Remember `IOptionsSnapshot` cannot be injected into a singleton (it is scoped).

## Configuration providers and precedence

Providers are layered and **later providers override earlier ones**. The default web host order is:

1. `appsettings.json`
2. `appsettings.{Environment}.json`
3. User secrets (Development only)
4. Environment variables
5. Command-line arguments

Additional providers you add (Azure Key Vault, Azure App Configuration) come after these and therefore win. In environment variables a hierarchy is written with a double underscore, for example `Payments__BaseUrl`, which also works in Kubernetes manifests. Use `GetSection`, `Bind` and `Get<T>`, and prefer strongly typed options over `configuration["a:b"]` in business code. Secrets belong in user secrets locally and in a vault or platform secret store in production, never in committed JSON.

## Logging

`ILogger<T>` writes through providers (console, OpenTelemetry, Application Insights, Serilog and others). Use **message templates**, not interpolation, so the property names and values stay structured and the template can be indexed:

```csharp
logger.LogInformation("Order {OrderId} paid by {CustomerId}", order.Id, customerId); // good
logger.LogInformation($"Order {order.Id} paid");                                      // bad: allocates, loses structure
```

**Scopes** attach properties to every log written inside them (the console provider needs `IncludeScopes`, other providers show them natively):

```csharp
using (logger.BeginScope(new Dictionary<string, object> { ["OrderId"] = order.Id }))
{
    logger.LogInformation("Starting fulfilment");
}
```

On hot paths use **compile-time logging** with `LoggerMessage` source generation. It avoids boxing, parses the template once and checks the level before doing work:

```csharp
public static partial class Log
{
    [LoggerMessage(EventId = 1001, Level = LogLevel.Warning,
        Message = "Payment {PaymentId} failed after {Attempts} attempts")]
    public static partial void PaymentFailed(this ILogger logger, Guid paymentId, int attempts);
}
// logger.PaymentFailed(id, 3);
```

Set levels per category in configuration (`Logging:LogLevel:Microsoft.AspNetCore` = `Warning`). Pass the exception as the first argument (`LogError(ex, "...")`), do not log secrets or personal data, and correlate across services with the trace id that `Activity` supplies.

## HttpClientFactory

Creating `new HttpClient()` per call can exhaust sockets; a single static one can keep stale DNS. `IHttpClientFactory` pools and recycles the underlying handlers (default handler lifetime two minutes) and gives you named or typed clients and a handler pipeline.

```csharp
builder.Services.AddHttpClient<GitHubClient>(c =>
{
    c.BaseAddress = new Uri("https://api.github.com/");
    c.Timeout = TimeSpan.FromSeconds(30);
}).AddStandardResilienceHandler();
```

A typed client is registered as transient. Injecting it into a singleton captures one instance and its handler for too long. Resolve `IHttpClientFactory` there instead, or in a long-lived service configure `SocketsHttpHandler.PooledConnectionLifetime`.

## Common traps and red flags

- A singleton depends on `DbContext` or any scoped service.
- `IOptionsSnapshot` in a singleton, or `IOptions` when the value is meant to reload.
- Options that are never validated, so a missing setting becomes a `NullReferenceException` under load.
- Logging with string interpolation, or logging whole request bodies with tokens in them.
- `new HttpClient()` in a method, or `.Result` on its calls.
- Believing Native AOT is a free switch, or that `appsettings.Production.json` beats an environment variable (it does not).
- Resolving services via `IServiceProvider` all over the code base.

## 10 questions to practise

1. Walk through tiered compilation and say what OSR and dynamic PGO add. *Hint: tier 0 for startup, tier 1 for hot code, instrumentation feeds the rejit.*
2. When would you pick ReadyToRun over Native AOT? *Hint: keep the JIT and reflection, cut startup.*
3. What stops a library from working under Native AOT? *Hint: unbounded reflection, dynamic code, assembly loading.*
4. Define a captive dependency and show two fixes. *Hint: scope factory, or change the lifetime.*
5. Singleton, scoped and transient: where does each break? *Hint: threads, disposal, memory.*
6. How do keyed services differ from a factory delegate? *Hint: container-native, attribute injection.*
7. Compare the three options interfaces. *Hint: lifetime and reload semantics.*
8. How would you make the app refuse to start with bad configuration? *Hint: `ValidateOnStart`.*
9. In what order are configuration sources applied and how would you override a value in Kubernetes? *Hint: later wins, `A__B` env var.*
10. Why use `LoggerMessage` source generation and message templates? *Hint: allocations, level checks, structure.*

## Skill-upgrade checklist

- [ ] Publish one service with ReadyToRun and compare cold start with a plain publish.
- [ ] Reproduce a captive dependency, see the validation error, then fix it with `IServiceScopeFactory`.
- [ ] Bind an options class with validation and `ValidateOnStart`, then break the config on purpose.
- [ ] Use `IOptionsMonitor<T>` with `OnChange` and edit the file while the app runs.
- [ ] Convert three hot-path log calls to `[LoggerMessage]`.
- [ ] Replace a `new HttpClient()` with a typed client and a resilience handler.

## Read next (official)

- [Dependency injection in .NET](https://learn.microsoft.com/dotnet/core/extensions/dependency-injection)
- [Options pattern in .NET](https://learn.microsoft.com/dotnet/core/extensions/options)
- [Configuration in .NET](https://learn.microsoft.com/dotnet/core/extensions/configuration)
- [Logging in .NET](https://learn.microsoft.com/dotnet/core/extensions/logging)
- [Compile-time logging source generation](https://learn.microsoft.com/dotnet/core/extensions/logger-message-generator)
- [Use IHttpClientFactory to implement resilient HTTP requests](https://learn.microsoft.com/dotnet/core/extensions/httpclient-factory)
