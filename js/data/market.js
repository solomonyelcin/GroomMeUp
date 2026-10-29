// Market intelligence used by the "Market" page and for weighting practice.
// Everything here is a summary of public hiring write-ups and interview-prep articles found in October 2026.
// Salary figures are INDICATIVE only: they come from a training-provider blog without cited data.
export const MARKET = {
  updated: "2026-10-29",
  demand: [
    { skill: "ASP.NET Core / Web API / C#", weight: 5, note: "Core of every .NET full stack posting; expect depth on async, DI, EF Core and API design." },
    { skill: "Angular (or React) with TypeScript", weight: 5, note: "Senior bar in 2026: signals vs RxJS, OnPush/zoneless, architecture and performance trade-offs." },
    { skill: "SQL Server + query tuning", weight: 5, note: "Indexes, execution plans, isolation levels and window functions are asked in almost every round." },
    { skill: "Azure + Docker + Kubernetes + CI/CD", weight: 5, note: "Cloud migration and cloud-native delivery drive most openings." },
    { skill: "Microservices, messaging, resilience", weight: 4, note: "Saga, outbox, idempotency, RabbitMQ/Kafka/Service Bus, circuit breakers, observability." },
    { skill: "System design", weight: 4, note: "Decides senior vs lead offers. Practise trade-off talk, not just boxes and arrows." },
    { skill: "Snowflake / data platforms", weight: 3, note: "Differentiator for you: micro-partitions, warehouses, streams/tasks, cost control." },
    { skill: "AI-assisted engineering + LLM integration", weight: 3, note: "Rising: using AI tools safely, RAG, Microsoft.Extensions.AI/Semantic Kernel, prompt-injection awareness." },
    { skill: "Security (OIDC, OWASP)", weight: 3, note: "Expect scenario questions on tokens, authorisation and API risks." },
  ],
  roundTypes: [
    { round: "Recruiter / HR screen", focus: "Tell me about yourself, notice period, current and expected CTC, relocation, why leaving.", tip: "Have a 90-second pitch and a researched salary range ready." },
    { round: "Technical 1: fundamentals", focus: "C#/.NET internals, async, EF Core, SQL, Angular/RxJS, REST API design.", tip: "Answer with a definition, a concrete example, a pitfall." },
    { round: "Coding / live problem", focus: "Arrays, hashing, strings, a small design (LRU, rate limiter), SQL query, sometimes pair-programming on an API.", tip: "Talk through trade-offs, write tests/edge cases, state complexity." },
    { round: "Technical 2 / architecture", focus: "System design, microservices patterns, cloud, data, security, scalability, your project deep dive.", tip: "Clarify requirements, estimate scale, discuss failure modes." },
    { round: "Hiring manager / behavioural", focus: "Leadership, conflict, mentoring, ownership, impact numbers.", tip: "STAR with metrics you can defend." },
    { round: "Offer / negotiation", focus: "Total compensation, notice period buy-out, joining date, role level.", tip: "Negotiate once, calmly, using the whole package." },
  ],
  salaryIndicative: {
    note: "From a single training-provider article (nareshit.com, 2026). Treat as a rough guide only, then check AmbitionBox, Glassdoor, Levels.fyi and recruiter feedback for your target companies.",
    rows: [
      { level: "Mid-level (2-5 years)", range: "8-15 LPA" },
      { level: "Senior (5+ years)", range: "18-30+ LPA (higher possible at product companies)" },
    ],
  },
  hiringCities: ["Hyderabad", "Bengaluru", "Pune", "Chennai", "Mumbai", "Gurgaon", "Noida"],
  strategy: [
    "Aim for product companies and global capability centres (GCCs) as well as service firms: they test depth, so your project stories and system design must be sharp.",
    "Position yourself as 'senior full stack + data/cloud': .NET 10 + Angular + Snowflake + Kubernetes + messaging is a strong, specific combination.",
    "Turn each project into three artefacts: a 2-minute pitch, an architecture sketch you can draw in 5 minutes, and 3 defended metrics.",
    "Fix resume risks before applying: two overlapping latency numbers on MDS, and metrics that need a stated baseline.",
    "Apply broadly in waves; use the Interview Log to learn from every round and feed weak topics back into practice.",
  ],
  sources: [
    { t: "Full Stack .NET Developer Career Opportunities in India 2026 (Naresh IT)", u: "https://nareshit.com/blogs/full-stack-net-developer-career-opportunities-in-india-2026" },
    { t: "Senior Angular Interview Questions 2026 (DEV Community)", u: "https://dev.to/cristiansifuentes/senior-angular-interview-questions-2026-architecture-signals-rxjs-and-the-real-senior-bar-4bej" },
    { t: "45 Microservices Interview Questions and Answers (2026) (Weekday)", u: "https://www.weekday.works/post/microservices-interview-questions" },
    { t: "Snowflake Interview Questions for Data Engineers (2026) (DataDriven)", u: "https://datadriven.io/tools/snowflake-interview-questions" },
    { t: "EF Core Interview Questions for Senior .NET Developers (2026) (Hashnode)", u: "https://hashnode.com/posts/ef-core-interview-questions-for-senior-net-developers-2026/69c298ef30a93deb81818538" },
  ],
};
