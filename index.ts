/**
 * index.ts — CLI du pipeline RAG naïf.
 *
 * Usage : pnpm start   (nécessite OPENAI_API_KEY dans .env)
 *
 * Pipeline : PDF → chunks → embeddings → index vectoriel → retrieval → LLM.
 * La logique testable vit dans rag.ts.
 */
import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
import { ChatOpenAI, OpenAIEmbeddings } from "@langchain/openai";
import chalk from "chalk";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { buildRagChain, createSplitter, createVectorStore } from "./rag.js";

// --- ESM __dirname simulation
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- Chargement des secrets depuis .env (gitignoré) ---
try {
  process.loadEnvFile(); // Node ≥ 20.12 : charge .env s'il existe
} catch {
  // pas de .env — on utilise les variables d'environnement
}

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
if (!OPENAI_API_KEY) {
  console.error(chalk.red("❌ OPENAI_API_KEY manquante — copie .env.example vers .env et remplis la clé."));
  process.exit(1);
}

async function main(): Promise<void> {
  const docPath = "./data/NYSE_PLTR_2024.pdf";

  // --- Étape 1 : ingestion (extraction du texte du PDF) ---
  console.log(chalk.cyan("📄 Loading PDF..."));
  const loader = new PDFLoader(docPath);
  const docs = await loader.load();

  if (!docs.length) {
    throw new Error("❌ No content extracted from PDF.");
  }

  // --- Étape 2 : chunking ---
  console.log(chalk.cyan("✂️ Splitting into chunks..."));
  const splitter = createSplitter();
  const chunks = await splitter.splitDocuments(docs);
  console.log(chalk.green(`✅ ${chunks.length} chunks ready.`));

  // --- Étape 3 : embeddings ---
  console.log(chalk.cyan("🔍 Creating vector store..."));
  const embeddings = new OpenAIEmbeddings({
    modelName: "text-embedding-3-small",
    apiKey: OPENAI_API_KEY,
  });

  // --- Étape 4 : index vectoriel en mémoire ---
  const vectorStore = await createVectorStore(chunks, embeddings);
  console.log(chalk.green("✅ Vector store ready."));

  // --- Étapes 5→7 : retrieval + augmentation + génération (chaîne LCEL) ---
  const llm = new ChatOpenAI({ apiKey: OPENAI_API_KEY, model: "gpt-4o-mini", maxTokens: 500 });
  const ragChain = buildRagChain(llm, vectorStore.asRetriever());

  // --- Exemple ---
  const exampleQuestion =
    "What was Palantir's total revenue for fiscal year 2024, and how does it compare to 2023?";
  console.log(chalk.cyan("\n🤖 Asking: ") + chalk.bold(exampleQuestion));

  const response = await ragChain.invoke({ question: exampleQuestion });

  console.log(chalk.blueBright("\n📢 Answer:\n"));
  console.log(response);
}

main().catch((err) => {
  console.error(chalk.red("❌ Fatal Error:"), err);
  process.exit(1);
});
