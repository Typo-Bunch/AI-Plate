import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { chunkText, VectorStore } from "../core/vector-store.js";

describe("Vector Store & RAG Subsystem", () => {
  const vs = new VectorStore();

  test("chunkText splits text into overlapping chunks", () => {
    const text = "Sentence one. Sentence two. Sentence three. Sentence four. Sentence five.";
    const chunks = chunkText(text, 30, 5);

    assert.ok(Array.isArray(chunks));
    assert.ok(chunks.length >= 2);
    assert.equal(chunks[0].index, 0);
    assert.ok(chunks[0].text.length > 0);
  });

  test("chunkText handles empty or short text", () => {
    const emptyChunks = chunkText("", 100, 20);
    assert.equal(emptyChunks.length, 0);

    const shortText = "Just a short message.";
    const singleChunk = chunkText(shortText, 500, 50);
    assert.equal(singleChunk.length, 1);
    assert.equal(singleChunk[0].text, shortText);
  });

  test("VectorStore lists documents without crashing", () => {
    const docs = vs.listDocuments();
    assert.ok(Array.isArray(docs));
  });

  test("VectorStore query on empty filter returns zero matches", async () => {
    const res = await vs.queryPaged("nonexistent query that cannot match", 0, 3, 0.99, "nonexistent_doc.txt");
    assert.equal(res.totalMatches, 0);
    assert.equal(res.results.length, 0);
  });
});
