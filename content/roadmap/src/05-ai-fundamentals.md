# AI fundamentals for engineers: LLMs, tokens, prompts, embeddings, RAG and evaluation

**Interview focus:** you are not asked to train models. You are asked to explain how they behave, what they cost, how to give them the right context, and how to know whether the system is any good.

## How large language models work (the interview version)

- An LLM is a neural network (a **transformer**) trained to **predict the next token**. It is pre-trained on huge text, then tuned to follow instructions (instruction tuning, and preference tuning such as RLHF).
- It generates text **one token at a time**, sampling from a probability distribution. **Temperature** and **top-p** control randomness. Low values give more repeatable answers, but not guaranteed identical ones.
- It does not look up facts. It produces plausible text, so it can **hallucinate**: sound confident and be wrong. Grounding the model in your data (RAG), asking for citations and checking outputs reduces this but does not remove it.
- Chat APIs use **roles**: *system* (rules and behaviour), *user*, *assistant*, and *tool* messages. The model is **stateless**: every call must send the history it should see.
- Model families differ in size, speed, cost, context length, tool use and reasoning ability. "Reasoning" models spend extra tokens thinking before answering, which costs time and money.

## Tokens and context windows

- Text is split into **tokens** (pieces of words, roughly 3 to 4 characters of English each, differs by language and tokenizer). You pay per **input and output token**, and limits apply to both.
- The **context window** is the maximum tokens the model can consider in one call (prompt + history + retrieved documents + the answer). When you exceed it you must trim, summarise or retrieve.
- Longer is not always better: cost and latency rise, and models can miss details buried in the middle of a long prompt ("lost in the middle").
- **Prompt caching** (supported by several providers) makes a repeated prompt prefix cheaper and faster, so put stable instructions first and variable content last.
- Count tokens before you send (tokenizer libraries), and set an explicit **max output tokens**.

## Prompt engineering that works in production

- Be specific: the task, the audience, the format, the constraints, what to do when information is missing ("say you do not know").
- Give **examples** (few-shot) for tricky formats. Separate instructions from data with clear delimiters.
- Ask for **structured output** (JSON that matches a schema, or the provider's structured output feature) and validate it in code. Retry or repair on failure.
- Break big tasks into steps, or use several small calls. Let the model use **tools** for calculations and lookups instead of guessing.
- Treat prompts like code: **version them**, test them against a fixed set of cases, and review changes.
- **Prompt injection:** text from users or documents can contain instructions that try to override yours. Never trust model output as safe input to another system.

## Embeddings and vector databases

- An **embedding** is a vector of numbers that represents the meaning of a piece of text. Similar meaning gives nearby vectors, measured with **cosine similarity** (or dot product, or distance).
- Use the **same embedding model** for documents and queries. Changing the model means re-embedding everything.
- **Chunking:** split documents into pieces that carry one idea (for example 200 to 500 tokens with some overlap), keep headings and source metadata with each chunk. Chunking quality often decides RAG quality.
- A **vector database or index** stores vectors and finds nearest neighbours quickly using approximate algorithms (HNSW, IVF). Trade-off: recall vs speed vs memory.
- **Hybrid search** combines keyword search (BM25) and vector search, then a **re-ranker** orders the best results. It beats pure vectors for names, codes and exact terms.
- Options: Azure AI Search, PostgreSQL with pgvector, SQL Server vector support, Redis, Qdrant, Cosmos DB. Choose on what you already run, filtering needs, scale and ops cost.
- Filter by **metadata** (tenant, permissions, date) at query time. **Never let retrieval return documents the user is not allowed to see.**

## Retrieval-Augmented Generation (RAG)

1. **Ingest:** extract text, clean, chunk, embed, store with metadata and a stable id.
2. **Retrieve:** embed the question, search (hybrid + filters), optionally rewrite the query, re-rank, keep the top few chunks.
3. **Augment and generate:** put the chunks in the prompt with instructions to answer **only** from them and to cite sources, then generate.
4. **Evaluate and iterate.**

```text
System: Answer using only the context. If the answer is not in the context, say you do not know. Cite the source ids.
Context: [doc-12 §3] ... [doc-47 §1] ...
Question: {user question}
```

- **Why RAG over fine-tuning:** fresh and private data, citations, permission control, cheaper updates. Fine-tuning changes style or skills, not reliable facts.
- **Typical failures:** bad chunking, retrieving the wrong passage, too many irrelevant chunks, stale index, the model ignoring the context, no citation check.
- **Improvements:** better chunking, hybrid search, query rewriting, re-ranking, metadata filters, smaller focused top-k, answer verification.

## AI safety and evaluation

- **Risks:** hallucination, prompt injection (direct and indirect through documents or web pages), data leakage, unsafe content, bias, over-trust by users, misuse of tools the model can call.
- **Defences:** least privilege for tools, input and output filtering and content safety services, redaction of personal data, human approval for risky actions, clear user messaging, logging with privacy controls. See the OWASP guidance for LLM applications.
- **Evaluation** is how you stop guessing. Build a **golden set** of real questions with expected answers or facts. Measure retrieval (did the right chunk come back?), **groundedness** (is the answer supported by the context?), relevance, correctness, safety and latency and cost.
- **LLM-as-judge** is useful for scale but is biased and must be calibrated against human labels. Re-run evaluations for every prompt, model or index change (regression testing) and monitor quality in production with user feedback.
- Offline evaluation does not replace **online** monitoring and A/B tests.

## Red flags

- "The model knows our data."
- No evaluation set, only demo prompts.
- Sending confidential data to a model without checking the provider's data handling terms and your own policy.
- Executing model-generated SQL or code without sandboxing and validation.

## Tell it from your experience

Frame AI as an extension of your engineering skills: you already design APIs, queues, caches, search (Elasticsearch experience helps with hybrid search) and observability. Prepare one project story where you used or would use an LLM: the problem, why an LLM, how you grounded it, how you measured quality, and what you did about cost and safety.

## Skill-upgrade checklist

1. Use a tokenizer to count tokens for a long prompt, then shorten it without losing meaning.
2. Embed 50 paragraphs of your own notes and run similarity search by hand to see good and bad matches.
3. Build a tiny RAG over a few PDFs with citations and write 20 evaluation questions.
4. Try a prompt injection against your own bot and add a defence.
5. Compare two chunk sizes on your evaluation set and record the numbers.

## Read next

- [.NET AI ecosystem overview](https://learn.microsoft.com/dotnet/ai/dotnet-ai-ecosystem)
- [Retrieval-augmented generation with Azure AI Search](https://learn.microsoft.com/azure/search/retrieval-augmented-generation-overview)
- [OWASP Top 10 for LLM applications](https://genai.owasp.org/llm-top-10/)
- [Microsoft Foundry documentation](https://learn.microsoft.com/azure/foundry/)
