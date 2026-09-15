import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  getResolvedConfigYamlPath,
  getResolvedEnvPath,
  CONFIG,
  THINKING_PRESETS,
  PROVIDER_MODELS,
  resolveModel,
  resolveEmbeddingModel,
} from "../core/config.js";

describe("Configuration Subsystem", () => {
  test("getResolvedConfigYamlPath should return a valid string path", () => {
    const yamlPath = getResolvedConfigYamlPath();
    assert.ok(typeof yamlPath === "string" && yamlPath.length > 0);
    assert.ok(yamlPath.endsWith(".yaml") || yamlPath.endsWith(".yml"));
  });

  test("getResolvedEnvPath should return a valid .env path", () => {
    const envPath = getResolvedEnvPath();
    assert.ok(typeof envPath === "string" && envPath.length > 0);
    assert.ok(envPath.endsWith(".env"));
  });

  test("CONFIG should provide system defaults", () => {
    assert.equal(CONFIG.NAME, "AI Plate");
    assert.ok(typeof CONFIG.DEFAULT_PROVIDER === "string");
    assert.ok(typeof CONFIG.DEFAULT_MODEL === "string");
    assert.ok(Array.isArray(CONFIG.DEFAULT_PROVIDER_PRIORITY));
    assert.ok(typeof CONFIG.DEFAULT_MAX_TOOL_ITERATIONS === "number" && CONFIG.DEFAULT_MAX_TOOL_ITERATIONS > 0);
  });

  test("THINKING_PRESETS should define presets for all levels", () => {
    const levels = ["off", "low", "medium", "high", "max"] as const;
    for (const lvl of levels) {
      assert.ok(THINKING_PRESETS[lvl], `Missing preset for level: ${lvl}`);
      assert.ok(typeof THINKING_PRESETS[lvl].budgetTokens === "number");
    }
  });

  test("PROVIDER_MODELS should contain supported providers", () => {
    assert.ok(Array.isArray(PROVIDER_MODELS.openai));
    assert.ok(Array.isArray(PROVIDER_MODELS.anthropic));
    assert.ok(Array.isArray(PROVIDER_MODELS.gemini));
  });

  test("resolveModel should return fallback or configured model", () => {
    const model = resolveModel("openai");
    assert.ok(typeof model === "string" && model.length > 0);
    const custom = resolveModel("openai", "gpt-4o-custom");
    assert.equal(custom, "gpt-4o-custom");
  });

  test("resolveEmbeddingModel should return a valid embedding model", () => {
    const emb = resolveEmbeddingModel("openai");
    assert.ok(typeof emb === "string" && emb.length > 0);
  });
});
