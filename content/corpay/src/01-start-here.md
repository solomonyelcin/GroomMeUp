# Corpay interview: start here (process, evidence and a 3-day plan)

**How to use this section:** read this page first, then the four guides, then drill the Corpay questions and quiz. Everything here is labelled by how sure it is, because public information about Corpay interviews is thin.

## What is known and how sure it is

- **Reported by candidates (Glassdoor, 2025, UK and US offices):** a recruiter call of about 30 minutes, then two to four technical interviews of about an hour each, over roughly two weeks. One US candidate had a take-home task to build an end-to-end API endpoint, then two technical interviews on general .NET knowledge, and got an offer. Others reported a SOLID-based design task ("flexible system for managing user accounts"), a harder LeetCode-style problem, and "what does this .NET snippet output?".
- **Interview-guide sites (inferred, not confirmed):** a guide lists C#/.NET language features, SQL joins and aggregates, OOP and SOLID, arrays and strings problems, REST APIs and layered design, then architecture and behavioural rounds. It also suggests payments topics such as idempotency, ACID, PCI and ACH versus wire.
- **Chennai job listings (public postings, 2026):** a Senior Software Engineer role in Corpay's Alpha division (eMoney and FX platforms) asks for 8+ years, C# and modern .NET on **AWS** with serverless, event-driven design, Kafka, RabbitMQ, EventBridge and SQS/SNS, Kubernetes, SQL and NoSQL, Redis caching, DDD and Clean Architecture, CloudFormation, observability and production support. A separate Senior Full Stack Developer posting exists for the Cross-Border division in Chennai, with no skills listed.
- **Not known:** the exact rounds for your role, whether there is a live coding or take-home step, and whether your team uses AWS or Azure. **Ask the recruiter on the first call** which team, which cloud, how many rounds and whether coding is live. That one question is worth more than any guess here.

## The likely shape of your session

1. Introduction and project walk-through (10 to 15 minutes): be ready to explain one payments-like system end to end.
2. .NET fundamentals and "what does this print?" snippets.
3. SQL and data access (joins, aggregates, transactions, EF Core).
4. API and system design: a small design with SOLID, then reliability: idempotency, retries, messaging, consistency.
5. Cloud and production: AWS or Azure services, observability, root cause analysis of incidents.
6. Behavioural: conflict, ambiguity, mentoring, ownership.

## Your positioning (from your profile)

Nine years of .NET, Angular, Azure, Docker, Kubernetes, RabbitMQ, ElasticSearch and SQL Server at Flex, TCS and others is a strong match for the messaging, Kubernetes and C# parts. The gap to close before Monday is **AWS vocabulary** (guide 3) and **payments reliability language** (guide 2). Say plainly "my production cloud is Azure; the AWS equivalent is X, and I have used the same patterns with RabbitMQ" rather than bluffing.

## 3-day plan (Saturday, Sunday, Monday morning)

- **Saturday:** read guides 2 and 3, then answer the "Payments and reliability" and "AWS" questions aloud. Do 10 C# output snippets from guide 4.
- **Sunday:** guide 4 coding playbook: code the user-management design and the unique-ID class on a plain editor with the screen shared, timed. Do the SQL questions. Draft three STAR stories (guide 5).
- **Monday morning:** one live mock interview with the Corpay round, review the weak topics, re-read the red-flag lists, prepare 5 questions to ask them, test your microphone, camera and internet.

## Interview-day rules

Clarify requirements before coding. Think aloud. State trade-offs. Say what you would test. If you do not know something, say how you would find out. Keep answers to 60 to 90 seconds unless asked to go deeper, and give one real number from your experience.
