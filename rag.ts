/**
 * rag.ts — logique du pipeline RAG naïf, séparée du CLI pour être testable.
 *
 * Pipeline (7 étapes du RAG naïf) :
 *   1. Ingestion  : PDFLoader (voir index.ts)
 *   2. Chunking   : RecursiveCharacterTextSplitter (createSplitter)
 *   3. Embedding  : OpenAIEmbeddings text-embedding-3-small
 *   4. Index      : MemoryVectorStore (pur JS, zéro dépendance native)
 *   5. Retrieval  : retriever top-k (retrieveContext)
 *   6. Augmentation : RAG_PROMPT_TEMPLATE (contexte + question)
 *   7. Génération : ChatOpenAI + StringOutputParser (buildRagChain)
 */
import type { Document } from "@langchain/core/documents";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { RunnablePassthrough } from "@langchain/core/runnables";
import type { ChatOpenAI, OpenAIEmbeddings } from "@langchain/openai";
import { MemoryVectorStore } from "langchain/vectorstores/memory";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";

/** Réponse de repli quand le contexte ne contient pas la réponse (fidélité). */
export const OUT_OF_CONTEXT_REPLY =
  "The document does not contain this information.";

/** Template de prompt : le LLM ne répond QUE depuis le contexte fourni. */
export const RAG_PROMPT_TEMPLATE = `You are a financial analyst assistant trained to interpret corporate SEC filings. Base your answer only on the retrieved report section.
Include specific references to strategic, financial or operational aspects if relevant.
Answer the user's question using ONLY the context below and with no more than 500 words.
If the answer is not in the context, respond with: "${OUT_OF_CONTEXT_REPLY}"

Context:
{context}

Question:
{question}`;

/** Interface minimale du retriever (structural : simple à mocker en test). */
export interface RetrieverLike {
  invoke(query: string): Promise<Document[]>;
}

/** Étape 2 — chunking : découpage récursif par séparateurs, avec overlap. */
export function createSplitter(chunkSize = 1000, chunkOverlap = 200): RecursiveCharacterTextSplitter {
  return new RecursiveCharacterTextSplitter({ chunkSize, chunkOverlap });
}

/** Étape 3+4 — embeddings puis index vectoriel en mémoire. */
export async function createVectorStore(
  chunks: Document[],
  embeddings: OpenAIEmbeddings,
): Promise<MemoryVectorStore> {
  return MemoryVectorStore.fromDocuments(chunks, embeddings);
}

/** Étapes 5 — retrieval : top-k chunks les plus proches, joints en un bloc. */
export async function retrieveContext(retriever: RetrieverLike, question: string): Promise<string> {
  const results = await retriever.invoke(question);
  return results.map((r) => r.pageContent).join("\n\n");
}

/** Étapes 5→7 — chaîne LCEL complète : retrieval → prompt → LLM → texte. */
export function buildRagChain(llm: ChatOpenAI, retriever: RetrieverLike) {
  const prompt = ChatPromptTemplate.fromTemplate(RAG_PROMPT_TEMPLATE);
  return RunnablePassthrough.assign({
    context: (input: { question: string }) => retrieveContext(retriever, input.question),
    question: (input: { question: string }) => input.question,
  })
    .pipe(prompt)
    .pipe(llm)
    .pipe(new StringOutputParser());
}
