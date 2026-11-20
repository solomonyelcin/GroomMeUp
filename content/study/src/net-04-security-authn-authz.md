# Security: authentication and authorization in ASP.NET Core: senior study guide

**Who this is for:** an experienced .NET engineer who builds APIs and web apps and must explain how identity flows through them: which OAuth2/OIDC flow fits which client, how ASP.NET Core validates tokens and enforces policies, and which API weaknesses attackers actually exploit. Targets ASP.NET Core on .NET 10 (LTS), with notes for .NET 8.

## What interviewers expect at senior level

- You separate authentication (who) from authorization (what they may do) and from identity provider concerns.
- You pick the right OAuth2 flow for a SPA, a service and a device, and explain why implicit flow is gone.
- You validate a JWT completely and can say what goes wrong when you skip a check.
- You design refresh-token handling that survives theft.
- You configure CORS, CSRF defences, rate limiting, data protection and secrets correctly in a multi-instance deployment.
- You map findings to the OWASP API Security Top 10, starting with object-level authorization.

## OAuth2, OIDC and JWT in one picture

**OAuth2** delegates access: a client obtains an **access token** from an authorization server to call an API. **OpenID Connect (OIDC)** layers authentication on top: it adds the **ID token** (a JWT about the user, for the client), the `openid` scope, the `/userinfo` endpoint and a discovery document at `/.well-known/openid-configuration` that publishes endpoints and the signing keys (JWKS). The access token is for the API; the ID token is not an API credential.

| Flow | Use for | Notes |
| --- | --- | --- |
| Authorization Code + PKCE | SPAs, mobile, native, and server web apps | the default for user sign-in; PKCE binds the code to the client that started it |
| Client credentials | service to service, no user | confidential client with a secret or certificate |
| Device code | TVs, CLIs, input-limited devices | user approves on another device |
| Refresh token | renewing access without a new login | rotate and detect reuse |
| Implicit, resource owner password | none | deprecated and removed in OAuth 2.1 because tokens leak in URLs or credentials reach the client |

A **JWT** is `header.payload.signature`, base64url encoded. It is signed (JWS), not encrypted, so never put secrets in claims. Validation checklist for an API:

- signature with a key fetched from the issuer's JWKS, algorithm pinned (reject `none` and algorithm confusion);
- `iss` equals the expected authority, `aud` equals your API;
- `exp` and `nbf` with a small clock skew (default is five minutes, often reduced);
- the token type and scope or role claims your policy needs.

```csharp
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(o =>
    {
        o.Authority = "https://login.example.com/";   // discovery and JWKS
        o.Audience  = "orders-api";
        o.TokenValidationParameters.ClockSkew = TimeSpan.FromMinutes(1);
    });
```

Since .NET 8 the JwtBearer handler uses `JsonWebTokenHandler`, which is faster than the older handler. Claim type mapping changed over time, so check whether claim names such as `sub` and `role` arrive as short names or mapped long URIs when your policies do not match.

## ASP.NET Core authentication and authorization

Authentication builds a `ClaimsPrincipal` from a scheme: JWT bearer for APIs, cookies for server-rendered apps, `AddOpenIdConnect` for sign-in against an identity provider. Order matters:

```csharp
app.UseHttpsRedirection();
app.UseCors();
app.UseAuthentication();
app.UseAuthorization();
```

Authorization is declarative and layered:

| Mechanism | Example | Use |
| --- | --- | --- |
| Role | `[Authorize(Roles = "Admin")]` | coarse, easy, role explosion over time |
| Claim policy | `policy.RequireClaim("scope", "orders.read")` | scopes and attributes |
| Custom requirement and handler | `IAuthorizationRequirement` + `AuthorizationHandler<T>` | rules that need services |
| Resource-based | `IAuthorizationService.AuthorizeAsync(user, order, "CanEdit")` | decisions that depend on the loaded object |
| Fallback policy | `options.FallbackPolicy = new AuthorizationPolicyBuilder().RequireAuthenticatedUser().Build()` | secure by default, opt out with `[AllowAnonymous]` |

```csharp
builder.Services.AddAuthorizationBuilder()
    .AddPolicy("OrdersRead", p => p.RequireClaim("scope", "orders.read"))
    .SetFallbackPolicy(new AuthorizationPolicyBuilder().RequireAuthenticatedUser().Build());

app.MapGet("/orders/{id}", async (int id, ClaimsPrincipal user, IAuthorizationService authz, OrdersDb db) =>
{
    var order = await db.Orders.FindAsync(id);
    if (order is null) return Results.NotFound();
    var ok = await authz.AuthorizeAsync(user, order, "CanView");
    return ok.Succeeded ? Results.Ok(order) : Results.Forbid();
}).RequireAuthorization("OrdersRead");
```

The example shows both layers: the endpoint policy checks the scope, the resource check ensures this user owns this order. `401` means unauthenticated, `403` means authenticated but not allowed. `AddAuthorizationBuilder` is available from .NET 7 to 8. ASP.NET Core Identity adds users, password hashing (PBKDF2 by default), lockout and 2FA; .NET 8 added `MapIdentityApi` for token and cookie endpoints for simple apps, and .NET 10 adds passkey (WebAuthn) support. For production APIs with many clients, delegate to an identity provider (Microsoft Entra ID, Auth0, Keycloak, Duende IdentityServer) instead of issuing tokens yourself.

## Refresh tokens and token storage

Access tokens should be short-lived (minutes). A refresh token lets the client obtain new access tokens without the user. Because it is long-lived, protect it:

- **Rotation:** each use returns a new refresh token and invalidates the old one. If an old one is presented again, treat it as theft and revoke the whole token family.
- Store only a hash server-side, bind it to a client and device, and give it an absolute lifetime.
- Public clients (SPAs): prefer the **backend-for-frontend (BFF)** pattern, where the server holds the tokens and the browser has only an `HttpOnly`, `Secure`, `SameSite` session cookie. Tokens in `localStorage` are readable by any XSS payload.
- Revoke on logout and on password change. JWTs cannot be revoked before expiry without a deny list or introspection, which is the main reason to keep them short.

## CORS and CSRF

**CORS** is a browser rule that relaxes the same-origin policy for specific origins. It does not protect your server from non-browser callers, and it is not authentication.

```csharp
builder.Services.AddCors(o => o.AddDefaultPolicy(p => p
    .WithOrigins("https://app.example.com")
    .WithMethods("GET", "POST")
    .WithHeaders("Authorization", "Content-Type")));
```

Never combine `AllowAnyOrigin` with credentials; list explicit origins. Call `UseCors` before authentication so preflight (OPTIONS) requests are answered.

**CSRF** exploits the browser attaching cookies automatically to a cross-site request. It affects cookie-authenticated apps. A bearer token sent in the `Authorization` header is not attached automatically, so pure token APIs are not vulnerable to classic CSRF. Defences: `SameSite=Lax` or `Strict` cookies, antiforgery tokens (`AddAntiforgery`, `[ValidateAntiForgeryToken]`, `app.UseAntiforgery()` for minimal API forms in .NET 8), and checking `Origin` for state-changing requests. Do not mutate state on GET.

## Rate limiting

ASP.NET Core ships rate limiting middleware (.NET 7+, `Microsoft.AspNetCore.RateLimiting`) with fixed window, sliding window, token bucket and concurrency limiters.

```csharp
builder.Services.AddRateLimiter(o =>
{
    o.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    o.AddPolicy("per-user", ctx => RateLimitPartition.GetTokenBucketLimiter(
        ctx.User.Identity?.Name ?? ctx.Connection.RemoteIpAddress?.ToString() ?? "anon",
        _ => new TokenBucketRateLimiterOptions
        {
            TokenLimit = 20, TokensPerPeriod = 10, ReplenishmentPeriod = TimeSpan.FromSeconds(1),
            QueueLimit = 0
        }));
});
app.UseRateLimiter();
app.MapPost("/login", Login).RequireRateLimiting("per-user");
```

Partition by user, API key or IP. Behind a proxy or load balancer, configure `ForwardedHeaders` so the client IP is real, and remember that in-memory limiters are per instance; for a global limit use the gateway or a distributed store. Send `Retry-After` on 429. Rate limiting also supports the OWASP concern of unrestricted resource consumption and brute-force protection on login.

## Data Protection and secrets

The **Data Protection API** encrypts and signs payloads for cookies, antiforgery tokens and `IDataProtector` data. It manages a key ring with automatic rotation. In multiple instances, all must share the same keys and application name, or cookies from one pod fail on another:

```csharp
builder.Services.AddDataProtection()
    .SetApplicationName("orders")
    .PersistKeysToAzureBlobStorage(blobUri)         // or file share, Redis, database
    .ProtectKeysWithAzureKeyVault(keyId, credential);
```

It is for short to medium-lived payloads, not an archive format: keys expire from the ring eventually. Use proper encryption (AES-GCM with a managed key) for data at rest that must stay readable long term.

**Secrets:** never in source control or images. Development uses `dotnet user-secrets`; production uses environment variables from the platform or, better, Azure Key Vault with a managed identity through `DefaultAzureCredential`, so there is no stored credential to leak. Prefer certificates or federated workload identity over client secrets, set expiries, rotate, and keep secrets out of logs and exception messages. Also: enforce HTTPS and HSTS, hash passwords with a slow adaptive function (Identity does), and scan dependencies for known vulnerabilities (`dotnet list package --vulnerable`).

## OWASP API Security Top 10 (2023) for .NET teams

| Id | Issue | Typical .NET mitigation |
| --- | --- | --- |
| API1 | Broken object level authorization (BOLA) | resource-based checks on every id-based route, never trust the id alone |
| API2 | Broken authentication | validated tokens, lockout, MFA, short lifetimes |
| API3 | Broken object property level authorization | return DTOs, not entities; block mass assignment by binding to input models |
| API4 | Unrestricted resource consumption | rate limits, paging caps, request size and timeout limits |
| API5 | Broken function level authorization | policies on admin endpoints, fallback policy |
| API6 | Unrestricted access to sensitive business flows | per-flow throttling, bot detection, step-up checks |
| API7 | Server-side request forgery | allow-list outbound hosts, block internal ranges |
| API8 | Security misconfiguration | strict CORS, no detailed errors in production, security headers |
| API9 | Improper inventory management | retire old versions, document and gateway every endpoint |
| API10 | Unsafe consumption of APIs | validate and size-limit data from third parties like user input |

BOLA is the most common finding: `/orders/123` returns the order if any authenticated user asks for it.

## Common traps and red flags

- Missing `aud` or `iss` validation, or disabling `ValidateLifetime` to fix a clock issue.
- Authorizing by role only and never checking the resource owner.
- `UseAuthorization` placed before `UseAuthentication`, or `UseCors` placed after them.
- `AllowAnyOrigin` with credentials, treating CORS as a security control.
- Tokens in `localStorage`, long-lived access tokens, refresh tokens without rotation.
- Data Protection keys on the container's local disk in a scaled-out service.
- Rate limiter keyed on a proxy IP, so everyone shares one bucket.
- Returning EF entities directly (mass assignment and over-posting).
- Secrets in `appsettings.json` committed to git; verbose exception pages in production.
- Using implicit flow or password grant because a tutorial did.

## 10 questions to practise

1. Why Authorization Code with PKCE for a SPA? *It keeps tokens out of the URL and proves the code redeemer started the flow; implicit is deprecated.*
2. What is the difference between an access token and an ID token? *Access token is for the API; ID token tells the client who signed in.*
3. List the checks when validating a JWT. *Signature and algorithm, issuer, audience, expiry and not-before, and required claims.*
4. How would you design refresh token rotation? *New token per use, hashed storage, reuse detection revokes the family, absolute lifetime.*
5. Roles versus policies versus resource-based authorization? *Roles are coarse, policies express rules over claims, resource-based decides using the loaded object.*
6. What does a fallback policy give you? *Every endpoint requires authentication unless explicitly marked anonymous.*
7. Does CORS protect the API? Is a bearer API open to CSRF? *No, it only governs browsers; header tokens are not auto-sent, cookies are, so cookie apps need antiforgery and SameSite.*
8. How do you rate limit per user and in a scaled-out deployment? *Partitioned limiter keyed on user, plus a gateway or shared store for a global limit.*
9. What breaks when Data Protection keys are not shared across instances? *Cookies and antiforgery tokens issued by one instance fail on another and users get signed out.*
10. Explain BOLA and how you prevent it. *Accessing another user's object by changing an id; enforce ownership checks per resource and use unguessable ids as defence in depth.*

## Skill-upgrade checklist

- [ ] Build an API protected by JwtBearer against a local Keycloak or Entra ID test tenant and inspect the tokens.
- [ ] Write a custom `AuthorizationHandler` and a resource-based check, with unit tests.
- [ ] Set a fallback policy and confirm anonymous endpoints are explicit.
- [ ] Implement a SPA login with a BFF and cookie session instead of storing tokens in the browser.
- [ ] Add a token bucket limiter per user and verify 429 plus `Retry-After`.
- [ ] Run two instances with a shared Data Protection key ring and confirm cookies work across them.
- [ ] Move one secret from `appsettings` to Key Vault with a managed identity.
- [ ] Test your own API for BOLA by calling it with a second user's token.

## Read next (official)

- [ASP.NET Core security overview](https://learn.microsoft.com/aspnet/core/security/)
- [Policy-based authorization](https://learn.microsoft.com/aspnet/core/security/authorization/policies)
- [Resource-based authorization](https://learn.microsoft.com/aspnet/core/security/authorization/resourcebased)
- [Enable cross-origin requests (CORS)](https://learn.microsoft.com/aspnet/core/security/cors)
- [Prevent cross-site request forgery](https://learn.microsoft.com/aspnet/core/security/anti-request-forgery)
- [Rate limiting middleware](https://learn.microsoft.com/aspnet/core/performance/rate-limit)
- [Data Protection overview](https://learn.microsoft.com/aspnet/core/security/data-protection/introduction)
- [Safe storage of app secrets in development](https://learn.microsoft.com/aspnet/core/security/app-secrets)
