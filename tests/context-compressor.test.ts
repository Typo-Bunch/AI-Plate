import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { ContextCompressor } from "../core/context-compressor.js";
import { CONFIG } from "../core/config.js";
import { Orchestrator } from "../core/orchestrator.js";
import { MockAIProvider } from "./integration/mock-provider.js";
import { PluginManager } from "../core/plugin-manager.js";

describe("Intelligent Context Compressor Subsystem", () => {
  test("Instantiation and Default Configuration", () => {
    const compressor = new ContextCompressor();
    const config = compressor.getConfig();

    assert.ok(config);
    assert.equal(typeof config.enabled, "boolean");
    assert.ok(["smart", "extractive", "sliding_window"].includes(config.mode));
    assert.ok(config.maxPromptTokens > 0);
    assert.ok(config.maxHistoryTurns > 0);
    assert.ok(config.maxToolOutputChars > 0);
    assert.ok(config.preserveRecentTurns > 0);
  });

  test("Token Estimation produces realistic token counts", () => {
    const compressor = new ContextCompressor();

    assert.equal(compressor.estimateTokens(""), 0);
    assert.equal(compressor.estimateTokens("hello"), 2);

    const paragraph = "The quick brown fox jumps over the lazy dog. A fast model reasoning harness.";
    const tokens = compressor.estimateTokens(paragraph);
    assert.ok(tokens > 10 && tokens < 30);

    const codeSnippet = `function calculateTotal(items: { price: number, quantity: number }[]) {
      return items.reduce((acc, item) => acc + item.price * item.quantity, 0);
    }`;
    const codeTokens = compressor.estimateTokens(codeSnippet);
    assert.ok(codeTokens > 20 && codeTokens < 70);
  });

  test("Pass-through fidelity when content is below threshold", () => {
    const compressor = new ContextCompressor({ maxToolOutputChars: 1000 });
    const shortText = "Normal short tool output that needs no compression.";

    const result = compressor.compressToolOutput("test_tool", shortText);
    assert.equal(result.wasCompressed, false);
    assert.equal(result.compressed, shortText);
    assert.equal(result.originalTokens, result.compressedTokens);

    const shortJson = { status: "ok", count: 3, items: ["apple", "banana", "cherry"] };
    const jsonResult = compressor.compressToolOutput("test_tool", shortJson);
    assert.equal(jsonResult.wasCompressed, false);
    assert.deepEqual(jsonResult.compressed, shortJson);
  });

  test("String tool output compression preserves head and tail with informative notice", () => {
    const compressor = new ContextCompressor({ maxToolOutputChars: 500 });
    const lines = Array.from({ length: 100 }, (_, i) => `Line ${i + 1}: Diagnostic log message with extra verbose context.`);
    const hugeText = lines.join("\n");

    const result = compressor.compressToolOutput("shell_exec", hugeText);
    assert.equal(result.wasCompressed, true);
    assert.ok(typeof result.compressed === "string");
    const compressedStr = result.compressed as string;

    // Head is preserved
    assert.ok(compressedStr.includes("Line 1:"));
    assert.ok(compressedStr.includes("Line 2:"));

    // Tail is preserved
    assert.ok(compressedStr.includes("Line 100:"));
    assert.ok(compressedStr.includes("Line 99:"));

    // Middle omission notice is injected
    assert.ok(compressedStr.includes("Context Compressor (shell_exec)"));
    assert.ok(compressedStr.includes("omitted for token optimization"));

    assert.ok(result.compressedTokens < result.originalTokens);
  });

  test("JSON tool output compression compacts large arrays and oversized fields", () => {
    const compressor = new ContextCompressor({ maxToolOutputChars: 600 });
    const heavyPayload = {
      status: "success",
      query: "SELECT * FROM large_table",
      items: Array.from({ length: 40 }, (_, i) => ({ id: i + 1, name: `Record ${i + 1}` })),
      extra_verbose_string: "X".repeat(2000),
    };

    const result = compressor.compressToolOutput("database_query", heavyPayload);
    assert.equal(result.wasCompressed, true);
    assert.ok(typeof result.compressed === "object");

    const compressed = result.compressed as Record<string, any>;
    assert.ok(Array.isArray(compressed.items));
    // Array should have been compacted with omitted notice
    const hasOmittedNotice = compressed.items.some((item: any) =>
      typeof item === "string" && item.includes("Context Compressor")
    );
    assert.ok(hasOmittedNotice);
  });

  test("compressFunctionResponses compacts array of tool responses cleanly", () => {
    const compressor = new ContextCompressor({ maxToolOutputChars: 300 });
    const responses = [
      {
        id: "call_1",
        name: "small_tool",
        response: { result: "ok" },
      },
      {
        id: "call_2",
        name: "big_tool",
        response: { log: "A".repeat(2000) },
      },
    ];

    const compressed = compressor.compressFunctionResponses(responses);
    assert.equal(compressed.length, 2);
    // Small tool response untouched
    assert.deepEqual(compressed[0].response, { result: "ok" });
    // Big tool response compressed
    assert.notDeepEqual(compressed[1].response, responses[1].response);
  });

  test("Prompt context compression enforces budget while keeping user prompt 100% intact", () => {
    const compressor = new ContextCompressor({ maxPromptTokens: 100 });
    const userPrompt = "What is the capital of France and what is its population?";

    const contextParts = [
      "Doc 1: Paris is the capital and most populous city of France.",
      "Doc 2: " + "Unrelated background information about agricultural equipment in 19th century Europe. ".repeat(20),
      "Doc 3: " + "Another lengthy passage describing medieval transport systems and trade routes across the continent. ".repeat(20),
    ];

    const compressed = compressor.compressPromptContext(contextParts, userPrompt, 120);

    // User prompt MUST be preserved verbatim
    assert.ok(compressed.includes("─── Current User Message ───"));
    assert.ok(compressed.includes(userPrompt));

    // Most relevant doc matching "capital" and "France" should be prioritized
    assert.ok(compressed.includes("Paris is the capital"));

    // Total tokens should be clamped within reasonable bounds of the requested budget
    const estimatedTokens = compressor.estimateTokens(compressed);
    assert.ok(estimatedTokens <= 140);
  });

  test("Conversation history compression preserves anchors and recent turns", () => {
    const compressor = new ContextCompressor({
      maxHistoryTurns: 6,
      preserveRecentTurns: 2,
    });

    const messages: Array<{ role: "user" | "model"; content: string }> = [
      { role: "user", content: "Initial Goal: I want to build a real-time web application." }, // Anchor
      { role: "model", content: "I can help you build that. What framework do you prefer?" },
      { role: "user", content: "Let's use Node.js and TypeScript." },
      { role: "model", content: "Great choice. I will set up the tsconfig." },
      { role: "user", content: "Also add WebSocket support." },
      { role: "model", content: "WebSocket library installed and configured." },
      { role: "user", content: "Now write the main server file." }, // Recent 2
      { role: "model", content: "Server file written successfully." }, // Recent 1
    ];

    const compressed = compressor.compressHistory(messages);

    // Length should be condensed: 1 anchor + 1 summary + 2 recent turns = 4 turns
    assert.equal(compressed.length, 4);

    // Turn 0 is preserved as original anchor
    assert.equal(compressed[0].content, "Initial Goal: I want to build a real-time web application.");

    // Turn 1 is the summary
    assert.ok(compressed[1].content.includes("Context Compressor"));
    assert.ok(compressed[1].content.includes("Summarized"));

    // Recent turns preserved verbatim
    assert.equal(compressed[2].content, "Now write the main server file.");
    assert.equal(compressed[3].content, "Server file written successfully.");
  });

  test("Stats tracking records compressions and saved tokens", () => {
    const compressor = new ContextCompressor({ maxToolOutputChars: 200 });
    compressor.resetStats();

    const initialStats = compressor.getStats();
    assert.equal(initialStats.totalCompressions, 0);
    assert.equal(initialStats.estimatedTokensSaved, 0);

    // Perform a compression
    compressor.compressToolOutput("heavy_tool", "Z".repeat(1500));

    const updatedStats = compressor.getStats();
    assert.equal(updatedStats.totalCompressions, 1);
    assert.equal(updatedStats.toolCompressions, 1);
    assert.ok(updatedStats.estimatedTokensSaved > 0);
    assert.ok(updatedStats.lastCompressionTimestamp);
  });

  test("Integration: Orchestrator reasoning loop utilizes ContextCompressor seamlessly", async () => {
    const mockProvider = new MockAIProvider();
    const compressorToolName = `compressor_test_tool_${Date.now()}`;

    // Register a tool that returns a large output
    PluginManager.getInstance().registerPlugin(
      {
        id: `plugin_${compressorToolName}`,
        name: "Large Output Test Tool",
        register: (registerTool) => {
          registerTool(
            {
              name: compressorToolName,
              description: "Returns a very large log output",
              parameters: { type: "object", properties: {} },
            },
            async () => {
              return { log: "LOG_LINE: " + "Testing context compression in tool loop. ".repeat(150) };
            }
          );
        },
      },
      true
    );

    mockProvider.nextTurnResponses = [
      {
        text: "Running tool to fetch logs...",
        functionCalls: [{ name: compressorToolName, args: {} }],
        finishReason: "tool_calls",
        usage: { promptTokens: 20, completionTokens: 10, totalTokens: 30 },
      },
      {
        text: "I analyzed the logs and everything is running properly.",
        functionCalls: [],
        finishReason: "stop",
        usage: { promptTokens: 50, completionTokens: 15, totalTokens: 65 },
      },
    ];

    const orchestrator = new Orchestrator({ verbose: false }, undefined, mockProvider);
    orchestrator.setProvider(mockProvider);

    // Configure compressor on orchestrator to compress tools > 400 chars
    orchestrator.getContextCompressor().updateConfig({ maxToolOutputChars: 400 });

    const session = orchestrator.createSession("Compressor Integration");
    orchestrator.getSecurityManager().addSessionWhitelist(session.id, compressorToolName);

    const response = await orchestrator.processPrompt("Check logs", undefined, session.id);
    assert.ok(response.includes("analyzed the logs"));

    // Verify that the function response sent to provider was compressed
    assert.equal(mockProvider.functionResponsesReceived.length, 1);
    const sentObs = mockProvider.functionResponsesReceived[0][0];
    assert.equal(sentObs.name, compressorToolName);

    // Check that compressor stats were recorded
    const stats = orchestrator.getContextCompressor().getStats();
    assert.ok(stats.totalCompressions > 0);
  });

  test("compressSessionContext explicitly compacts conversation history and updates session instance", async () => {
    const mockProvider = new MockAIProvider();
    const orchestrator = new Orchestrator({ verbose: false }, undefined, mockProvider);
    orchestrator.setProvider(mockProvider);

    const session = orchestrator.createSession("On Demand Compaction");

    // Add multiple turns into session memory with realistic length
    const memory = (orchestrator as any).sessionMemory;
    for (let i = 1; i <= 6; i++) {
      await memory.memorize("user", `Turn ${i}: ` + "Could you explain the system architecture in detail? ".repeat(10), session.id);
      await memory.memorize("model", `Turn ${i}: ` + "Here is a breakdown of all system modules and pipeline stages. ".repeat(15), session.id);
    }

    const result = orchestrator.compressSessionContext(session.id);
    assert.equal(result.success, true);
    assert.equal(result.sessionId, session.id);
    assert.equal(result.originalTurns, 12);
    assert.ok(result.compressedTurns < result.originalTurns);
    assert.ok(result.tokensSaved > 0);
    assert.equal(result.summaryGenerated, true);

    // Verify provider received the compacted history
    assert.ok(mockProvider.conversationHistory.length < 12);
  });

  test("getSessionContextTokens returns real-time metrics for history, draft, and limits", async () => {
    const mockProvider = new MockAIProvider();
    const orchestrator = new Orchestrator({ verbose: false }, undefined, mockProvider);
    orchestrator.setProvider(mockProvider);

    const session = orchestrator.createSession("Tokens Metric Inspection");
    const memory = (orchestrator as any).sessionMemory;

    await memory.memorize("user", "Hello world, testing token calculations.", session.id);
    await memory.memorize("model", "Here is a response with some text.", session.id);

    const metrics = orchestrator.getSessionContextTokens(session.id, "Draft prompt query here");
    assert.equal(metrics.success, true);
    assert.equal(metrics.sessionId, session.id);
    assert.equal(metrics.turnsCount, 2);
    assert.ok(metrics.historyTokens > 0);
    assert.ok(metrics.draftTokens > 0);
    assert.equal(metrics.totalTokens, metrics.historyTokens + metrics.draftTokens);
    assert.ok(metrics.maxPromptTokens > 0);
    assert.ok(metrics.percentUsed >= 0);
  });

  test("tokensSaved is strictly isolated per session instance", async () => {
    const mockProvider = new MockAIProvider();
    const orchestrator = new Orchestrator({ verbose: false }, undefined, mockProvider);
    orchestrator.setProvider(mockProvider);

    const sessionA = orchestrator.createSession("Session A");
    const sessionB = orchestrator.createSession("Session B");
    const memory = (orchestrator as any).sessionMemory;

    // Populate Session A with turns and compress it
    for (let i = 1; i <= 6; i++) {
      await memory.memorize("user", `Turn ${i}: ` + "Could you explain the system architecture in detail? ".repeat(10), sessionA.id);
      await memory.memorize("model", `Turn ${i}: ` + "Here is a breakdown of all system modules and pipeline stages. ".repeat(15), sessionA.id);
    }
    const resultA = orchestrator.compressSessionContext(sessionA.id);
    assert.ok(resultA.tokensSaved > 0);

    // Session A should report positive tokensSaved
    const metricsA = orchestrator.getSessionContextTokens(sessionA.id);
    assert.equal(metricsA.tokensSaved, resultA.tokensSaved);

    // Session B should report 0 tokensSaved
    const metricsB = orchestrator.getSessionContextTokens(sessionB.id);
    assert.equal(metricsB.tokensSaved, 0);
  });
});
