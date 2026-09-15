import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  isProviderAvailable,
  getAvailableProviders,
  detectProviderType,
  detectEmbeddingProviderType,
} from "../providers/provider-factory.js";

describe("AI Provider Factory Subsystem", () => {
  test("getAvailableProviders returns an array", () => {
    const available = getAvailableProviders();
    assert.ok(Array.isArray(available));
  });

  test("isProviderAvailable returns boolean for known providers", () => {
    const openaiAvail = isProviderAvailable("openai");
    assert.ok(typeof openaiAvail === "boolean");

    const anthropicAvail = isProviderAvailable("anthropic");
    assert.ok(typeof anthropicAvail === "boolean");

    const geminiAvail = isProviderAvailable("gemini");
    assert.ok(typeof geminiAvail === "boolean");
  });

  test("detectProviderType returns a valid provider type string", () => {
    const detected = detectProviderType();
    assert.ok(typeof detected === "string");
    assert.ok(detected.length > 0);
  });
  test("detectEmbeddingProviderType honors explicit provider override unconditionally", () => {
    assert.equal(detectEmbeddingProviderType("custom-model", "lmstudio"), "lmstudio");
    assert.equal(detectEmbeddingProviderType("liquid/lfm-2.5-embedding-350m:free", "openrouter"), "openrouter");
    assert.equal(detectEmbeddingProviderType("text-embedding-3-small", "openai"), "openai");
    assert.equal(detectEmbeddingProviderType("nomic-embed-text", "ollama"), "ollama");
    assert.equal(detectEmbeddingProviderType("text-embedding-004", "gemini"), "gemini");
  });

  test("UniversalEmbedder preserves configured provider and model independently of primary LLM provider", async () => {
    const { UniversalEmbedder } = await import("../core/embedder.js");
    const embedder = UniversalEmbedder.getInstance();

    embedder.setEmbeddingModel("liquid/lfm-2.5-embedding-350m:free", "openrouter");
    assert.equal(embedder.embeddingModel, "liquid/lfm-2.5-embedding-350m:free");
    assert.equal(embedder.embeddingProvider, "openrouter");

    // Simulate switching LLM provider to LM Studio
    const mockLlmProvider: any = {
      providerType: "lmstudio",
      model: "local-model",
      embeddingModel: "text-embedding-nomic-embed-text-v1.5",
    };
    embedder.setProvider(mockLlmProvider);

    // Vector embedding configuration must remain decoupled!
    assert.equal(embedder.embeddingModel, "liquid/lfm-2.5-embedding-350m:free");
    assert.equal(embedder.embeddingProvider, "openrouter");

    // Switching embedding provider explicitly
    embedder.setEmbeddingModel("text-embedding-3-small", "openai");
    assert.equal(embedder.embeddingModel, "text-embedding-3-small");
    assert.equal(embedder.embeddingProvider, "openai");
  });

  test("Schema Sanitization: array parameters without items are automatically assigned items schema", async () => {
    const { normalizeParameterSchema } = await import("../core/connector-manager.js");

    const faultySchema = {
      type: "object",
      properties: {
        filePath: { type: "string" },
        sheet: { type: "string" },
        range: { type: "string" },
        values: { type: "array" }, // Missing items!
      },
      required: ["filePath", "sheet", "range", "values"],
    };

    const sanitized = normalizeParameterSchema(faultySchema);
    assert.ok(sanitized.properties.values.items, "Expected values property to have items assigned");
    assert.equal(sanitized.properties.values.items.type, "string");

    // Also verify nested arrays (2D)
    const twoDimensionalSchema = {
      type: "object",
      properties: {
        matrix: { type: "array", items: { type: "array" } },
      },
    };
    const sanitized2D = normalizeParameterSchema(twoDimensionalSchema);
    assert.ok(sanitized2D.properties.matrix.items.items, "Expected nested array to have inner items assigned");
  });
});

