import path from "node:path";
import { AgentDatabase } from "../core/database.js";
import { OkfStore } from "../core/okf-store.js";
import { VectorStore } from "../core/vector-store.js";

async function ingestIntoDatabase(dbPath: string, label: string) {
  console.log(`\n--- Ingesting into ${label} (${dbPath}) ---`);
  const customDb = new AgentDatabase(dbPath);
  const okf = new OkfStore(customDb);
  const vectorStore = new VectorStore(customDb);

  // 1. Ingest Canonical OKF Knowledge Graph Specs (Tier 1)
  const file1 = "scratch/test-okf-docs/order-processing-spec.md";
  const file2 = "scratch/test-okf-docs/payment-retry-runbook.md";

  const node1 = await okf.ingestFile(file1);
  console.log(`✔ Ingested OKF node: ${node1.id} (title: "${node1.title}", authority: ${node1.authority})`);

  const node2 = await okf.ingestFile(file2);
  console.log(`✔ Ingested OKF node: ${node2.id} (title: "${node2.title}", authority: ${node2.authority})`);

  // 2. Ingest Vector RAG Semantic Documents (Tier 2)
  const ragFile = "scratch/test-okf-docs/incident_alpha_crash.txt";
  const ragDoc = await vectorStore.ingestFile(ragFile);
  console.log(`✔ Ingested Vector RAG doc: ${ragDoc.name} (${ragDoc.chunkCount} chunks, ${ragDoc.totalCharacters} chars)`);

  // Verification checks
  const allNodes = okf.listNodes();
  const allDocs = vectorStore.listDocuments();
  console.log(`✔ Total OKF Nodes in ${label}: ${allNodes.length}`);
  console.log(`✔ Total Vector Documents in ${label}: ${allDocs.length}`);
}

async function main() {
  const localDbPath = path.resolve(process.cwd(), "agent_data.db");
  const appDataDbPath = path.join(process.env.APPDATA || "", "AI Plate", "agent_data.db");

  await ingestIntoDatabase(localDbPath, "Local Workspace DB");
  if (process.env.APPDATA) {
    await ingestIntoDatabase(appDataDbPath, "AppData AI Plate DB");
  }

  console.log("\n✅ OKF & Vector RAG Hybrid Ingestion Completed Successfully!");
}

main().catch((err) => {
  console.error("Ingestion failed:", err);
  process.exit(1);
});
