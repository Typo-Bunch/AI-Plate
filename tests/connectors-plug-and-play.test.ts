import { test, describe, after } from "node:test";
import assert from "node:assert/strict";
import AdmZip from "adm-zip";
import { ConnectorManager, ConnectorManifest, INSTALLED_CONNECTORS_DIR } from "../core/connector-manager.js";
import { PluginManager } from "../core/plugin-manager.js";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";

describe("Plug-and-Play Modular App Connectors Subsystem (Pure ZIP Format)", () => {
  const cm = ConnectorManager.getInstance();
  const pm = PluginManager.getInstance();
  const createdConnectorIds: string[] = [];

  after(() => {
    // Teardown all test created connectors cleanly
    for (const id of createdConnectorIds) {
      try {
        cm.deleteConnector(id);
      } catch {}
      const testDir = join(INSTALLED_CONNECTORS_DIR, id);
      if (existsSync(testDir)) {
        try {
          rmSync(testDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
        } catch {}
      }
    }
  });

  test("Strict Manifest Validation: accepts valid connector manifest", () => {
    const validManifest: ConnectorManifest = {
      manifest_type: "connector",
      id: "test_valid_app",
      name: "Test Valid App",
      version: "1.0.0",
      description: "A valid modular connector",
      icon: "⚡",
      connection: {
        protocol: "ws",
        host: "localhost",
        port: 9000,
        authType: "none",
      },
      endpoints: [
        {
          name: "ping",
          description: "Ping service",
          method: "GET",
          path: "/ping",
        },
      ],
    };

    const validation = ConnectorManager.validateConnectorManifest(validManifest);
    assert.equal(validation.valid, true);
    assert.ok(validation.manifest);
    assert.equal(validation.manifest.id, "test_valid_app");
    assert.equal(validation.manifest.connection.port, 9000);
  });

  test("Strict Manifest Validation: rejects standard plugin.json style manifest", () => {
    const standardPluginManifest = {
      manifest_version: 1,
      id: "fake_plugin_in_connectors",
      name: "Fake UI Plugin",
      version: "1.0.0",
      description: "Should be rejected by connector validator",
      ui_extension: {
        type: "modal",
        modal_config: { title: "Test" },
      },
      tools: [
        {
          name: "some_tool",
          handler: { type: "javascript", code: "return {};" },
        },
      ],
    };

    const validation = ConnectorManager.validateConnectorManifest(standardPluginManifest);
    assert.equal(validation.valid, false);
    assert.ok(validation.error);
    assert.ok(
      validation.error.includes("standard UI/Tool Plugin"),
      `Expected error to mention standard plugin rejection, got: ${validation.error}`
    );
  });

  test("Install Connector ZIP: extracts companion scripts and registers connector tools", async () => {
    const testId = `conn_zip_test_${Date.now()}`;
    createdConnectorIds.push(testId);

    // Create an in-memory ZIP package
    const zip = new AdmZip();
    const manifestData: ConnectorManifest = {
      manifest_type: "connector",
      id: testId,
      name: "Modular ZIP Creative App",
      version: "1.2.0",
      description: "Testing packaged ZIP connector with companion script",
      icon: "🎨",
      companion_script: "scripts/companion.py",
      connection: {
        protocol: "ws",
        host: "localhost",
        port: 9222,
      },
      endpoints: [
        {
          name: "trigger_render",
          description: "Trigger render in companion",
          method: "POST",
          path: "/render",
        },
      ],
    };

    zip.addFile("connector.json", Buffer.from(JSON.stringify(manifestData, null, 2), "utf-8"));
    zip.addFile("scripts/companion.py", Buffer.from("# Companion bridge script\nprint('Companion ready')", "utf-8"));

    const zipBuffer = zip.toBuffer();

    const res = await cm.installConnectorZip(zipBuffer);
    assert.equal(res.success, true);
    assert.ok(res.connector);
    assert.equal(res.connector.id, testId);

    // Verify companion script was extracted on disk
    const extractedScript = join(INSTALLED_CONNECTORS_DIR, testId, "scripts", "companion.py");
    assert.ok(existsSync(extractedScript), `Expected companion script at ${extractedScript}`);

    // Verify tool registered
    const toolNames = pm.getToolNames();
    assert.ok(toolNames.includes(`${testId}_trigger_render`));

    // Test Export as complete .connector.zip
    const exported = cm.exportConnector(testId);
    assert.ok(exported);
    assert.equal(exported.filename, `${testId}.connector.zip`);
    assert.ok(exported.bufferBase64);

    const exportedZip = new AdmZip(Buffer.from(exported.bufferBase64, "base64"));
    assert.ok(exportedZip.getEntry("connector.json"));
  });

  test("Install Connector ZIP: rejects plugin ZIP that lacks connector.json", async () => {
    const zip = new AdmZip();
    zip.addFile(
      "plugin.json",
      Buffer.from(
        JSON.stringify({
          name: "Standard Tool Plugin",
          manifest_version: 1,
          tools: [],
        }),
        "utf-8"
      )
    );

    const res = await cm.installConnectorZip(zip.toBuffer());
    assert.equal(res.success, false);
    assert.ok(res.error?.includes("standard UI/Tool Plugin"));
  });

  test("Delete modular connector: cleans up tools and disk folder", async () => {
    const testId = `conn_del_test_${Date.now()}`;
    const zip = new AdmZip();
    const manifestData: ConnectorManifest = {
      manifest_type: "connector",
      id: testId,
      name: "To Delete",
      connection: { protocol: "http", host: "localhost", port: 8000 },
      endpoints: [{ name: "ping", method: "GET", path: "/ping" }],
    };
    zip.addFile("connector.json", Buffer.from(JSON.stringify(manifestData, null, 2), "utf-8"));

    const installRes = await cm.installConnectorZip(zip.toBuffer());
    assert.equal(installRes.success, true);
    assert.ok(cm.getConnector(testId));
    assert.ok(pm.getToolNames().includes(`${testId}_ping`));

    // Delete
    const deleted = cm.deleteConnector(testId);
    assert.equal(deleted, true);
    assert.equal(cm.getConnector(testId), undefined);
    assert.ok(!pm.getToolNames().includes(`${testId}_ping`));
    assert.ok(!existsSync(join(INSTALLED_CONNECTORS_DIR, testId)));
  });

  test("Notion Connector ZIP: installs successfully with all 6 tools and uninstalls cleanly", async () => {
    const candidates = [
      join(process.cwd(), "connector-sample", "notion.connector.zip"),
      join(process.cwd(), "connectors", "notion.connector.zip"),
      join(process.cwd(), "artifacts", "notion.connector.zip"),
    ];
    const notionZipPath = candidates.find((p) => existsSync(p)) || candidates[0];
    assert.ok(existsSync(notionZipPath), "Expected notion.connector.zip to exist in connector-sample/ or connectors/");

    const zipBuffer = Buffer.from(new AdmZip(notionZipPath).toBuffer());
    const installRes = await cm.installConnectorZip(zipBuffer);
    assert.equal(installRes.success, true);
    assert.ok(installRes.connector);
    assert.equal(installRes.connector.id, "notion");
    assert.equal(installRes.connector.name, "Notion Workspace");

    // Verify tools registered in PluginManager
    const toolNames = pm.getToolNames();
    assert.ok(toolNames.includes("notion_search"));
    assert.ok(toolNames.includes("notion_query_database"));
    assert.ok(toolNames.includes("notion_get_page"));
    assert.ok(toolNames.includes("notion_get_block_children"));
    assert.ok(toolNames.includes("notion_create_page"));
    assert.ok(toolNames.includes("notion_append_blocks"));

    // Cleanup
    const deleted = cm.deleteConnector("notion");
    assert.equal(deleted, true);
    assert.ok(!pm.getToolNames().includes("notion_search"));
  });
});
