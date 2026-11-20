# Testing, diagnostics and deployment: senior study guide

**Who this is for:** an experienced .NET engineer who writes services and now has to show that they can prove them correct, see inside them in production and ship them in containers with a repeatable pipeline. Targets .NET 10 (LTS), with notes for .NET 8 where behaviour differs.

## What interviewers expect at senior level

- You design a test suite with a clear pyramid and can justify what runs against real infrastructure.
- You write integration tests with `WebApplicationFactory` and Testcontainers instead of fragile mocks of the database.
- You instrument services with traces, metrics and structured logs, and you can diagnose a memory leak or a thread-pool starvation with the dotnet CLI tools.
- You write a lean, non-root, multi-stage Dockerfile and explain how probes, limits and shutdown behave in Kubernetes.
- You know what Native AOT and trimming give you and what they take away.

## Unit testing and mocking

**xUnit** creates a new instance of the test class for every test, so constructor setup is per test and there is no shared state by accident. Use `[Fact]` for single cases and `[Theory]` with `[InlineData]`, `[MemberData]` or `[ClassData]` for tables. Share expensive setup with `IClassFixture<T>` (per class) or `ICollectionFixture<T>` (per collection), and use `IAsyncLifetime` for async setup and teardown. Tests in different classes run in parallel by default; tests in one collection run serially. xUnit v3 (`xunit.v3` packages) is the current generation and runs on Microsoft Testing Platform; v2 still works. NUnit and MSTest are acceptable alternatives, so state a reason rather than a loyalty.

| Technique | Use when | Avoid when |
| --- | --- | --- |
| Hand-written fake | simple collaborators, you want readable tests | behaviour is large |
| Mock (NSubstitute, Moq, FakeItEasy) | verify an interaction with a boundary such as an email sender | mocking your own repositories to test query logic |
| `FakeTimeProvider` | time, delays, expiry (`Microsoft.Extensions.TimeProvider.Testing`) | never use `DateTime.UtcNow` in logic you must test |
| Real dependency in a container | SQL behaviour, transactions, serialization | speed matters more than fidelity |

Inject `TimeProvider` (built into .NET 8) instead of calling `DateTime.UtcNow`. Mock at the edges you own, not types you do not own, and assert on outcomes rather than call counts. Moq's 2023 SponsorLink episode pushed many teams to NSubstitute; either is fine if you pin versions deliberately. Do not test with the EF Core in-memory provider when behaviour depends on relational semantics: it has no transactions, constraints or real translation. SQLite in-memory is closer but still differs from SQL Server.

## Integration tests: WebApplicationFactory and Testcontainers

`WebApplicationFactory<TEntryPoint>` hosts the real app in-memory with a `TestServer`, so requests run through routing, filters, authentication and serialization without opening a port. With minimal hosting add `public partial class Program { }` so tests can reference the entry point. Override services in `ConfigureTestServices` to replace external edges, for example a payment gateway client, and keep everything else real.

```csharp
public sealed class ApiFactory : WebApplicationFactory<Program>, IAsyncLifetime
{
    private readonly MsSqlContainer _sql = new MsSqlBuilder().Build();

    protected override void ConfigureWebHost(IWebHostBuilder b)
    {
        b.UseSetting("ConnectionStrings:Default", _sql.GetConnectionString());
        b.ConfigureTestServices(s => s.AddSingleton<IPaymentGateway, FakeGateway>());
    }

    public Task InitializeAsync() => _sql.StartAsync();
    public new Task DisposeAsync() => _sql.DisposeAsync().AsTask();
}
```

**Testcontainers for .NET** starts disposable Docker containers (SQL Server, PostgreSQL, Redis, RabbitMQ) from test code. Reuse one container per test collection and reset data between tests with a library such as Respawn or a transaction rollback, because starting a SQL Server container per test is slow. Run migrations once on startup. In CI the agent needs a Docker daemon.

**Test pyramid.** Many fast unit tests for logic, a medium layer of integration tests through the HTTP boundary with real database, and few end-to-end tests of critical journeys. Add contract tests (for example Pact) where teams own separate services. A "trophy" shape that leans on integration tests suits CRUD-heavy services; the point is to place tests where they give the most signal per second.

## Observability with OpenTelemetry

.NET already emits the primitives: `ILogger` for logs, `System.Diagnostics.Activity` for spans and `System.Diagnostics.Metrics.Meter` for metrics. OpenTelemetry is the vendor-neutral way to export them.

```csharp
builder.Services.AddOpenTelemetry()
    .ConfigureResource(r => r.AddService("orders-api"))
    .WithTracing(t => t.AddAspNetCoreInstrumentation()
                       .AddHttpClientInstrumentation()
                       .AddSource("Orders"))
    .WithMetrics(m => m.AddAspNetCoreInstrumentation()
                       .AddRuntimeInstrumentation()
                       .AddMeter("Orders"))
    .UseOtlpExporter();

static readonly ActivitySource Source = new("Orders");
using var act = Source.StartActivity("ChargeCard");
act?.SetTag("order.id", orderId);
```

Key ideas: W3C `traceparent` propagates context across HTTP and messaging so a trace spans services; sample in production to control cost; keep metric tag cardinality low (never user ids); use structured logging with message templates and correlate logs through trace ids. Aspire (formerly .NET Aspire) wires service defaults, OTLP and a local dashboard for development. Alert on the four golden signals: latency, traffic, errors, saturation.

## Diagnostics tools

| Tool | Answers | Typical use |
| --- | --- | --- |
| `dotnet-counters` | what are the live numbers? | monitor GC heap size, thread-pool queue length, request rate, exceptions per second |
| `dotnet-trace` | where is CPU time going? | collect a trace, open in PerfView, Visual Studio or Speedscope |
| `dotnet-dump` | what is in memory right now? | `collect`, then `analyze` with `dumpheap -stat`, `gcroot`, `clrstack` |
| `dotnet-gcdump` | which objects retain memory? | lightweight heap snapshot of a leak |
| `dotnet-monitor` | same, over HTTP | sidecar in Kubernetes |

Workflows to know. **High CPU:** counters to confirm, trace to find hot methods. **Memory growth:** counters for gen2 size, gcdump or dump, then `dumpheap -stat` to find the dominant type and `gcroot` to find who holds it (usually a static collection, event handler or cache with no bound). **Hangs and slow requests with low CPU:** suspect thread-pool starvation from sync-over-async (`.Result`, `.Wait()`); look at thread-pool queue length and stack traces with `clrstack` or `dumpasync`. In containers, attach the tools through a shared `/tmp` and diagnostic port or use `kubectl debug` with an ephemeral container.

## Health checks and configuration

`AddHealthChecks()` plus `MapHealthChecks` exposes endpoints. Separate **liveness** (is the process wedged? no dependency calls) from **readiness** (can it serve traffic now? checks the database or cache), using tags and a predicate:

```csharp
builder.Services.AddHealthChecks()
    .AddSqlServer(cs, tags: ["ready"]);
app.MapHealthChecks("/health/live", new() { Predicate = _ => false });
app.MapHealthChecks("/health/ready", new() { Predicate = h => h.Tags.Contains("ready") });
```

A liveness probe that checks the database restarts every pod when the database blips, which turns a partial outage into a full one. Keep health endpoints cheap and unauthenticated only inside the cluster.

## Docker and Kubernetes for .NET

A multi-stage build compiles with the SDK image and ships only the ASP.NET runtime image.

```dockerfile
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY *.csproj .
RUN dotnet restore
COPY . .
RUN dotnet publish -c Release -o /app --no-restore

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS final
WORKDIR /app
COPY --from=build /app .
USER $APP_UID
ENTRYPOINT ["dotnet", "Orders.Api.dll"]
```

Copy the project file and restore first so the package layer is cached. Since .NET 8 official images include a non-root `app` user (`$APP_UID`) and listen on port **8080** by default (`ASPNETCORE_HTTP_PORTS`), so you do not need privileged ports. Consider `-alpine` or "chiseled" Ubuntu images for a smaller attack surface. The SDK can also build an image without a Dockerfile (`dotnet publish -t:PublishContainer`).

Kubernetes points to know:

- **Probes:** startup (slow boot), readiness (gate traffic), liveness (restart when stuck).
- **Resources:** the runtime reads cgroup limits. Memory limits shape the GC heap (the default hard limit is a fraction of the container limit), and a CPU limit sets `Environment.ProcessorCount`, which sizes the thread pool and server GC heaps. Set requests close to real usage; very small CPU limits cause throttling and latency.
- **Shutdown:** Kubernetes sends SIGTERM and waits `terminationGracePeriodSeconds`. The host stops accepting work and drains in-flight requests; a short `preStop` sleep gives endpoints time to deregister. Match `HostOptions.ShutdownTimeout` to the grace period.
- **Config:** environment variables map to configuration with `__` as the section separator (`ConnectionStrings__Default`). Secrets from a secret store, not the image.
- **Scaling:** HPA on CPU or custom metrics needs stateless pods, so keep sessions and caches out of process memory.

## CI/CD and Native AOT

A sound pipeline: restore with NuGet caching, build with warnings as errors, run unit tests, run integration tests with Testcontainers, collect coverage, scan dependencies and the image, publish an immutable image tagged with the commit, deploy to staging, run smoke tests, then promote the same artifact. Apply database migrations as a separate, reviewed step (a migration bundle or script) before the rollout, and use rolling, blue-green or canary releases with a fast rollback.

**Native AOT** (`PublishAot`) compiles to a self-contained native binary: fast startup, low memory, no JIT. ASP.NET Core supports it for minimal APIs and gRPC (use `WebApplication.CreateSlimBuilder` or `CreateEmptyBuilder`), with `System.Text.Json` source generation. It does not support MVC controllers or Razor views, runtime code generation, or unrestricted reflection, and not every library or EF Core feature is AOT-safe. **Trimming** (`PublishTrimmed`) removes unused code and raises IL2026-style warnings where reflection could break. ReadyToRun is the softer option: it keeps the JIT but improves startup. Choose AOT for serverless and short-lived or dense workloads, not by default.

## Common traps and red flags

- Mocking `DbContext` or using the in-memory provider to "test the repository".
- Tests sharing a database with no reset, so order changes results.
- `Thread.Sleep` or real clocks in tests; flaky tests left red or retried silently.
- Liveness probe that calls the database.
- High-cardinality metric tags, or logging whole request bodies with secrets.
- Containers running as root, or images built on the SDK image.
- `.Result` on async calls in a web app, then "we need more pods".
- Applying migrations from every pod at startup, with no rollback plan.
- Enabling AOT late and discovering reflection-based libraries do not work.

## 10 questions to practise

1. How is a test class instantiated in xUnit and what does that mean for shared state? *Hint: new instance per test, fixtures.*
2. What should you mock and what should you run for real? *Hint: edges you own versus infrastructure semantics.*
3. How does `WebApplicationFactory` work and how do you replace a dependency? *Hint: `ConfigureTestServices`, `Program` visibility.*
4. Why Testcontainers over the EF in-memory provider? *Hint: real SQL behaviour, constraints, transactions.*
5. Describe your test pyramid for a REST service. *Hint: counts, speed, confidence.*
6. How would you trace one request across three services? *Hint: `Activity`, `traceparent`, OTLP.*
7. A pod's memory grows until it is OOM-killed. What do you do? *Hint: counters, gcdump, `gcroot`, container limits.*
8. Latency spikes but CPU is low. What do you suspect? *Hint: thread-pool starvation, blocking calls, dependencies.*
9. Liveness versus readiness: what belongs in each? *Hint: dependency checks, restart behaviour.*
10. When is Native AOT the right choice, and what breaks? *Hint: startup and size versus reflection and MVC.*

## Skill-upgrade checklist

- [ ] Build an integration test project with `WebApplicationFactory` and a SQL Server Testcontainer, with Respawn between tests.
- [ ] Replace `DateTime.UtcNow` with `TimeProvider` and test expiry using `FakeTimeProvider`.
- [ ] Add OpenTelemetry tracing and metrics to a sample API and view them in a local collector or Aspire dashboard.
- [ ] Create a deliberate leak and find it with `dotnet-counters`, `dotnet-gcdump` and `dotnet-dump`.
- [ ] Write a multi-stage, non-root Dockerfile and compare image sizes of two base images.
- [ ] Deploy to a local cluster with separate liveness and readiness probes and observe a rolling update.
- [ ] Publish one minimal API with `PublishAot` and list what you had to change.

## Read next (official)

- [Integration tests in ASP.NET Core](https://learn.microsoft.com/aspnet/core/test/integration-tests)
- [Unit testing best practices](https://learn.microsoft.com/dotnet/core/testing/unit-testing-best-practices)
- [.NET observability with OpenTelemetry](https://learn.microsoft.com/dotnet/core/diagnostics/observability-with-otel)
- [.NET diagnostic tools](https://learn.microsoft.com/dotnet/core/diagnostics/tools-overview)
- [Health checks in ASP.NET Core](https://learn.microsoft.com/aspnet/core/host-and-deploy/health-checks)
- [Containerize a .NET app](https://learn.microsoft.com/dotnet/core/docker/build-container)
- [ASP.NET Core support for Native AOT](https://learn.microsoft.com/aspnet/core/fundamentals/native-aot)
