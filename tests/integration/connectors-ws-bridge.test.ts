import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn, ChildProcess } from "node:child_process";
import { ConnectorManager, BlenderWebSocketClient } from "../../core/connector-manager.js";

describe("Integration: App Connectors & WebSocket Bridge", () => {
  let bridgeProc: ChildProcess | null = null;
  const cm = ConnectorManager.getInstance();
  const wsUrl = "ws://localhost:8198/ws";

  before(async () => {
    // Launch the dual-mode companion bridge server
    bridgeProc = spawn("python", ["tests/fixtures/blender_bridge.py"], {
      stdio: "ignore",
      detached: false,
    });

    // Wait for socket to become ready
    for (let i = 0; i < 20; i++) {
      try {
        const client = BlenderWebSocketClient.getInstance(wsUrl);
        await client.connect();
        break;
      } catch {
        await new Promise((r) => setTimeout(r, 150));
      }
    }
  });

  after(() => {
    if (bridgeProc) {
      try {
        bridgeProc.kill();
      } catch {}
    }
  });

  test("Live WebSocket Handshake and Ping", async () => {
    const client = BlenderWebSocketClient.getInstance(wsUrl);
    const res = await client.sendAction("ping", {}, 3000);
    assert.ok(res);
    assert.equal(res.success, true);
    assert.equal(res.status, "online");
    assert.equal(res.protocol, "websocket");
  });

  test("Remote script execution over WebSocket", async () => {
    const client = BlenderWebSocketClient.getInstance(wsUrl);
    const res = await client.sendAction("exec", { script: "print('Integration test execution successful!')" }, 3000);
    assert.ok(res);
    assert.ok(res.scene || res.stdout !== undefined || res.output !== undefined);
  });

  test("Scene inspection over WebSocket", async () => {
    const client = BlenderWebSocketClient.getInstance(wsUrl);
    const scene = await client.sendAction("scene", {}, 3000);
    assert.ok(scene);
    assert.ok(scene.objects);
    assert.ok(Array.isArray(scene.objects));
  });

  test("ConnectorManager.testConnection verifies live WebSocket connectivity", async () => {
    const tempConfig = {
      id: "test_temp_ws_bridge",
      name: "Temporary Bridge Test",
      type: "blender" as const,
      description: "Temp test connector",
      icon: "🎨",
      enabled: false,
      host: "localhost",
      port: 8198,
      protocol: "http" as const,
    };
    const result = await cm.testConnection("test_temp_ws_bridge", tempConfig);
    assert.equal(result.success, true);
    assert.ok(result.message.includes("WebSocket"));
    assert.ok(typeof result.latencyMs === "number");
  });
});
