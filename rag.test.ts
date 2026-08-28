/**
 * rag.test.ts — tests unitaires du pipeline RAG naïf.
 * Aucun appel réseau : LLM/embeddings non invoqués, retriever mocké.
 */
import { describe, expect, it } from "vitest";
import type { Document } from "@langchain/core/documents";
import { ChatOpenAI } from "@langchain/openai";
import {
  OUT_OF_CONTEXT_REPLY,
  RAG_PROMPT_TEMPLATE,
  buildRagChain,
  createSplitter,
  retrieveContext,
} from "./rag.js";

function fakeDoc(content: string): Document {
  return { pageContent: content, metadata: {} };
}

describe("chunking (étape 2)", () => {
  it("découpe un long texte en plusieurs chunks", async () => {
    const splitter = createSplitter(200, 50);
    const text = "word ".repeat(2000); // ~4000 caractères
    const chunks = await splitter.splitDocuments([fakeDoc(text)]);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.pageContent.length).toBeLessThanOrEqual(220); // taille + marge
    }
  });

  it("produit un overlap entre chunks consécutifs", async () => {
    const splitter = createSplitter(200, 50);
    const text = "le contexte ne doit pas être coupé ".repeat(300);
    const chunks = await splitter.splitDocuments([fakeDoc(text)]);
    for (let i = 1; i < chunks.length; i++) {
      const prev = chunks[i - 1].pageContent;
      const curr = chunks[i].pageContent;
      const overlap = curr.split(" ").filter((w) => prev.includes(w)).length;
      expect(overlap).toBeGreaterThan(0); // du contenu est partagé
    }
  });
});

describe("prompt d'augmentation (étape 6)", () => {
  it("contient les variables {context} et {question}", () => {
    expect(RAG_PROMPT_TEMPLATE).toContain("{context}");
    expect(RAG_PROMPT_TEMPLATE).toContain("{question}");
  });

  it("définit une réponse de repli hors-contexte (fidélité)", () => {
    expect(OUT_OF_CONTEXT_REPLY).toBeTruthy();
    expect(RAG_PROMPT_TEMPLATE).toContain(OUT_OF_CONTEXT_REPLY);
  });
});

describe("retrieval (étape 5)", () => {
  it("joint les chunks récupérés en un seul bloc", async () => {
    const retriever = {
      invoke: async () => [fakeDoc("premier passage"), fakeDoc("second passage")],
    };
    const context = await retrieveContext(retriever, "question ?");
    expect(context).toBe("premier passage\n\nsecond passage");
  });

  it("retourne une chaîne vide si aucun chunk pertinent", async () => {
    const retriever = { invoke: async () => [] };
    expect(await retrieveContext(retriever, "question ?")).toBe("");
  });
});

describe("chaîne RAG (étapes 5→7)", () => {
  it("construit une chaîne Runnable (sans appel réseau)", () => {
    // Construction lazy : aucun appel OpenAI n'est déclenché ici.
    const llm = new ChatOpenAI({ apiKey: "sk-test", model: "gpt-4o-mini", maxTokens: 500 });
    const chain = buildRagChain(llm, { invoke: async () => [fakeDoc("contexte")] });
    expect(chain).toBeDefined();
    expect(typeof chain.invoke).toBe("function");
  });
});
