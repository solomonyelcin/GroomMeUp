# AWS for a .NET engineer who knows Azure

**Why this matters:** a public Corpay Chennai listing for the Alpha division asks for C# on AWS with serverless, SQS/SNS, EventBridge, Kafka, RabbitMQ and CloudFormation. If your team uses AWS, you must speak its vocabulary. Your Azure and messaging experience transfers; show that you know the mapping and be honest about hands-on depth.

## Azure to AWS map

| Need | Azure | AWS |
|---|---|---|
| Functions | Azure Functions | Lambda |
| Queue | Service Bus queue / Storage queue | SQS (standard or FIFO) |
| Pub/sub topic | Service Bus topic | SNS (fan out to SQS) |
| Event routing | Event Grid | EventBridge |
| API gateway | API Management | API Gateway |
| Containers | Container Apps / AKS | ECS (Fargate) / EKS |
| Secrets | Key Vault | Secrets Manager / Parameter Store, KMS for keys |
| Identity | Managed identity | IAM roles |
| NoSQL | Cosmos DB | DynamoDB |
| Relational | Azure SQL | RDS / Aurora |
| Cache | Azure Cache for Redis | ElastiCache |
| IaC | Bicep / ARM | CloudFormation (or CDK) |
| Monitoring | Application Insights | CloudWatch, X-Ray |
| Streaming | Event Hubs | Kinesis, or MSK (managed Kafka) |

## C# on Lambda

- **Runtime:** use the current .NET Lambda runtime (check the AWS docs for the supported .NET version). Handlers take an event and an ILambdaContext; the AWS SDK for .NET provides the clients.
- **Cold starts:** reduce with smaller packages, ReadyToRun or Native AOT, provisioned concurrency, lazy initialisation, and creating SDK clients outside the handler so they are reused across invocations.
- **Limits to know:** maximum run time of 15 minutes, memory sets CPU, concurrency limits, payload size limits. Long work goes to Step Functions, ECS or a queue.
- **Dependency injection:** build a ServiceProvider once at start-up; keep handlers thin.

## Messaging semantics (the favourite topic)

- **SQS standard:** at-least-once delivery and best-effort ordering, so consumers must be idempotent. **FIFO:** ordering per message group id and exactly-once processing within a deduplication window, with lower throughput.
- **Visibility timeout:** a received message is hidden while you process it; if you do not delete it before the timeout it returns. Set it longer than the handler time. Use a **dead-letter queue** with a max receive count, and alarm on DLQ depth.
- **SNS plus SQS fan-out:** publish once, each subscriber has its own queue and retry policy.
- **EventBridge:** rule-based routing of events by pattern to targets, schema registry, good for domain events between services.
- **Lambda with SQS:** use partial batch responses so one bad message does not retry the whole batch.
- **Kafka:** log of partitions; ordering only inside a partition (key by account or payment id); consumers in a group track offsets; commit after processing for at-least-once; use idempotent producers and the outbox. **RabbitMQ:** exchanges, queues, acks, prefetch, dead-letter exchanges. Compare honestly: queue (work distribution, delete after ack) versus log (replay, many consumers, ordering per key).

## IAM and security basics

Roles, not access keys; least-privilege policies; the application assumes a role; secrets in Secrets Manager; encrypt with KMS; VPC and security groups for network isolation. Same principles as managed identity plus RBAC.

## Observability

Structured JSON logs with a correlation id to CloudWatch, metrics and alarms, distributed traces with X-Ray or OpenTelemetry. Alert on symptoms (error rate, latency, DLQ depth, consumer lag), not only CPU.

## CloudFormation in one minute

Declarative templates define resources; a stack is a deployed template; change sets preview updates; drift detection finds manual changes; use parameters and outputs; roll back on failure. Similar to Bicep. Keep infrastructure in source control and deploy through a pipeline.

## Red flags

- saying "I know AWS" with no example; instead say what you used and what you would look up;
- a Lambda that creates a new HttpClient per call;
- assuming SQS standard keeps order or never duplicates;
- no dead-letter queue or no alarm on it.

## Skill-upgrade checklist

- [ ] Recite the Azure to AWS table from memory.
- [ ] Explain visibility timeout, DLQ and partial batch response.
- [ ] Explain Kafka partition ordering and consumer groups.
- [ ] Explain cold starts and two fixes.
- [ ] Do one hands-on lab in the free tier (a Lambda triggered by SQS) before Monday if time allows.

## Read next (official)

- [AWS Lambda: C# developer guide](https://docs.aws.amazon.com/lambda/latest/dg/lambda-csharp.html)
- [Amazon SQS: developer guide](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/welcome.html)
- [Amazon EventBridge: user guide](https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-what-is.html)
- [AWS CloudFormation: user guide](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/Welcome.html)
- [Apache Kafka: introduction](https://kafka.apache.org/intro)
