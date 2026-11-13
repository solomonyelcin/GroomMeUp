# AI with .NET: Microsoft.Extensions.AI, agents, MCP and Foundry

**Interview focus:** how to put a model behind a clean .NET abstraction, let it call your code safely, and explain what changed in the Microsoft AI stack (it moved quickly, so show you know the current state and can reason about it).

## The .NET AI stack in one picture

| Layer | What it is | Use it for |
| --- | --- | --- |
| **Microsoft.Extensions.AI** | Small abstractions: `IChatClient`, `IEmbeddingGenerator` plus middleware | Talk to any model through one interface, add logging, caching, telemetry and function calling |
| **Provider SDKs** | OpenAI .NET library, Azure OpenAI and Foundry clients, Ollama and others | The actual connection to a model |
| **Microsoft.Extensions.VectorData** | Vector store abstraction | Store and search embeddings |
| **Microsoft Agent Framework** | Agents, tools, memory and multi-agent workflows, with .NET and Python | Agent applications. Released as 1.0 in April 2026, bringing together ideas from Semantic Kernel and AutoGen |
| **Semantic Kernel** | Earlier orchestration SDK (plugins, kernel, planners) | Existing projects. Microsoft published migration guides to Agent Framework for new agent work |
| **MCP C# SDK** | Model Context Protocol client and server | Expose tools and data to any MCP-aware assistant or agent |

Being able to say *why the stack looks like this* is a strong signal: abstractions at the bottom (swap providers), frameworks above (agents), protocols at the edge (MCP).

## Microsoft.Extensions.AI

- Depend on `IChatClient` in your services, not on a vendor SDK. Packages: `Microsoft.Extensions.AI.Abstractions` (types) and `Microsoft.Extensions.AI` (middleware).
- Build a **pipeline** (like ASP.NET Core middleware): function invocation, caching, OpenTelemetry, logging, rate limiting.
- Easy to **test and mock**, and easy to switch between a cloud model and a local one.

```csharp
builder.Services.AddChatClient(sp =>
    new OpenAI.Chat.ChatClient("gpt-4o-mini", apiKey).AsIChatClient())   // provider adapter
    .UseFunctionInvocation()
    .UseOpenTelemetry();

public class SummaryService(IChatClient chat)
{
    public async Task<string> SummariseAsync(string text, CancellationToken ct)
    {
        var r = await chat.GetResponseAsync($"Summarise in 3 bullets:\n{text}", cancellationToken: ct);
        return r.Text;
    }
}
```

(Check the current docs for exact method names. Registration helpers have changed between previews and releases.)

## Calling OpenAI and Azure models

- Know the basics: **chat or responses API**, **streaming** for faster perceived response, **structured outputs** (JSON schema), **tool calling**, **embeddings**, token usage in the response, and **rate limits** (HTTP 429 with `Retry-After`).
- Use **managed identity** for Azure-hosted models instead of keys where possible. Keys belong in Key Vault.
- Reuse clients (HttpClientFactory), set timeouts, retry with backoff and jitter, and use a **circuit breaker**.
- Azure AI Foundry was renamed **Microsoft Foundry**. It provides a model catalog, deployments, an agent service, evaluation tools and content safety. In an interview, describe it as the platform for hosting and governing models and agents, and mention you would check the current SDK package names.

## Function calling (tool use)

1. You describe tools (name, description, JSON schema of parameters) in the request.
2. The model replies with a **tool call**: the name and arguments. It does **not** run anything.
3. **Your code** validates the arguments, runs the function, and sends the result back.
4. The model uses the result to write the answer. This loop may repeat.

```csharp
[Description("Gets the status of an order")]
static async Task<string> GetOrderStatus([Description("Order id")] int id) => await repo.StatusAsync(id);

var options = new ChatOptions { Tools = [AIFunctionFactory.Create(GetOrderStatus)] };
var reply = await chat.GetResponseAsync("Where is order 1042?", options);   // with UseFunctionInvocation()
```

**Safety rules:** validate and authorise every call as if a user typed it, give each tool the least privilege, require confirmation for write actions, cap the number of loop iterations and log every call.

## Semantic Kernel and Microsoft Agent Framework

- **Semantic Kernel** introduced plugins, a kernel, memory connectors and planners. Its ideas (functions as tools, connectors, orchestration) live on.
- **Microsoft Agent Framework** (1.0 in April 2026 for .NET and Python) combines Semantic Kernel's enterprise integration with AutoGen's multi-agent orchestration. Key ideas: an **agent** (instructions + model + tools + memory), **workflows** and orchestration patterns (sequential, concurrent, handoff, group chat), middleware, and interoperability through **MCP** and agent-to-agent protocols.
- It is built on `Microsoft.Extensions.AI`, so an `IChatClient` is what agents use underneath.

```csharp
// shape only: check the current Agent Framework docs for exact names
AIAgent agent = chatClient.CreateAIAgent(
    instructions: "You are a helpful support assistant.",
    tools: [AIFunctionFactory.Create(GetOrderStatus)]);
Console.WriteLine(await agent.RunAsync("Where is order 1042?"));
```

**How to talk about the migration:** existing Semantic Kernel code keeps working, but for new agent projects prefer the newer framework, keep business logic behind your own interfaces and tools so the orchestration layer can change.

## Local models

- Why: privacy, offline use, cost control, learning, fast iteration. Trade-off: weaker than frontier models, you own the hardware and the updates.
- Options: **Ollama** (easy local server, works as an `IChatClient`), **Foundry Local**, and **ONNX Runtime GenAI** for in-process inference. Choose smaller quantised models for laptops.
- Use the same abstraction so the app code does not care whether a model is local or in the cloud.

## Model Context Protocol (MCP)

- **MCP** is an open protocol that lets AI applications connect to tools and data in a standard way. An **MCP server** exposes **tools** (actions), **resources** (data) and **prompts**. An **MCP client** (a chat app, IDE or agent) connects and lets the model use them.
- Transports: **stdio** (client starts a local server process) and **HTTP** for remote servers.
- The official **C# SDK** (`ModelContextProtocol` packages) uses attributes. You describe tools clearly because the description is what the model reads.

```csharp
[McpServerToolType]
public class OrderTools(IOrderService orders)
{
    [McpServerTool, Description("Gets the status of an order")]
    public Task<string> GetStatus([Description("Order id")] int id) => orders.StatusAsync(id);
}
// Program.cs: builder.Services.AddMcpServer().WithStdioServerTransport().WithToolsFromAssembly();
```

- **Security:** authenticate remote servers, scope tokens, treat tool descriptions and results from third-party servers as untrusted (tool poisoning and indirect prompt injection), require user approval for sensitive actions, and log activity.
- Good interview line: "MCP turns N by M custom integrations into N plus M. I would put read-only tools first and add write tools behind approval."

## AI agents: what to say

An **agent** is a loop: the model decides the next step, calls tools, sees the results and continues until the goal is met or a limit is reached. Design points: clear instructions, few well-described tools, **memory** (short-term conversation, long-term store), **guardrails** (iteration and cost limits, allow-lists), **human in the loop** for risky steps, and **evaluation of whole tasks**, not only single answers. Use an agent only when the path is not known in advance. A fixed workflow of prompts and code is cheaper, faster and easier to test.

## Red flags

- Calling a vendor SDK directly from controllers everywhere.
- Letting the model run arbitrary SQL or shell commands.
- Agents with no iteration or spending limit.
- Claiming an API shape from memory without checking the current package version.

## Tell it from your experience

Describe how you would add an assistant to a system you know: which `IChatClient` pipeline, which of your existing services become tools, how permissions flow from the signed-in user to the tool, how you would log and test it. Mention RabbitMQ or Service Bus for long-running tool work.

## Skill-upgrade checklist

1. Build a console chat app on `IChatClient`, then swap the provider to a local model without changing service code.
2. Add one tool with function calling, then add a unit test with a fake `IChatClient`.
3. Create an MCP server with two read-only tools and connect it to an MCP-capable editor.
4. Build a small agent with Microsoft Agent Framework and add an iteration limit.
5. Add OpenTelemetry and read one trace of a tool-calling request.

## Read next (official)

- [Microsoft.Extensions.AI libraries](https://learn.microsoft.com/dotnet/ai/ai-extensions)
- [.NET AI ecosystem tools and SDKs](https://learn.microsoft.com/dotnet/ai/dotnet-ai-ecosystem)
- [Build an MCP server in C#](https://learn.microsoft.com/dotnet/ai/quickstarts/build-mcp-server)
- [MCP C# SDK on GitHub](https://github.com/modelcontextprotocol/csharp-sdk)
- [Migrate Semantic Kernel and AutoGen projects to Microsoft Agent Framework](https://devblogs.microsoft.com/agent-framework/migrate-your-semantic-kernel-and-autogen-projects-to-microsoft-agent-framework-release-candidate/)
- [Semantic Kernel documentation](https://learn.microsoft.com/semantic-kernel/)
