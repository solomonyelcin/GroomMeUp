# Production AI: observability, cost, security, limits and delivery

**Interview focus:** a demo that works once is easy. Seniors are asked how it behaves with real users: is it observable, safe, fast, affordable, and can you ship changes without breaking it?

## Observability for AI systems

- **Traces:** one trace per user request with spans for retrieval, each model call, each tool call and post-processing. Use **OpenTelemetry** with a correlation id, and follow the GenAI semantic conventions for attributes (model name, token counts, finish reason). Many `Microsoft.Extensions.AI` pipelines have `UseOpenTelemetry()`.
- **Metrics:** request rate, error rate, latency percentiles (P50, P95, P99), time to first token, input and output tokens, cost per request, cache hit rate, rate-limit (429) count, tool-call failures, retrieval hit quality.
- **Logs:** structured, with ids, not free text. **Do not log raw prompts and answers by default**: they can contain personal data. Redact, sample, set retention, restrict access.
- **Quality signals:** thumbs up or down, edits, escalations to a human, task completion, re-asks. Review a sample of conversations regularly.
- **Alerts** on symptoms users feel (latency, error spikes, cost per hour) and on quality drops, not only CPU.
- Tools: Application Insights or Azure Monitor, Grafana, OpenTelemetry Collector, and the evaluation and tracing features of the model platform you use.

## Logging and monitoring: what good looks like

- One dashboard answers: Is it up? Is it fast? Is it correct enough? How much does it cost today?
- Tag every call with feature, tenant and model so you can break down cost and quality.
- **Model drift:** providers update models and your data changes, so a fixed test set run on a schedule catches silent regressions.

## AI cost optimisation

Cost is mostly **tokens times price per token**, plus search and hosting.

- **Pick the smallest model that passes your evaluation.** Route easy tasks to a small model and hard ones to a larger one.
- **Shorten prompts:** remove repeated instructions, send fewer and better chunks (top-k), summarise long history.
- **Prompt caching** for stable prefixes, **response caching** for repeated questions, and **semantic caching** (similar questions) with care for correctness and privacy.
- **Cap output** with max tokens and clear format instructions.
- **Batch** non-urgent work (many providers offer cheaper batch processing) and embed once, not on every request.
- **Budgets and quotas** per user, tenant or feature, with alerts and hard stops.
- Measure **cost per successful task**, not only cost per call. A cheaper model that fails and retries may cost more.

## Security for AI applications

- **Prompt injection** (direct and indirect): treat all retrieved or user-supplied text as untrusted. Keep instructions and data separate, limit what the model can do, validate outputs before using them.
- **Least privilege for tools:** a tool runs with the permissions of the signed-in user, not a super account. Require approval for writes and money. Allow-list what tools can touch.
- **Data protection:** classify data, redact personal data, honour retention rules, check the provider's data handling and region options, encrypt in transit and at rest.
- **Authorisation in retrieval:** filter search results by what the user may see. Test that user A cannot get user B's documents through the assistant.
- **Secrets:** Key Vault and managed identity, no keys in prompts or logs.
- **Abuse and cost attacks:** authentication, rate limits, input length limits, bot protection.
- **Supply chain:** pin model and package versions, review third-party MCP servers and plugins.
- Use content safety filters, and keep an incident process. The OWASP Top 10 for LLM applications is a good checklist to quote.

## Rate limiting and resilience

- Two sides: **limit your own users** and **respect the provider's limits**.
- ASP.NET Core has built-in **rate limiting middleware** (fixed window, sliding window, token bucket, concurrency). Partition by user or API key.
- Provider limits (requests and tokens per minute): handle **429** with `Retry-After`, **exponential backoff with jitter**, a bounded queue, and fall back to another deployment or a smaller model.
- Add **timeouts**, **circuit breakers** (`Microsoft.Extensions.Http.Resilience`) and **graceful degradation** (return a cached or simpler answer, or a clear message).
- Stream responses so users see progress, and let them cancel.

```csharp
builder.Services.AddRateLimiter(o => o.AddPolicy("chat", ctx =>
    RateLimitPartition.GetTokenBucketLimiter(ctx.User.Identity?.Name ?? "anon", _ => new TokenBucketRateLimiterOptions
    {
        TokenLimit = 20, TokensPerPeriod = 20, ReplenishmentPeriod = TimeSpan.FromMinutes(1), QueueLimit = 0
    })));
```

## CI/CD for AI features

- Treat **prompts, model versions, retrieval settings and tool definitions as code** in source control, with review.
- In the pipeline run **unit tests** (fake `IChatClient`), **evaluation tests** on a golden set with pass thresholds for correctness, groundedness, safety, latency and cost, and a **security scan**.
- Roll out with **feature flags**, **canary** or percentage rollout and **shadow runs**, and keep a one-click rollback to the previous prompt or model.
- Infrastructure as code (Bicep or Terraform), environments per stage, and secrets from Key Vault.
- Ingestion pipelines (re-indexing) need versioned indexes and a safe cut-over.

## Performance tuning

- **Streaming** and showing partial results improves perceived speed most.
- **Parallelise** independent calls (retrieval and moderation together), but watch rate limits.
- Use smaller models, shorter prompts, caching and fewer sequential tool loops.
- Batch embeddings, reuse HTTP connections (`HttpClientFactory`), keep vector search close to the app in the same region.
- Measure the breakdown (retrieval time, model time, post-processing) before optimising.

## Red flags

- No budget or limit per user.
- Logging full conversations with personal data in plain text.
- Shipping prompt changes without running the evaluation set.
- One model, one region, no fallback.

## Tell it from your experience

Connect to what you already do: distributed tracing and metrics, queues and retries, rate limiting in the gateway, secrets in Key Vault, Kubernetes autoscaling. Prepare a short answer to "how would you take this prototype to production?": security review, evaluation set, observability, cost controls, rollout plan and an on-call runbook.

## Skill-upgrade checklist

1. Add OpenTelemetry traces to an LLM call and show token counts in a dashboard.
2. Implement a per-user token budget and a 429 handler with backoff.
3. Create an evaluation set of 30 cases and run it in a pipeline with a pass threshold.
4. Write a prompt injection test suite and keep it in CI.
5. Compare two models on cost per successful task and write down the result.

## Read next

- [OpenTelemetry for .NET](https://learn.microsoft.com/dotnet/core/diagnostics/observability-with-otel)
- [Rate limiting middleware in ASP.NET Core](https://learn.microsoft.com/aspnet/core/performance/rate-limit)
- [Build resilient HTTP apps in .NET](https://learn.microsoft.com/dotnet/core/resilience/http-resilience)
- [OWASP Top 10 for LLM applications](https://genai.owasp.org/llm-top-10/)
- [Microsoft Foundry documentation](https://learn.microsoft.com/azure/foundry/)
