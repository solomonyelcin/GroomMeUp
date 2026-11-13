// The .NET AI Engineer Roadmap 2026-27: eight tracks. Each track ties together a study guide (content/roadmap),
// interview questions and multiple choice (category = cat) and the topics from the roadmap picture.
export const ROADMAP = {
  title: ".NET AI Engineer Roadmap 2026-27",
  tracks: [
    { id: "rm-csharp", n: 1, title: "Master C# & Modern .NET", cat: "rm-csharp", stage: "Foundation", goal: "Strong foundation in .NET and core programming.",
      topics: ["C# 14", ".NET 10", "ASP.NET Core", "Web API", "Minimal APIs", "Dependency Injection", "Async Programming"] },
    { id: "rm-backend", n: 2, title: "Backend Fundamentals", cat: "rm-backend", stage: "Foundation", goal: "Build robust, secure, and high-performance APIs.",
      topics: ["Entity Framework Core", "Dapper", "SQL Server", "MongoDB", "Authentication & JWT", "Caching (Redis)", "Background Services"] },
    { id: "rm-cloud", n: 3, title: "Cloud-Native Development", cat: "rm-cloud", stage: "Platform", goal: "Deploy, scale, and manage cloud-native applications.",
      topics: ["Docker", "Kubernetes Basics", "Azure App Service", "Azure Container Apps", "Azure Functions", "Azure Service Bus", "Azure Key Vault", "Azure API Management"] },
    { id: "rm-arch", n: 4, title: "Architecture & System Design", cat: "rm-arch", stage: "Platform", goal: "Design scalable, maintainable, and resilient systems.",
      topics: ["Clean Architecture", "Microservices", "Event-Driven Architecture", "CQRS", "Vertical Slice Architecture", "Design Patterns", "Distributed Systems"] },
    { id: "rm-aifund", n: 5, title: "AI Fundamentals", cat: "rm-aifund", stage: "AI", goal: "Understand how AI models work and how to use them effectively.",
      topics: ["LLM Concepts", "Tokens & Context Windows", "Prompt Engineering", "Embeddings", "Vector Databases", "RAG (Retrieval-Augmented Generation)", "AI Safety & Evaluation"] },
    { id: "rm-aidotnet", n: 6, title: "AI with .NET", cat: "rm-aidotnet", stage: "AI", goal: "Integrate AI capabilities seamlessly into .NET applications.",
      topics: ["Microsoft.Extensions.AI", "Semantic Kernel", "Azure AI Foundry", "OpenAI APIs", "Local AI Models", "Function Calling", "MCP (Model Context Protocol)", "AI Agents"] },
    { id: "rm-prodai", n: 7, title: "Production AI", cat: "rm-prodai", stage: "Production", goal: "Build, secure, and run AI solutions in production.",
      topics: ["Observability", "Logging", "Monitoring", "AI Cost Optimization", "Security", "Rate Limiting", "CI/CD", "Performance Tuning"] },
    { id: "rm-proj", n: 8, title: "Build Real Projects", cat: "rm-proj", stage: "Production", goal: "Build projects, solve real problems, and create a strong portfolio.",
      topics: ["AI Chat Application", "AI Customer Support Bot", "Resume Analyzer", "Document Q&A System", "Code Review Assistant", "Enterprise AI Copilot", "Multi-Agent Applications"] },
  ],
};
export const STAGES = ["Foundation", "Platform", "AI", "Production"];
