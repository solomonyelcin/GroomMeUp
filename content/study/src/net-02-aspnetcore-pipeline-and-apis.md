# ASP.NET Core pipeline and APIs: senior study guide

**Who this is for:** an experienced .NET engineer who ships HTTP APIs and now has to explain why the request pipeline behaves the way it does, choose between minimal APIs and controllers, and design errors, versioning, limits and real-time features for production. Targets ASP.NET Core 10 (LTS). Items that need .NET 9 or 10 are flagged; the rest applies to .NET 8 as well.

## What interviewers expect at senior level

- You can draw the middleware pipeline from memory and explain what breaks when two components swap places.
- You can defend minimal APIs or controllers for a given team and system, rather than treating one as "modern" and the other as "legacy".
- You return consistent RFC 9457 problem details from every failure path, including unhandled exceptions.
- You know the request limits, streaming options and rate limiting behaviour that decide whether an API survives abuse.
- You can say when gRPC, SignalR or plain REST is the right tool, and what changes when you run several instances.

## Pipeline and middleware order

Each middleware receives the `HttpContext` and a `next` delegate. Code before `next` runs on the way in, code after it on the way out, and a middleware can short-circuit by not calling `next`. Order is the whole design. A typical secure order:

| Position | Middleware | Why here |
| --- | --- | --- |
| 1 | `UseExceptionHandler` | wraps everything after it, so it catches their exceptions |
| 2 | `UseHsts`, `UseHttpsRedirection` | cheap, protocol-level |
| 3 | `UseStaticFiles` | short-circuits before auth and routing cost |
| 4 | `UseRouting` | selects the endpoint so later middleware can read its metadata |
| 5 | `UseRateLimiter` | needs endpoint metadata for named policies |
| 6 | `UseCors` | must run before auth so preflights get answered |
| 7 | `UseAuthentication`, `UseAuthorization` | authentication first, then policy decisions |
| 8 | custom, `UseOutputCache` | anything that depends on the user or CORS headers |
| 9 | endpoints | the terminal step |

`WebApplication` inserts routing at the start and endpoints at the end for you, so explicit `UseRouting` matters only when a middleware must sit before it or between routing and the endpoint. Convention-based custom middleware is a class with `InvokeAsync(HttpContext, ...)`; `IMiddleware` is resolved from DI per request and so can take scoped services in its constructor. A classic bug is putting `UseAuthorization` before `UseAuthentication`, or `UseCors` after it, so that browsers see a missing header instead of the real 401.

```csharp
app.Use(async (ctx, next) =>
{
    var sw = Stopwatch.StartNew();
    ctx.Response.OnStarting(() =>
    {
        ctx.Response.Headers["X-Elapsed-Ms"] = sw.ElapsedMilliseconds.ToString();
        return Task.CompletedTask;
    });
    await next(ctx);
});
```

Headers cannot change once the response has started, which is why `OnStarting` is used above and why you never write to the response after `next` returns without checking `HasStarted`.

## Minimal APIs vs controllers

| Aspect | Minimal APIs | Controllers |
| --- | --- | --- |
| Style | lambdas or methods mapped to routes | classes, attributes, conventions |
| Filters | endpoint filters | action, result, exception filters |
| Validation | built in from .NET 10 (`AddValidation`) | `[ApiController]` plus model state, works since .NET Core 2.1 |
| Binding | parameter binding by type and attribute | model binders, input formatters, more extensibility |
| Startup cost | lower, friendlier to Native AOT | heavier reflection |
| Best fit | small services, vertical slices, AOT | large teams that want convention, rich filter ecosystem |

Both sit on the same routing and endpoint system, so choose on team habit and needed features. Group related endpoints with `MapGroup`, which shares a prefix, metadata, filters and auth:

```csharp
var orders = app.MapGroup("/api/orders")
    .RequireAuthorization()
    .WithTags("Orders")
    .AddEndpointFilter<LoggingFilter>();

orders.MapGet("/{id:int}", GetOrder);
orders.MapPost("/", CreateOrder);

static async Task<Results<Ok<OrderDto>, NotFound>> GetOrder(int id, AppDbContext db, CancellationToken ct)
{
    var dto = await db.Orders.Where(o => o.Id == id)
        .Select(o => new OrderDto(o.Id, o.Total)).FirstOrDefaultAsync(ct);
    return dto is null ? TypedResults.NotFound() : TypedResults.Ok(dto);
}
```

**TypedResults** return concrete types such as `Ok<T>` and `NotFound`. A union return type `Results<Ok<OrderDto>, NotFound>` documents every possible response for OpenAPI without `Produces` attributes, and unit tests can assert on the type instead of parsing a response. `Results.*` returns the untyped `IResult`.

**Endpoint filters** wrap a handler and can read or replace arguments and results:

```csharp
public sealed class LoggingFilter(ILogger<LoggingFilter> log) : IEndpointFilter
{
    public async ValueTask<object?> InvokeAsync(EndpointFilterInvocationContext ctx, EndpointFilterDelegate next)
    {
        log.LogInformation("Calling {Path}", ctx.HttpContext.Request.Path);
        return await next(ctx);
    }
}
```

## Model binding and validation

Minimal APIs infer the source: route values first, then query for simple types, body (JSON) for one complex parameter, services for registered types. Be explicit with `[FromRoute]`, `[FromQuery]`, `[FromHeader]`, `[FromBody]`, `[FromServices]` and `[FromKeyedServices]`. `[AsParameters]` gathers many parameters into one record. Only one parameter may bind from the body. Form binding for `IFormFile` and `IFormCollection` enables antiforgery checks by default (.NET 8 onwards), so pure token-authenticated APIs call `.DisableAntiforgery()` on those endpoints.

Validation: controllers with `[ApiController]` return a 400 validation problem automatically. In minimal APIs on **.NET 10**, call `builder.Services.AddValidation()` and DataAnnotations on parameters and their properties are checked before your handler runs, returning a 400 problem response. On .NET 8 or 9 use a filter plus FluentValidation or write the check yourself. Keep validation of shape at the edge and business invariants inside the domain.

## ProblemDetails and IExceptionHandler

`AddProblemDetails()` registers `IProblemDetailsService`, so the exception handler, status code pages and many framework failures produce `application/problem+json`. Since .NET 8, `IExceptionHandler` implementations are tried in registration order, and the first to return `true` ends the chain:

```csharp
public sealed class DomainExceptionHandler(IProblemDetailsService problems) : IExceptionHandler
{
    public async ValueTask<bool> TryHandleAsync(HttpContext ctx, Exception ex, CancellationToken ct)
    {
        if (ex is not OrderNotFoundException) return false;   // let another handler try
        ctx.Response.StatusCode = StatusCodes.Status404NotFound;
        return await problems.TryWriteAsync(new ProblemDetailsContext
        {
            HttpContext = ctx,
            Exception = ex,
            ProblemDetails = { Title = "Order not found", Status = 404 }
        });
    }
}

builder.Services.AddProblemDetails();
builder.Services.AddExceptionHandler<DomainExceptionHandler>();
app.UseExceptionHandler();
app.UseStatusCodePages();
```

Never leak stack traces or internal messages in production. Add `traceId` through a `CustomizeProblemDetails` callback so support can correlate a response with logs. Prefer expected failures as results (validation, not found) and reserve exceptions for the unexpected.

## API versioning and OpenAPI

Versioning comes from the `Asp.Versioning.Http` (minimal) and `Asp.Versioning.Mvc` packages, not the framework itself. Choose a reader (URL segment, header, media type, query string), set a default version and advertise it. The URL segment is easiest to cache and debug; header versioning keeps URLs stable. Deprecate with `ReportApiVersions` and sunset headers rather than removing quietly.

```csharp
builder.Services.AddApiVersioning(o =>
{
    o.DefaultApiVersion = new ApiVersion(1, 0);
    o.AssumeDefaultVersionWhenUnspecified = true;
    o.ReportApiVersions = true;
    o.ApiVersionReader = new UrlSegmentApiVersionReader();
});

var api = app.NewVersionedApi("Orders");
api.MapGroup("/api/v{version:apiVersion}/orders").HasApiVersion(1.0).MapGet("/", () => "v1 list");
```

**OpenAPI.** First-party document generation (`Microsoft.AspNetCore.OpenApi`, `AddOpenApi`, `MapOpenApi`) arrived in .NET 9; on .NET 8 use Swashbuckle or NSwag. In .NET 10 it supports OpenAPI 3.1, YAML output, XML doc comments and document or schema transformers. The templates no longer bundle a UI, so add Swagger UI or Scalar yourself, and use the generated document for client generation and contract diffing.

```csharp
builder.Services.AddOpenApi();
if (app.Environment.IsDevelopment()) app.MapOpenApi();   // serves /openapi/v1.json
```

## Streaming, uploads and limits

- Returning `IAsyncEnumerable<T>` from an endpoint streams JSON items as produced instead of buffering the whole list. .NET 10 adds `TypedResults.ServerSentEvents` for one-way push to browsers.
- Kestrel's default maximum request body is about 28.6 MB (30,000,000 bytes); the multipart form limit defaults to 128 MB. Raise limits per endpoint, not globally.
- For large uploads do not bind `IFormFile` (it buffers to memory or disk). Read `Request.Body` or use `MultipartReader`, stream straight to blob storage, and cap size and content type.
- Always accept a `CancellationToken` so abandoned requests stop work.

## Rate limiting

Built-in middleware (since .NET 7) offers fixed window, sliding window, token bucket and concurrency limiters, partitioned by any key you choose. Two gotchas: the default rejection status is 503, so set 429 explicitly, and limits are per process, so behind several instances you need a gateway or a shared store for a global limit.

```csharp
builder.Services.AddRateLimiter(o =>
{
    o.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    o.AddPolicy("per-user", ctx => RateLimitPartition.GetFixedWindowLimiter(
        ctx.User.Identity?.Name ?? ctx.Connection.RemoteIpAddress?.ToString() ?? "anon",
        _ => new FixedWindowRateLimiterOptions { PermitLimit = 100, Window = TimeSpan.FromMinutes(1) }));
});
app.UseRateLimiter();
orders.RequireRateLimiting("per-user");
```

Behind a proxy, configure forwarded headers or every client appears as the proxy's address.

## gRPC vs REST, SignalR scale-out and health checks

| Need | Choose | Notes |
| --- | --- | --- |
| Public or browser-facing CRUD | REST/JSON | cacheable, tooling everywhere |
| Internal service-to-service, low latency, streaming | gRPC | HTTP/2, Protobuf contracts, generated clients; browsers need gRPC-Web |
| Server push to browsers | SignalR or SSE | SignalR adds groups, reconnect and fallbacks |

**SignalR scale-out:** each server only knows its own connections, so a message sent on server A will not reach clients on server B without a backplane. Use the Redis backplane (`AddStackExchangeRedis`) or Azure SignalR Service. Unless clients use WebSockets only with negotiation skipped, you also need sticky sessions, because the negotiate call and the connection must reach the same server.

**Health checks** separate liveness (process is running, no dependency calls) from readiness (can serve traffic, checks the database). Mixing them makes an orchestrator restart healthy pods whenever a dependency blips.

```csharp
builder.Services.AddHealthChecks()
    .AddCheck("self", () => HealthCheckResult.Healthy(), tags: ["live"])
    .AddDbContextCheck<AppDbContext>("db", tags: ["ready"]);   // EF Core health check package

app.MapHealthChecks("/health/live", new() { Predicate = r => r.Tags.Contains("live") });
app.MapHealthChecks("/health/ready", new() { Predicate = r => r.Tags.Contains("ready") });
```

## Common traps and red flags

- `UseCors` after authorization, or `UseAuthorization` without `UseAuthentication`.
- Catch-all `try/catch` in every action instead of a central handler.
- Returning EF entities directly, which leaks columns and invites over-posting.
- Liveness probes that call the database.
- Rate limiter left at the default 503, or keyed on an IP that is always the proxy.
- Binding large uploads to `IFormFile`, or forgetting `CancellationToken`.
- Assuming SignalR "just works" with two instances.
- Versioning added late with no deprecation policy.

## 10 questions to practise

1. Why does middleware order matter? Give a failing example. *Hint: CORS, exception handler, auth.*
2. Minimal APIs or controllers for a new service? *Hint: team, filters, AOT, not fashion.*
3. What do `TypedResults` and `Results<...>` buy you? *Hint: OpenAPI metadata, testability.*
4. How do you produce one error format from every failure path? *Hint: ProblemDetails, `IExceptionHandler`, status code pages.*
5. How would you validate input in .NET 8 versus .NET 10 minimal APIs? *Hint: filter or library versus `AddValidation`.*
6. Which versioning scheme would you pick and how do you retire a version? *Hint: reader, report headers, sunset.*
7. How do you accept a 2 GB upload safely? *Hint: stream, limits, no buffering.*
8. Why can a rate limiter fail to protect you in a multi-instance deployment? *Hint: per-process state.*
9. When would you choose gRPC over REST, and what is the browser catch? *Hint: HTTP/2, gRPC-Web.*
10. How do you scale SignalR to three pods? *Hint: backplane and sticky sessions.*

## Skill-upgrade checklist

- [ ] Build an API with a route group, filter and `TypedResults`, then unit test the handler directly.
- [ ] Add `AddProblemDetails` and two exception handlers, and verify the output for 404, 400 and 500.
- [ ] Swap middleware order on purpose and observe the CORS or auth failure.
- [ ] Configure a per-user rate limiter and test the 429 with a load tool.
- [ ] Stream a file upload to disk without buffering and check memory.
- [ ] Run two instances with a SignalR Redis backplane and verify cross-instance delivery.
- [ ] Split health checks into live and ready and wire them into a container probe.

## Read next (official)

- [ASP.NET Core middleware](https://learn.microsoft.com/aspnet/core/fundamentals/middleware/)
- [Handle errors in ASP.NET Core](https://learn.microsoft.com/aspnet/core/fundamentals/error-handling)
- [Overview of OpenAPI support in ASP.NET Core API apps](https://learn.microsoft.com/aspnet/core/fundamentals/openapi/overview)
- [Rate limiting middleware in ASP.NET Core](https://learn.microsoft.com/aspnet/core/performance/rate-limit)
- [ASP.NET Core SignalR production hosting and scaling](https://learn.microsoft.com/aspnet/core/signalr/scale)
- [Health checks in ASP.NET Core](https://learn.microsoft.com/aspnet/core/host-and-deploy/health-checks)
