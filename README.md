# Simple Naive RAG Pipeline (TypeScript 7)

A minimal, readable implementation of a **naive RAG pipeline** (Retrieval-Augmented Generation) in TypeScript, built with LangChain.js and OpenAI. Type-checked with **TypeScript 7 (tsgo)** and covered by a **Vitest** unit suite.

The goal of this repository is to demonstrate the full RAG pipeline end-to-end — from a raw PDF to a grounded answer — in ~100 lines of readable code, with **no server, no database, no external vector store** (pure in-memory index).

## 🧩 Naive RAG pipeline (7 explicit steps)

Each step lists the tool used by this codebase (npm package → class) and the file where it lives:

| # | Step | What happens | Tool used (package → class) | File |
|---|---|---|---|---|
| 1 | **Ingestion** | Extract raw text from the PDF | `@langchain/community` → `PDFLoader` | `index.ts` |
| 2 | **Chunking** | Split text into overlapping chunks (1000/200) | `langchain` → `RecursiveCharacterTextSplitter` | `rag.ts` (`createSplitter`) |
| 3 | **Embeddings** | Turn text into vectors | `@langchain/openai` → `OpenAIEmbeddings` (`text-embedding-3-small`) | `rag.ts` (`createVectorStore`) |
| 4 | **Vector index** | Store vectors for similarity search | `langchain/vectorstores/memory` → `MemoryVectorStore` (pure JS, zero native dependency) | `rag.ts` (`createVectorStore`) |
| 5 | **Retrieval** | Select the top-k most relevant chunks | retriever `asRetriever()` + custom `retrieveContext()` | `rag.ts` |
| 6 | **Augmentation** | Inject the context into the prompt (`{context}` + `{question}`) | `@langchain/core/prompts` → `ChatPromptTemplate` | `rag.ts` (`RAG_PROMPT_TEMPLATE`) |
| 7 | **Generation** | LLM answer restricted to the context | `@langchain/openai` → `ChatOpenAI` (`gpt-4o-mini`) + `StringOutputParser` | `rag.ts` (`buildRagChain`) |

The logic is split into two files so it stays testable:

- `rag.ts` — the pipeline logic (splitter, vector store, retrieval, prompt, chain)
- `index.ts` — the CLI entry point (PDF loading, example run)

The prompt enforces a **fidelity guardrail**: if the answer is not in the retrieved context, the model must reply `The document does not contain this information.` instead of hallucinating.

## 📄 Example document

The demo runs on **`data/NYSE_PLTR_2024.pdf`**: the **Palantir Technologies (NYSE: PLTR) Annual Report on Form 10-K for fiscal year 2024**, filed with the U.S. SEC. It is a **public, real-world document** (145 pages, ~640k characters) rich in audited financial figures — e.g. total revenue FY2024: **$2,865,507K (+29% vs FY2023)** — which makes the RAG answer verifiable.

> The 10-K is the annual report publicly disclosed by every US public company to the SEC — this file is redistributed here for demonstration purposes.

## 🚀 Setup

Requirements: **Node ≥ 20.12**, **pnpm ≥ 10.7** (works with pnpm 10 or 11).

```bash
# 1. Install dependencies
pnpm install

# 2. Provide your OpenAI key
cp .env.example .env
# then edit .env and paste your key: OPENAI_API_KEY=sk-...

# 3. Run the pipeline (embeds the PDF, answers an example question)
pnpm start
```

Expected output (answer grounded in the retrieved chunks):

```text
Palantir's total revenue for fiscal year 2024 was $2,865,507K, up 29% from
$2,225,012K in fiscal year 2023.
```

## 🛠️ Scripts

| Command | Description |
|---|---|
| `pnpm start` | Run the full pipeline on the example PDF |
| `pnpm test` | Run the Vitest unit suite (no network calls) |
| `pnpm typecheck` | Type-check with TypeScript 7 (`tsgo --noEmit`) |

## 📁 Project structure

```
.
├── index.ts          # CLI: PDF → chunks → embeddings → index → answer
├── rag.ts            # Pipeline logic (testable, no I/O)
├── rag.test.ts       # Vitest suite (chunking, prompt, retrieval, chain)
├── data/NYSE_PLTR_2024.pdf  # Example document (public SEC 10-K)
├── .env.example      # Template for secrets (never commit .env)
└── pnpm-workspace.yaml      # pnpm 11 settings (build approvals)
```

## 🔒 Security

- **Secrets are never committed**: the OpenAI key is loaded from `.env` (gitignored).
- `process.loadEnvFile()` loads the key at runtime; the CLI exits with a clear message if it is missing.

## 📜 License

MIT
