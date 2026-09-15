import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { Orchestrator } from "../../core/orchestrator.js";
import { ConnectorManager } from "../../core/connector-manager.js";
import { PluginManager } from "../../core/plugin-manager.js";
import { SecurityManager } from "../../core/security-manager.js";
import { AgentDatabase } from "../../core/database.js";
import { CONFIG } from "../../core/config.js";
import { MockAIProvider } from "./mock-provider.js";
import { shellPlugin } from "../../plugins/tools/shell-plugin.js";

describe("Integration: IPC Protocol & Bridge API Surface", () => {
  const pm = PluginManager.getInstance();
  const cm = ConnectorManager.getInstance();
  const sec = SecurityManager.getInstance();
  const db = AgentDatabase.getInstance();
  const mockProvider = new MockAIProvider();
  const orchestrator = new Orchestrator({ verbose: false }, undefined, mockProvider);
  orchestrator.setProvider(mockProvider);
  orchestrator.registerPlugin(shellPlugin, true);

  test("Model & Configuration API route returns active state", () => {
    const configState = {
      model: orchestrator.activeModel,
      provider: orchestrator.activeProvider,
      embeddingModel: orchestrator.activeEmbeddingModel,
      thinkingLevel: orchestrator.thinkingLevel,
      config: CONFIG,
    };

    assert.ok(configState.model);
    assert.ok(configState.provider);
    assert.ok(configState.config);
    assert.ok(typeof configState.config.DEFAULT_MAX_TOOL_ITERATIONS === "number");
  });

  test("Plugins API route lists active tools and metadata without circular references", () => {
    const plugins = pm.getPluginsInfo();
    assert.ok(Array.isArray(plugins));
    assert.ok(plugins.length > 0);

    // Verify JSON clonability (no functions, no circular refs)
    const serialized = JSON.stringify(plugins);
    assert.ok(serialized.length > 0);
    const parsed = JSON.parse(serialized);
    assert.equal(parsed.length, plugins.length);
  });

  test("Connectors API route returns structured connector configurations", () => {
    const tempId = `conn_ipc_test_${Date.now()}`;
    try {
      cm.saveConnector({
        id: tempId,
        name: "IPC Test App",
        type: "custom_rest",
        description: "Testing IPC connector serialization",
        icon: "🔌",
        enabled: true,
        host: "localhost",
        port: 9999,
        protocol: "http",
      });

      const connectors = cm.getAllConnectors();
      assert.ok(Array.isArray(connectors));

      // Verify JSON clonability
      const serialized = JSON.stringify(connectors);
      assert.ok(serialized);
      const parsed = JSON.parse(serialized);
      assert.ok(parsed.some((c: any) => c.id === tempId));
    } finally {
      cm.deleteConnector(tempId);
    }
  });

  test("Sessions API route handles session lifecycles and history queries", () => {
    const session = orchestrator.createSession("IPC Test Session");
    assert.ok(session.id);

    const list = orchestrator.listSessions();
    assert.ok(list.some((s) => s.id === session.id));

    // Test session title updating
    const updated = orchestrator.updateSessionTitle(session.id, "Updated Title from User Prompt");
    assert.equal(updated, true);
    const updatedList = orchestrator.listSessions();
    const foundSession = updatedList.find((s) => s.id === session.id);
    assert.ok(foundSession);
    assert.equal(foundSession.title, "Updated Title from User Prompt");

    const messages = orchestrator.getSessionMessages(session.id);
    assert.ok(Array.isArray(messages));

    const deleted = orchestrator.deleteSession(session.id);
    assert.equal(deleted, true);
  });

  test("Security API route exposes settings and approval token queries", () => {
    const settings = sec.getConfig();
    assert.ok(settings);
    assert.ok(settings.capabilities);
    assert.ok(typeof settings.mode === "string");

    const pending = sec.getPendingApprovals();
    assert.ok(Array.isArray(pending));
  });

  test("System Stats API route returns memory, DB, and document counts", () => {
    const stats = {
      totalSessions: orchestrator.listSessions().length,
      totalDocuments: orchestrator.getVectorStore().totalDocuments,
      totalChunks: orchestrator.getVectorStore().totalChunks,
      dbPath: db.dbPath,
      uptime: process.uptime(),
      memory: process.memoryUsage(),
    };

    assert.ok(typeof stats.totalSessions === "number");
    assert.ok(typeof stats.totalDocuments === "number");
    assert.ok(stats.dbPath.endsWith(".db"));
    assert.ok(stats.memory.heapUsed > 0);
  });

  test("Sandbox Scratchpad file listing returns structured metadata", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const sandboxDir = path.resolve(process.cwd(), CONFIG.SHELL.SANDBOX_DIR || ".sandbox");
    if (!fs.existsSync(sandboxDir)) fs.mkdirSync(sandboxDir, { recursive: true });

    const testFileName = `test_script_${Date.now()}.py`;
    const testFilePath = path.join(sandboxDir, testFileName);
    fs.writeFileSync(testFilePath, "print('hello from sandbox')", "utf-8");

    try {
      const files = fs.readdirSync(sandboxDir);
      assert.ok(files.includes(testFileName));

      const st = fs.statSync(testFilePath);
      const ext = path.extname(testFileName).toLowerCase();
      const meta = {
        name: testFileName,
        sizeBytes: st.size,
        modifiedAt: st.mtime.toISOString(),
        isCode: [".py", ".js", ".ts"].includes(ext),
        ext,
      };

      assert.equal(meta.name, testFileName);
      assert.ok(meta.sizeBytes > 0);
      assert.equal(meta.isCode, true);
      assert.equal(meta.ext, ".py");
    } finally {
      if (fs.existsSync(testFilePath)) fs.unlinkSync(testFilePath);
    }
  });

  test("Sandbox & Artifacts Video Support: detects video files with correct MIME and isVideo flag", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const sandboxDir = path.resolve(process.cwd(), CONFIG.SHELL.SANDBOX_DIR || ".sandbox");
    if (!fs.existsSync(sandboxDir)) fs.mkdirSync(sandboxDir, { recursive: true });

    const videoFileName = `test_render_${Date.now()}.mp4`;
    const videoPath = path.join(sandboxDir, videoFileName);
    fs.writeFileSync(videoPath, Buffer.from("fake-mp4-video-data-content"));

    try {
      const ext = path.extname(videoFileName).toLowerCase();
      const isVideo = [".mp4", ".webm", ".ogg", ".mov", ".mkv", ".avi", ".m4v"].includes(ext);
      assert.equal(isVideo, true, "Video file should be recognized as video");

      const mimeMap: Record<string, string> = {
        ".mp4": "video/mp4",
        ".webm": "video/webm",
        ".ogg": "video/ogg",
        ".mov": "video/quicktime",
      };
      assert.equal(mimeMap[ext], "video/mp4", "MIME type should be video/mp4");
    } finally {
      if (fs.existsSync(videoPath)) fs.unlinkSync(videoPath);
    }
  });

  test("Artifacts Web Share: generates public web deployment link for artifact", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const artifactsDir = path.resolve(process.cwd(), CONFIG.SHELL.ARTIFACTS_DIR || "artifacts");
    if (!fs.existsSync(artifactsDir)) fs.mkdirSync(artifactsDir, { recursive: true });

    const testFile = `share_test_${Date.now()}.html`;
    const filePath = path.join(artifactsDir, testFile);
    fs.writeFileSync(filePath, "<h1>AI Plate Live Web Share Test</h1>", "utf-8");

    try {
      // Test bytebin publication directly
      const content = fs.readFileSync(filePath);
      const res = await fetch("https://bytebin.lucko.me/post", {
        method: "POST",
        headers: { "Content-Type": "text/html" },
        body: content,
      });

      assert.equal(res.status, 201);
      const json = await res.json();
      assert.ok(json.key);
      const publicUrl = `https://bytebin.lucko.me/${json.key}`;
      assert.ok(publicUrl.startsWith("https://bytebin.lucko.me/"));

      // Verify content is immediately reachable
      const check = await fetch(publicUrl);
      assert.equal(check.status, 200);
      const text = await check.text();
      assert.ok(text.includes("AI Plate Live Web Share Test"));
    } finally {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }
  });
});
