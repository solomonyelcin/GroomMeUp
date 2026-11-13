// Tiny helper to keep the question files compact.
// kp = key points the answer should hit: [label, keyword, keyword, ...] (keywords are lowercase substrings)
export const mk = (id, c, d, q, a, kp, f = []) => ({ id, c, d, q, a, kp, f });

export const CATEGORIES = {
  csharp: { name: "C# & .NET core", color: "#3446E8" },
  aspnet: { name: "ASP.NET Core & APIs", color: "#5B3FD1" },
  efsql: { name: "EF Core & SQL Server", color: "#0F7C8F" },
  angular: { name: "Angular, TypeScript & RxJS", color: "#C8264B" },
  micro: { name: "Microservices & messaging", color: "#B8590B" },
  snowflake: { name: "Snowflake & data", color: "#1A8FC4" },
  cloud: { name: "Azure, Docker, K8s, DevOps", color: "#2E7D4F" },
  design: { name: "System design", color: "#7A4B9E" },
  resume: { name: "My resume defence", color: "#A8741A" },
  hr: { name: "HR & behavioural", color: "#546178" },
  ai: { name: "AI in engineering", color: "#D1488E" },
  // Roadmap 2026-27 tracks (see js/data/roadmap.js)
  "rm-csharp": { name: "Roadmap: C# & modern .NET", color: "#3446E8" },
  "rm-backend": { name: "Roadmap: Backend fundamentals", color: "#0F7C8F" },
  "rm-cloud": { name: "Roadmap: Cloud-native on Azure", color: "#2E7D4F" },
  "rm-arch": { name: "Roadmap: Architecture & system design", color: "#7A4B9E" },
  "rm-aifund": { name: "Roadmap: AI fundamentals", color: "#D1488E" },
  "rm-aidotnet": { name: "Roadmap: AI with .NET", color: "#B8590B" },
  "rm-prodai": { name: "Roadmap: Production AI", color: "#C8264B" },
  "rm-proj": { name: "Roadmap: AI projects & portfolio", color: "#A8741A" },
};
