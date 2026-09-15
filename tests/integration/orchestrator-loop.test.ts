import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { Orchestrator } from "../../core/orchestrator.js";
import { MockAIProvider } from "./mock-provider.js";
import { PluginManager } from "../../core/plugin-manager.js";

describe("Integration: Orchestrator Reasoning Loop", () => {
  const pm = PluginManager.getInstance();

  // Register a test tool in PluginManager
  const calcToolName = `integration_calc_${Date.now()}`;
  pm.registerPlugin(
    {
      id: `plugin_${calcToolName}`,
      name: "Integration Test Calculator",
      description: "Plugin for testing orchestrator tool calling",
      register: (registerTool) => {
        registerTool(
          {
            name: calcToolName,
            description: "Adds two numbers together",
            parameters: {
              type: "object",
              properties: {
                a: { type: "number" },
                b: { type: "number" },
              },
              required: ["a", "b"],
            },
          },
          async (args: any) => {
            return { sum: Number(args.a) + Number(args.b) };
          }
        );
      },
    },
    true
  );

  test("End-to-End Plan -> Execute -> Observe tool calling cycle", async () => {
    const mockProvider = new MockAIProvider();

    // Turn 1: LLM decides to call the tool
    // Turn 2: LLM processes observation and provides final answer
    mockProvider.nextTurnResponses = [
      {
        text: "Let me calculate that for you.",
        functionCalls: [
          {
            name: calcToolName,
            args: { a: 20, b: 30 },
          },
        ],
        finishReason: "tool_calls",
        usage: { promptTokens: 30, completionTokens: 15, totalTokens: 45 },
      },
      {
        text: "The calculated sum of 20 and 30 is 50.",
        functionCalls: [],
        finishReason: "stop",
        usage: { promptTokens: 50, completionTokens: 20, totalTokens: 70 },
      },
    ];

    const orchestrator = new Orchestrator(
      { maxToolIterations: 3, verbose: false },
      undefined,
      mockProvider
    );
    orchestrator.setProvider(mockProvider);

    const session = orchestrator.createSession("Integration Tool Test");
    assert.ok(session.id);
    const sessionId = session.id;

    // Whitelist the test tool for this session so it executes seamlessly
    orchestrator.getSecurityManager().addSessionWhitelist(sessionId, calcToolName);

    const response = await orchestrator.processPrompt("Please add 20 and 30", undefined, sessionId, "code");

    // Verify final response
    assert.ok(response.includes("50"));

    // Verify observation was sent to provider
    assert.equal(mockProvider.functionResponsesReceived.length, 1);
    const obs = mockProvider.functionResponsesReceived[0][0];
    assert.equal(obs.name, calcToolName);
    assert.deepEqual(obs.response, { sum: 50 });

    // Verify execution metadata
    const meta = orchestrator.getLastExecutionMeta(sessionId);
    assert.ok(meta);
    assert.ok(meta.iterations >= 1);
    assert.ok(meta.elapsedMs >= 0);

    // Verify conversation persisted in session memory
    const messages = orchestrator.getSessionMessages(sessionId);
    assert.ok(messages.length >= 2);
    assert.equal(messages[0].role, "user");
    assert.ok(messages[0].content.includes("Please add 20 and 30"));
  });

  test("Multi-turn conversation recalls past dialogue in same session", async () => {
    const mockProvider = new MockAIProvider();
    mockProvider.nextTurnResponses = [
      {
        text: "Hello Alice! Nice to meet you.",
        functionCalls: [],
        finishReason: "stop",
      },
      {
        text: "Your name is Alice, as you mentioned earlier.",
        functionCalls: [],
        finishReason: "stop",
      },
    ];

    const orchestrator = new Orchestrator(
      { verbose: false },
      undefined,
      mockProvider
    );
    orchestrator.setProvider(mockProvider);

    const session = orchestrator.createSession("Multi-turn Memory");
    const sessionId = session.id;

    // Turn 1
    const res1 = await orchestrator.processPrompt("My name is Alice.", undefined, sessionId);
    assert.ok(res1.includes("Alice"));

    // Turn 2
    const res2 = await orchestrator.processPrompt("What is my name?", undefined, sessionId);
    assert.ok(res2.includes("Alice"));

    // Verify persistence of both turns
    const history = orchestrator.getSessionMessages(sessionId);
    assert.equal(history.length, 4); // 2 user + 2 model
    assert.equal(history[0].content, "My name is Alice.");
    assert.equal(history[2].content, "What is my name?");
  });
});
