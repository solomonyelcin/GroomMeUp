# Cloud-native development on Azure: Docker, Kubernetes, PaaS and messaging

**Interview focus:** choosing the right hosting model, making services safe to run in many copies, and explaining secrets, scaling and failure handling.

## Docker for .NET

- A container image is built from **layers**. Put things that change rarely (restore) before things that change often (your code) so the cache is reused.
- Use a **multi-stage build**: SDK image to build and publish, then copy the output to the small ASP.NET runtime image.
- Run as a **non-root user**, use a small base (Alpine or "chiseled" images), add a `.dockerignore`, and set a **health check**.
- The .NET SDK can build an image **without a Dockerfile**: `dotnet publish -t:PublishContainer`.
- One process per container, log to stdout, configuration from environment variables, no state on the container disk.

```dockerfile
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY *.csproj .
RUN dotnet restore
COPY . .
RUN dotnet publish -c Release -o /app --no-restore

FROM mcr.microsoft.com/dotnet/aspnet:10.0
WORKDIR /app
COPY --from=build /app .
USER $APP_UID
ENTRYPOINT ["dotnet", "Orders.Api.dll"]
```

## Kubernetes basics (what a senior engineer should say clearly)

| Object | Purpose |
| --- | --- |
| Pod | Smallest unit, one or more containers sharing network and storage |
| Deployment | Keeps N replicas running and does rolling updates and rollbacks |
| Service | Stable address and load balancing across pods |
| Ingress | HTTP routing from outside to services |
| ConfigMap and Secret | Configuration and sensitive settings injected as env vars or files |
| HPA | Scales replicas on CPU, memory or custom metrics |

- **Probes:** *liveness* restarts a stuck container, *readiness* removes a pod from traffic until it can serve, *startup* gives slow apps time to boot. A readiness probe that checks a downstream dependency can take your whole service out when that dependency blips, so keep it shallow.
- Set **resource requests and limits**. Requests drive scheduling, limits cap usage. A memory limit that is too low gives OOMKilled pods, a CPU limit that is too low causes throttling.
- **Graceful shutdown:** on SIGTERM stop accepting work, finish in-flight requests, then exit. Set `terminationGracePeriodSeconds` and honour the host's stopping token.
- Secrets in Kubernetes are only base64 by default. Use an external store (Key Vault with a CSI driver or workload identity) and RBAC.
- Debug with `kubectl describe`, `logs`, `get events`, `top`, and `rollout undo`.

## Azure hosting options: how to choose

| Service | Pick it when |
| --- | --- |
| **App Service** | A standard web app or API, you want PaaS simplicity, deployment slots, built-in scaling and auth |
| **Container Apps** | Containerised services or APIs, scale to zero, event-driven scaling (KEDA), Dapr, revisions and traffic splitting, without managing Kubernetes |
| **AKS** | You need full Kubernetes control, custom networking, many services and a platform team |
| **Azure Functions** | Event-driven, short tasks, timers, queue processors, glue code |

- **App Service:** an App Service plan sets the compute. Use **deployment slots** to warm up and swap with zero downtime, and slot settings for per-slot configuration.
- **Container Apps:** runs on managed Kubernetes. Scale rules react to HTTP load, queue length or custom metrics, and can scale to zero. Each deployment creates a **revision**.
- **Azure Functions:** use the **isolated worker model** for .NET (the older in-process model has reached or is reaching end of support, so check the lifecycle page). Hosting plans differ in cold start, scale limits and cost (Consumption, Flex Consumption, Premium). Use **Durable Functions** for orchestrations and fan-out/fan-in.
- Cost thinking: scale to zero saves money but adds cold start. Reserved capacity helps steady loads.

## Azure Service Bus

- **Queues** for point to point work, **topics and subscriptions** for publish and subscribe with filters.
- **Peek-lock** receive: the message is locked, you complete it after success, otherwise it returns to the queue. Delivery is **at least once**, so handlers must be **idempotent**.
- **Dead-letter queue** collects messages that exceed the delivery count or expire. Monitor and replay it.
- **Sessions** give ordered processing per key. **Duplicate detection** drops repeats within a window. **Scheduled messages** and **transactions** exist too.
- Compare: **Event Grid** (reactive events, push), **Event Hubs** (high-volume streaming), **Storage Queues** (simple and cheap), **RabbitMQ** (self-managed, rich routing). Say which you used and why.

```csharp
await using var processor = client.CreateProcessor("orders", new ServiceBusProcessorOptions
{
    MaxConcurrentCalls = 8,
    AutoCompleteMessages = false
});
processor.ProcessMessageAsync += async args =>
{
    await handler.HandleAsync(args.Message, args.CancellationToken);   // must be idempotent
    await args.CompleteMessageAsync(args.Message, args.CancellationToken);
};
```

## Azure Key Vault and identity

- Store **secrets, keys and certificates** in Key Vault. Never in source, config files in the repo or pipeline logs.
- Use a **managed identity** and `DefaultAzureCredential`, so the app needs no stored secret to reach Key Vault, Storage, Service Bus or SQL.
- Grant access with **Azure RBAC** at the least scope. App Service and Container Apps can read settings via **Key Vault references**.
- Turn on **soft delete and purge protection**, rotate secrets, and use **Key Vault keys** for signing and encryption instead of exporting them.

## Azure API Management (APIM)

- A **gateway** in front of your APIs: authentication (validate JWT), **rate limiting and quotas**, request and response **transformation**, **caching**, **versioning**, products and subscription keys, and a developer portal.
- **Policies** are XML snippets applied at inbound, backend, outbound and on-error stages.
- It centralises cross-cutting concerns but is a single point to design for (use the zonal and multi-region tiers when needed). Do not put business logic in policies.
- Compare it with a simple reverse proxy (YARP) or the Application Gateway/Front Door: APIM is API management, not just routing.

## Resilience in the cloud

- Everything remote fails sometimes: use **timeouts, retries with exponential backoff and jitter, circuit breakers and bulkheads** (`Microsoft.Extensions.Http.Resilience` or Polly).
- Retries only for **idempotent** operations or with idempotency keys.
- Health endpoints, graceful degradation, and an on-call runbook matter as much as the code.

## Red flags

- Secrets in environment variables committed to git, or connection strings with admin passwords.
- One giant container doing several jobs, or state kept on local disk.
- "We scale by adding more VMs" with no autoscale rule or load test.
- A liveness probe that depends on the database.

## Tell it from your experience

You already run Docker and Kubernetes at work. Prepare: how a deployment reaches production (pipeline, image, rollout), one incident (what the probes, logs and metrics showed, how you fixed it), how secrets are managed, and a cost or scaling decision. Be ready to say how you would run the same service on Container Apps and what you would gain or lose versus AKS.

## Skill-upgrade checklist

1. Publish a .NET API to a container with `PublishContainer`, run it non-root and add a health check.
2. Deploy it to Azure Container Apps with a Service Bus queue scale rule.
3. Read a secret from Key Vault using managed identity, locally and in Azure.
4. Put the API behind APIM with a JWT validation policy and a rate limit.
5. Break a pod on purpose (bad readiness path, too-low memory limit) and fix it from the events.

## Read next (official)

- [Containerize a .NET app](https://learn.microsoft.com/dotnet/core/docker/build-container)
- [Kubernetes concepts](https://kubernetes.io/docs/concepts/)
- [Azure App Service](https://learn.microsoft.com/azure/app-service/)
- [Azure Container Apps](https://learn.microsoft.com/azure/container-apps/)
- [Azure Functions](https://learn.microsoft.com/azure/azure-functions/)
- [Azure Service Bus messaging](https://learn.microsoft.com/azure/service-bus-messaging/)
- [Azure Key Vault](https://learn.microsoft.com/azure/key-vault/)
- [Azure API Management](https://learn.microsoft.com/azure/api-management/)
