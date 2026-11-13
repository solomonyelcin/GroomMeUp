# Build real projects: a portfolio plan and how to talk about it

**Interview focus:** projects prove you can deliver. Interviewers look for scope you chose, trade-offs you made, how you measured quality, and what you would improve. One finished, well-explained project beats five demos.

## How to pick and scope

- Choose projects near your real experience so your story is credible: .NET APIs, Azure, queues, search, data. Add AI where it solves a real problem.
- Fix a **small first version** (a week), then add one improvement per week (evaluation, caching, auth, observability).
- Always include: **README with an architecture diagram**, a **live demo or short video**, **tests**, an **evaluation report with numbers**, **cost notes** and a **"what I would do next"** section.
- Keep secrets out of the repo, and add a simple licence.

## Seven projects, with the interview angle for each

### 1. AI chat application
- **Build:** ASP.NET Core API with streaming (server-sent events), Angular front end, conversation history in a database, `IChatClient` pipeline, token budget per user.
- **Shows:** streaming, state (the model is stateless), history trimming and summarising, rate limits, auth.
- **Be ready for:** "How do you keep the context inside the window?" "How do you stop one user running up the bill?"

### 2. AI customer support bot
- **Build:** RAG over help articles and past tickets, tool calls for order status and create ticket, handoff to a human with the transcript.
- **Shows:** grounded answers with citations, function calling with authorisation, escalation, and measuring deflection rate and wrong-answer rate.
- **Be ready for:** prompt injection through ticket text, personal data handling, what happens when retrieval finds nothing.

### 3. Resume analyzer
- **Build:** upload PDF or Word, extract text, return structured JSON (skills, years, gaps), score against a job description, explain the score.
- **Shows:** document parsing, structured output with schema validation, fairness and bias thinking, privacy (personal data), batch processing with a queue.
- **Be ready for:** "How do you test extraction accuracy?" (labelled sample set, field-level precision and recall). "How do you avoid unfair scoring?"

### 4. Document Q&A system
- **Build:** ingestion pipeline (extract, chunk, embed, index), hybrid search, re-ranking, answers with page citations, per-user permissions.
- **Shows:** the full RAG pipeline, chunking experiments, retrieval metrics, access control in search, re-indexing strategy.
- **Be ready for:** "Why did you pick that chunk size?" with a table of results from your evaluation set.

### 5. Code review assistant
- **Build:** a GitHub Action or webhook receives a pull request diff, a model suggests comments, rules and static analysis run first, comments are posted with severity.
- **Shows:** working with large inputs (split by file, token limits), combining deterministic tools with a model, noise control, cost per pull request.
- **Be ready for:** false positives, secrets in diffs, how you measure usefulness (accepted suggestions rate).

### 6. Enterprise AI copilot
- **Build:** an assistant inside an internal app with tools that call your existing APIs on behalf of the signed-in user, MCP server for shared tools, audit log, approvals for write actions.
- **Shows:** authorisation flow (user identity to tool), least privilege, audit, multi-tenant isolation, governance.
- **Be ready for:** "What stops it doing something the user is not allowed to do?"

### 7. Multi-agent application
- **Build:** a planner, a researcher and a writer agent (or sequential workflow) using Microsoft Agent Framework, with iteration and cost limits and a trace of every step.
- **Shows:** orchestration patterns, when agents are worth it versus a fixed workflow, failure handling, evaluation of whole tasks.
- **Be ready for:** "Why not just one prompt?" "How do you test it?" "What are the loops and costs?"

## Milestones template (use for every project)

1. Problem statement and success metrics (for example answer correctness 85 percent on 50 test questions, P95 latency under 4 seconds, cost under a set amount per 100 requests).
2. Walking skeleton end to end, deployed.
3. Evaluation set and baseline score.
4. Improve one thing at a time and record the effect.
5. Security and privacy review (prompt injection, access control, logging).
6. Observability and cost dashboard.
7. Write-up: architecture, decisions, results, limits, next steps.

## Telling the story in an interview (two minutes)

Use **Situation, Task, Action, Result** with technical depth:

- **Situation and goal:** who needed what and why it was hard.
- **Design choices:** two or three decisions with the alternatives you rejected.
- **Evidence:** your evaluation numbers, latency and cost.
- **Problem and fix:** one real failure (hallucination, slow retrieval, a 429 storm) and what you changed.
- **Next:** what you would improve with more time.

Prepare a one-page sheet per project with the numbers so you can quote them without notes. Never claim results you did not measure.

## Portfolio checklist

- Public repo with a clear README, setup in under 10 minutes, and screenshots or a short demo video.
- Architecture diagram and a decisions log (why this model, why this index).
- Automated tests and an evaluation run in CI.
- A short article or post explaining one lesson learned.
- Pin repositories on your profile, and link them in your resume.

## Red flags

- A project that only calls an API with no evaluation, limits or error handling.
- Copying a tutorial without changes you can explain.
- Not knowing the cost or latency of your own app.

## Skill-upgrade checklist

1. Choose one project from the list that is closest to your current work and write the problem statement and success metrics today.
2. Ship the walking skeleton within one week, then add the evaluation set.
3. Write the two-minute story and practise it aloud (the live interview mode in this app records how you sound).
4. Repeat with a second project that uses agents or MCP.

## Read next

- [.NET AI quickstarts and samples](https://learn.microsoft.com/dotnet/ai/)
- [MCP C# SDK samples](https://github.com/modelcontextprotocol/csharp-sdk)
- [Microsoft Agent Framework on GitHub](https://github.com/microsoft/agent-framework)
