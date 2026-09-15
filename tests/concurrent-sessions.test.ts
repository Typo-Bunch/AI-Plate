import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { Orchestrator } from "../core/orchestrator.js";
import { MockAIProvider } from "./integration/mock-provider.js";
import { PluginManager } from "../core/plugin-manager.js";

describe("Concurrent Session Execution & Stream Isolation", () => {
  test("Simultaneous processPrompt calls across multiple sessions execute without conflict", async () => {
    const mockProvider = new MockAIProvider();
    const orchestrator = new Orchestrator(
      { verbose: false },
      () => {},
      mockProvider
    );
    orchestrator.initialize();

    const sessionA = orchestrator.createSession("Session Alpha");
    const sessionB = orchestrator.createSession("Session Beta");

    // Execute prompts simultaneously across Session A and Session B
    const [resultA, resultB] = await Promise.all([
      orchestrator.processPrompt("Message for Session A", undefined, sessionA.id),
      orchestrator.processPrompt("Message for Session B", undefined, sessionB.id),
    ]);

    assert.ok(resultA.includes("Message for Session A"), "Session A should return its own response");
    assert.ok(resultB.includes("Message for Session B"), "Session B should return its own response");

    // Verify session metadata isolation
    const metaA = orchestrator.getLastExecutionMeta(sessionA.id);
    const metaB = orchestrator.getLastExecutionMeta(sessionB.id);

    assert.ok(metaA, "Session A execution metadata must be present");
    assert.ok(metaB, "Session B execution metadata must be present");
    assert.ok(metaA.usage, "Session A usage should be populated");
    assert.ok(metaB.usage, "Session B usage should be populated");

    // Verify conversation history isolation in session storage
    const messagesA = orchestrator.getSessionMemory().getSessionMessages(sessionA.id);
    const messagesB = orchestrator.getSessionMemory().getSessionMessages(sessionB.id);

    assert.ok(messagesA.length >= 2, "Session A should have at least user and assistant turns");
    assert.ok(messagesB.length >= 2, "Session B should have at least user and assistant turns");

    const aHasBContent = messagesA.some((m) => m.content.includes("Session B"));
    const bHasAContent = messagesB.some((m) => m.content.includes("Session A"));

    assert.equal(aHasBContent, false, "Session A must not leak messages into Session B");
    assert.equal(bHasAContent, false, "Session B must not leak messages into Session A");
  });

  test("Tool execution emits context containing sessionId for stream isolation", async () => {
    const pm = PluginManager.getInstance();
    const toolName = `concurrent_test_tool_${Date.now()}`;

    pm.registerPlugin(
      {
        id: `plugin_${toolName}`,
        name: "Concurrent Test Tool Plugin",
        description: "Testing tool execution context isolation",
        register: (registerTool) => {
          registerTool(
            {
              name: toolName,
              description: "Echos input with session tag",
              parameters: {
                type: "object",
                properties: { text: { type: "string" } },
                required: ["text"],
              },
            },
            async (args: any, context?: any) => {
              return { echo: args.text, sessionId: context?.sessionId };
            }
          );
        },
      },
      true
    );

    const receivedEvents: Array<{ event: string; sessionId?: string }> = [];

    const onExec = (name: string, args: any, ctx?: any) => {
      if (name === toolName) receivedEvents.push({ event: "executing", sessionId: ctx?.sessionId });
    };
    const onComp = (name: string, res: any, ctx?: any) => {
      if (name === toolName) receivedEvents.push({ event: "completed", sessionId: ctx?.sessionId });
    };

    pm.on("tool:executing", onExec);
    pm.on("tool:completed", onComp);

    try {
      const resA = await pm.executeTool(toolName, { text: "task-A" }, { sessionId: "session-123" });
      const resB = await pm.executeTool(toolName, { text: "task-B" }, { sessionId: "session-456" });

      assert.equal((resA.response as any).sessionId, "session-123");
      assert.equal((resB.response as any).sessionId, "session-456");

      assert.equal(receivedEvents.length, 4);
      assert.equal(receivedEvents[0].sessionId, "session-123");
      assert.equal(receivedEvents[1].sessionId, "session-123");
      assert.equal(receivedEvents[2].sessionId, "session-456");
      assert.equal(receivedEvents[3].sessionId, "session-456");
    } finally {
      pm.off("tool:executing", onExec);
      pm.off("tool:completed", onComp);
    }
  });
});
