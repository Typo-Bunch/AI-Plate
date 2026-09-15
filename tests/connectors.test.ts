import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { ConnectorManager, ConnectorConfig } from "../core/connector-manager.js";
import { PluginManager } from "../core/plugin-manager.js";

describe("App Connectors Subsystem", () => {
  const cm = ConnectorManager.getInstance();
  const pm = PluginManager.getInstance();

  test("ConnectorManager should initialize cleanly and list connectors", () => {
    const connectors = cm.getAllConnectors();
    assert.ok(Array.isArray(connectors));
  });

  test("Connector Lifecycle: save with strict types, toggle, and delete", () => {
    const testId = `conn_unit_test_${Date.now()}`;
    const newConnector: ConnectorConfig = {
      id: testId,
      name: "Unit Test REST Connector",
      type: "custom_rest",
      description: "Temporary REST connector for testing",
      icon: "🔌",
      enabled: false,
      host: "127.0.0.1",
      port: 9999,
      protocol: "http",
      authType: "none",
      customTools: [
        {
          name: "ping",
          description: "Ping the test service",
          method: "GET",
          path: "/ping",
        },
      ],
    };

    try {
      // 1. Save new connector
      const saved = cm.saveConnector(newConnector);
      assert.equal(saved.id, testId);
      assert.equal(saved.enabled, false);
      assert.equal(saved.type, "custom_rest");

      // 2. Verify retrieval
      const retrieved = cm.getConnector(testId);
      assert.ok(retrieved);
      assert.equal(retrieved.name, "Unit Test REST Connector");
      assert.equal(retrieved.port, 9999);

      // 3. Toggle ON and verify tool synchronization to PluginManager
      const toggledOn = cm.toggleConnector(testId, true);
      assert.ok(toggledOn);
      assert.equal(toggledOn.enabled, true);

      const toolNamesActive = pm.getToolNames();
      assert.ok(
        toolNamesActive.includes(`${testId}_ping`),
        `Expected ${testId}_ping to be registered in PluginManager`
      );

      // 4. Toggle OFF and verify tool was removed from PluginManager
      const toggledOff = cm.toggleConnector(testId, false);
      assert.ok(toggledOff);
      assert.equal(toggledOff.enabled, false);

      const toolNamesInactive = pm.getToolNames();
      assert.ok(
        !toolNamesInactive.includes(`${testId}_ping`),
        `Expected ${testId}_ping to be unregistered from PluginManager`
      );
    } finally {
      // 5. Delete connector and ensure pristine teardown
      cm.deleteConnector(testId);
      const afterDelete = cm.getConnector(testId);
      assert.equal(afterDelete, undefined);
    }
  });

  test("testConnection should safely report offline without throwing unhandled exceptions", async () => {
    // Port 59999 is an unused loopback port
    const offlineConfig: ConnectorConfig = {
      id: "offline_test",
      name: "Offline Service",
      type: "custom_rest",
      description: "Service that is definitely offline",
      icon: "🔴",
      enabled: false,
      host: "127.0.0.1",
      port: 59999,
      protocol: "http",
    };

    const res = await cm.testConnection("offline_test", offlineConfig);
    assert.ok(res);
    assert.equal(res.success, false);
    assert.ok(typeof res.message === "string");
  });
});
