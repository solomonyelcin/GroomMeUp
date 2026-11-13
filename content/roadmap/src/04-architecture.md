# Architecture and system design: patterns, trade-offs and distributed systems

**Interview focus:** you are judged on how you reason about trade-offs, not on naming patterns. For every pattern be ready to say when **not** to use it.

## A framework for any design question

1. **Clarify** requirements: users, scale, read/write ratio, latency, consistency, availability, budget, team size.
2. **Estimate** load (requests per second, data size, growth).
3. Sketch a **simple version first**, then find the bottleneck and evolve it.
4. Name **trade-offs and failure modes** explicitly, and how you would monitor them.

## Clean Architecture

- **Dependency rule:** source code dependencies point inward. Domain (entities and rules) knows nothing about frameworks. Application (use cases) depends on Domain. Infrastructure (EF Core, messaging) and Presentation (API) depend on Application and implement its interfaces.
- Benefits: testable business rules, replaceable infrastructure. Costs: more projects and mapping code. For a small CRUD service it can be over-engineering.
- Common mistake: letting EF Core entities and DTOs leak into the domain, or making "layers" that only forward calls.

## Vertical slice architecture

Organise by **feature** (one folder per use case with its request, handler, validation and data access) instead of by technical layer. Changes touch one place, and each slice can choose its own approach (a read slice can use Dapper, a write slice EF Core). Risks: duplicated code and uneven quality unless you share a few cross-cutting pieces. Many teams combine it with Clean Architecture ideas inside each slice.

## Microservices

- Split along **bounded contexts** (from domain-driven design), each service owning its data. **Database per service** means no cross-service joins.
- Benefits: independent deploys and scaling, team autonomy. Costs: network failure, distributed transactions, observability, versioning, operations. **Start with a modular monolith** and extract a service when there is a real reason (scaling, team ownership, release cadence).
- Signs you split wrongly: chatty calls between services, shared database, deploying several services together.
- Communication: **synchronous** (HTTP/gRPC) is simple but couples availability. **Asynchronous** messaging decouples but adds eventual consistency.

## Event-driven architecture

- **Commands** ask for something to happen (one receiver). **Events** state that something happened (many subscribers).
- Styles: *event notification* (small event, consumers call back for data) vs *event-carried state transfer* (event holds the data so consumers need no callback).
- Delivery is usually **at least once**, so consumers must be **idempotent** (store processed message ids, or make operations naturally idempotent).
- **Outbox pattern:** write the event to an outbox table in the same transaction as the business change, and a background process publishes it. This fixes the "saved but not published" problem.
- **Saga:** a long-running business transaction as a series of local transactions with **compensating actions**. *Choreography* (services react to events) is simple but hard to follow, *orchestration* (a coordinator) is clearer for complex flows.
- Be honest about **eventual consistency**: the user interface must cope with "not updated yet".

## CQRS (and event sourcing)

- **CQRS** separates the write model (commands, rules) from read models (queries optimised for screens). Start simple: same database, different classes. Go further with separate read stores only when the read and write needs really differ.
- **Event sourcing** stores the sequence of events as the source of truth. It gives audit and time travel but costs complexity (versioning events, rebuilding projections). Many systems need CQRS but not event sourcing.
- A mediator library is only a convenience. Check its current **licence** before depending on it, and consider plain handlers or alternatives.

## Design patterns you should be able to use in a sentence

- **Strategy** (swap an algorithm), **Factory** (hide creation), **Decorator** (add behaviour, as in resilience or logging wrappers), **Adapter** (wrap a foreign API), **Observer** (events).
- **Repository and Unit of Work:** EF Core's `DbContext` already is both. Add your own repository only for a reason (hide a query technology, enforce aggregate boundaries).
- **Circuit breaker, retry, bulkhead, timeout** for resilience. **Cache-aside** for reads. **Specification** for reusable queries.
- Anti-patterns: God service, anemic domain with all logic in services, "manager" classes, premature abstraction.

## Distributed systems fundamentals

- **CAP:** during a network partition you choose consistency or availability. Day to day the useful question is **latency vs consistency**. Give examples: a bank balance needs strong consistency, a like counter does not.
- **Idempotency:** the same request twice has the same effect. Use idempotency keys for payments and retries.
- **Timeouts, retries with backoff and jitter, circuit breakers** to stop cascading failure. Retries multiply load: use budgets.
- **Partitioning (sharding)** spreads data and load. The shard key decides hot spots. **Replication** gives availability and read scale, with lag.
- **Two-phase commit** is rarely used across services. Prefer sagas and idempotent steps.
- **Clocks lie:** do not rely on timestamps from different machines to order events. Use version numbers or logical clocks.
- **Backpressure and load shedding:** say no early (queues with limits, rate limits) instead of failing late.
- **Observability** (logs, metrics, traces with a correlation id) is part of the design.

## Example answer shape: "Design a notification service"

Requirements first (channels, volume, delivery guarantee). Accept requests through an API that writes to a queue (fast, durable). Workers per channel consume with retries and a dead-letter queue. Idempotency key prevents duplicate sends. Templates and user preferences in a database with a cache. Rate limit per user and provider. Metrics for queue depth and delivery latency, and a replay tool for failures. Then discuss what changes at 10x load.

## Red flags

- Choosing microservices because "that is modern" without naming the problem.
- A shared database across services.
- Distributed transaction promises with no failure handling.
- No answer to "what happens when this component is down?"

## Tell it from your experience

Pick one real system you worked on and prepare a two-minute architecture walkthrough: context, main components, data flows, one trade-off you made, one thing you would change, and how you measured success. If your work used RabbitMQ, Elasticsearch or Kubernetes, explain why they were chosen and what the failure modes were.

## Skill-upgrade checklist

1. Draw a system design for three common prompts (URL shortener, notification service, order processing) and time yourself for 35 minutes each.
2. Implement an outbox table and a publisher in a sample app.
3. Write an idempotent message handler and a test that delivers the same message twice.
4. Refactor one feature into a vertical slice and compare the diff.
5. Write down, for each pattern above, one case where you would not use it.

## Read next (official)

- [Azure Architecture Center](https://learn.microsoft.com/azure/architecture/)
- [Cloud design patterns](https://learn.microsoft.com/azure/architecture/patterns/)
- [Microservices architecture style](https://learn.microsoft.com/azure/architecture/microservices/)
- [.NET microservices architecture guide](https://learn.microsoft.com/dotnet/architecture/microservices/)
- [Common web application architectures (Clean Architecture)](https://learn.microsoft.com/dotnet/architecture/modern-web-apps-azure/common-web-application-architectures)
