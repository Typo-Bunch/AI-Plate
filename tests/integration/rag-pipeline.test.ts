import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { VectorStore } from "../../core/vector-store.js";
import { UniversalEmbedder } from "../../core/embedder.js";
import { MockAIProvider } from "./mock-provider.js";

describe("Integration: RAG Knowledge Base Pipeline", () => {
  const mockProvider = new MockAIProvider();
  UniversalEmbedder.getInstance().setProvider(mockProvider);

  const vs = new VectorStore();
  const testDocName = `integration_doc_${Date.now()}.txt`;
  const sampleArticle = `
    Quantum computing is a rapidly-emerging technology that harnesses the laws of quantum mechanics to solve problems too complex for classical computers.
    Today, IBM Quantum hardware is available to thousands of developers. Our engineers deliver increasingly powerful superconducting quantum processors.
    Qubits can exist in superposition, allowing quantum algorithms to evaluate exponential possibilities simultaneously.
    Quantum entanglement allows qubits that are entangled to share information instantaneously regardless of the distance separating them.
  `.trim();

  test("Document Ingestion into SQLite vector store", async () => {
    const meta = await vs.ingestText(testDocName, sampleArticle, { chunkSize: 120, chunkOverlap: 20 });
    assert.equal(meta.name, testDocName);
    assert.ok(meta.chunkCount >= 2);
    assert.ok(meta.totalCharacters > 0);

    // Verify document catalog
    assert.ok(vs.hasDocument(testDocName));
    const allDocs = vs.listDocuments();
    assert.ok(allDocs.some((d) => d.name === testDocName));
  });

  test("Semantic vector query with confidence scoring", async () => {
    const queryResult = await vs.queryPaged("superconducting quantum processors", 0, 3, 0.0, testDocName);
    assert.ok(queryResult.results.length > 0);
    assert.equal(queryResult.results[0].chunk.sourceDocument, testDocName);
    assert.ok(typeof queryResult.results[0].similarity === "number");

    // Format context for prompt injection
    const formatted = vs.formatContextForPrompt(queryResult.results);
    assert.ok(formatted.includes("═══ Relevant Knowledge Base Context ═══"));
    assert.ok(formatted.includes(testDocName));
  });

  test("Document removal and cleanup", () => {
    const removed = vs.removeDocument(testDocName);
    assert.equal(removed, true);
    assert.equal(vs.hasDocument(testDocName), false);
  });
});
