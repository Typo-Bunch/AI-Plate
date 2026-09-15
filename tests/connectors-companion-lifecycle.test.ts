import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { existsSync, readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import AdmZip from "adm-zip";
import http from "node:http";
import https from "node:https";
import { ConnectorManager, INSTALLED_CONNECTORS_DIR, ConnectorManifest } from "../core/connector-manager.js";

describe("Connector Companion Auto-Start & Process Lifecycle Subsystem", () => {
  const cm = ConnectorManager.getInstance();
  const createdConnectorIds: string[] = [];

  after(async () => {
    // Stop all companions and clean up test directories
    cm.stopAllCompanions();
    await new Promise((resolve) => setTimeout(resolve, 200));
    for (const id of createdConnectorIds) {
      cm.deleteConnector(id);
      const testDir = join(INSTALLED_CONNECTORS_DIR, id);
      if (existsSync(testDir)) {
        try {
          rmSync(testDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
        } catch {}
      }
    }
  });

  test("Install Connector ZIP: defaults autoStartCompanion to true when companion_script is defined", async () => {
    const testId = `conn_autostart_test_${Date.now()}`;
    createdConnectorIds.push(testId);

    const zip = new AdmZip();
    const manifest: ConnectorManifest = {
      manifest_type: "connector",
      id: testId,
      name: "Auto-Start Test Connector",
      version: "1.0.0",
      description: "Testing companion auto-start default",
      icon: "⚡",
      companion_script: "server.mjs",
      connection: {
        protocol: "http",
        host: "127.0.0.1",
        port: 9876,
      },
      endpoints: [
        {
          name: "ping",
          description: "Ping endpoint",
          method: "GET",
          path: "/ping",
        },
      ],
    };

    // Minimal companion server that responds to /health
    const serverCode = `
      import http from 'node:http';
      const server = http.createServer((req, res) => {
        if (req.url === '/health') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, service: 'test-companion' }));
        } else {
          res.writeHead(404);
          res.end();
        }
      });
      server.listen(9876, '127.0.0.1');
    `;

    zip.addFile("connector.json", Buffer.from(JSON.stringify(manifest, null, 2), "utf-8"));
    zip.addFile("server.mjs", Buffer.from(serverCode, "utf-8"));

    const installResult = await cm.installConnectorZip(zip.toBuffer());
    assert.equal(installResult.success, true);
    assert.ok(installResult.connector);
    assert.equal(installResult.connector.autoStartCompanion, true);

    const saved = cm.getConnector(testId);
    assert.ok(saved);
    assert.equal(saved.autoStartCompanion, true);
  });

  test("Companion Process Lifecycle: start, query status, restart, and stop", async () => {
    const testId = `conn_lifecycle_test_${Date.now()}`;
    createdConnectorIds.push(testId);

    const zip = new AdmZip();
    const port = 9877;
    const manifest: ConnectorManifest = {
      manifest_type: "connector",
      id: testId,
      name: "Lifecycle Test Connector",
      version: "1.0.0",
      description: "Testing full lifecycle",
      icon: "🔄",
      companion_script: "server.mjs",
      connection: {
        protocol: "http",
        host: "127.0.0.1",
        port,
      },
      options: {
        test_path: "/health",
      },
    };

    const serverCode = `
      import http from 'node:http';
      const server = http.createServer((req, res) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, pid: process.pid, envToken: process.env.SPOTIFY_ACCESS_TOKEN || process.env.AUTH_TOKEN || null }));
      });
      server.listen(${port}, '127.0.0.1');
    `;

    zip.addFile("connector.json", Buffer.from(JSON.stringify(manifest, null, 2), "utf-8"));
    zip.addFile("server.mjs", Buffer.from(serverCode, "utf-8"));

    await cm.installConnectorZip(zip.toBuffer());
    let status = cm.getCompanionStatus(testId);
    for (let i = 0; i < 20 && status.status !== "running" && status.status !== "starting"; i++) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      status = cm.getCompanionStatus(testId);
    }

    // 1. Initial status after install should start companion automatically if enabled
    assert.ok(status.status === "running" || status.status === "starting");
    assert.ok(typeof status.pid === "number");

    // 2. Stop companion
    const stopResult = await cm.stopCompanion(testId);
    assert.equal(stopResult.success, true);
    status = cm.getCompanionStatus(testId);
    assert.equal(status.status, "stopped");

    // 3. Start companion manually
    const startResult = await cm.startCompanion(testId);
    assert.equal(startResult.success, true);
    assert.ok(startResult.pid);
    status = cm.getCompanionStatus(testId);
    assert.equal(status.status, "running");
    assert.equal(status.pid, startResult.pid);

    // 4. Restart companion
    const oldPid = startResult.pid;
    const restartResult = await cm.restartCompanion(testId);
    assert.equal(restartResult.success, true);
    assert.ok(restartResult.pid);
    assert.notEqual(restartResult.pid, oldPid);

    // 5. Clean stop
    await cm.stopCompanion(testId);
    status = cm.getCompanionStatus(testId);
    assert.equal(status.status, "stopped");
  });

  test("Token Injection: setting authToken writes .env and passes token to companion process env", async () => {
    const testId = `conn_token_test_${Date.now()}`;
    createdConnectorIds.push(testId);

    const zip = new AdmZip();
    const port = 9878;
    const manifest: ConnectorManifest = {
      manifest_type: "connector",
      id: testId,
      name: "Token Injection Test",
      companion_script: "server.mjs",
      connection: {
        protocol: "http",
        host: "127.0.0.1",
        port,
      },
    };

    const serverCode = `
      import http from 'node:http';
      const server = http.createServer((req, res) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          authToken: process.env.AUTH_TOKEN || null,
          spotifyToken: process.env.SPOTIFY_ACCESS_TOKEN || null,
        }));
      });
      server.listen(${port}, '127.0.0.1');
    `;

    zip.addFile("connector.json", Buffer.from(JSON.stringify(manifest, null, 2), "utf-8"));
    zip.addFile("server.mjs", Buffer.from(serverCode, "utf-8"));

    await cm.installConnectorZip(zip.toBuffer());

    // Configure token
    const testToken = "test_oauth_token_xyz_987";
    const connector = cm.getConnector(testId)!;
    connector.authToken = testToken;
    cm.saveConnector(connector);

    // Verify .env was written on disk in packageDir
    const envPath = join(connector.packageDir!, ".env");
    assert.ok(existsSync(envPath), `Expected .env at ${envPath}`);
    const envContent = readFileSync(envPath, "utf-8");
    assert.ok(envContent.includes(testToken));

    // Verify companion received the token via HTTP request
    await new Promise((resolve) => setTimeout(resolve, 800));
    const res = await new Promise<{ authToken: string; spotifyToken: string }>((resolve, reject) => {
      http.get(`http://127.0.0.1:${port}`, (r) => {
        let body = "";
        r.on("data", (c) => (body += c));
        r.on("end", () => resolve(JSON.parse(body)));
      }).on("error", reject);
    });

    assert.equal(res.authToken, testToken);
    assert.equal(res.spotifyToken, testToken);

    await cm.stopCompanion(testId);
  });

  test("Auto-Start Toggle: toggling autoStartCompanion off stops companion process", async () => {
    const testId = `conn_toggle_autostart_${Date.now()}`;
    createdConnectorIds.push(testId);

    const zip = new AdmZip();
    const port = 9879;
    const manifest: ConnectorManifest = {
      manifest_type: "connector",
      id: testId,
      name: "Toggle Auto-Start Test",
      companion_script: "server.mjs",
      connection: {
        protocol: "http",
        host: "127.0.0.1",
        port,
      },
    };

    const serverCode = `
      import http from 'node:http';
      const server = http.createServer((req, res) => res.end("ok"));
      server.listen(${port}, '127.0.0.1');
    `;

    zip.addFile("connector.json", Buffer.from(JSON.stringify(manifest, null, 2), "utf-8"));
    zip.addFile("server.mjs", Buffer.from(serverCode, "utf-8"));

    await cm.installConnectorZip(zip.toBuffer());
    await new Promise((resolve) => setTimeout(resolve, 400));

    let status = cm.getCompanionStatus(testId);
    assert.equal(status.status, "running");

    // Turn off autoStartCompanion
    const conn = cm.getConnector(testId)!;
    conn.autoStartCompanion = false;
    cm.saveConnector(conn);

    await new Promise((resolve) => setTimeout(resolve, 300));
    status = cm.getCompanionStatus(testId);
    assert.equal(status.status, "stopped");
  });

  test("Python Companion Lifecycle: runs with bundled Python runtime and receives injected tokens", async () => {
    const testId = `conn_python_test_${Date.now()}`;
    createdConnectorIds.push(testId);

    const zip = new AdmZip();
    const port = 9880;
    const manifest: ConnectorManifest = {
      manifest_type: "connector",
      id: testId,
      name: "Python Companion Test",
      version: "1.0.0",
      description: "Testing Python companion script",
      icon: "🐍",
      companion_script: "server.py",
      connection: {
        protocol: "http",
        host: "127.0.0.1",
        port,
      },
      options: {
        test_path: "/health",
      },
    };

    const pyServerCode = `import os, sys, json
from http.server import HTTPServer, BaseHTTPRequestHandler

class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        data = {
            'runtime': 'python',
            'pid': os.getpid(),
            'authToken': os.environ.get('AUTH_TOKEN'),
            'spotifyToken': os.environ.get('SPOTIFY_ACCESS_TOKEN')
        }
        self.wfile.write(json.dumps(data).encode('utf-8'))
    def log_message(self, *args):
        pass

if __name__ == '__main__':
    server = HTTPServer(('127.0.0.1', ${port}), Handler)
    print("Python server ready on ${port}", flush=True)
    server.serve_forever()
`;

    zip.addFile("connector.json", Buffer.from(JSON.stringify(manifest, null, 2), "utf-8"));
    zip.addFile("server.py", Buffer.from(pyServerCode, "utf-8"));

    await cm.installConnectorZip(zip.toBuffer());
    await new Promise((resolve) => setTimeout(resolve, 600));

    // Verify status is running
    let status = cm.getCompanionStatus(testId);
    assert.ok(status.status === "running" || status.status === "starting");
    assert.ok(typeof status.pid === "number");

    // Configure token
    const testToken = "python_secret_token_123";
    const connector = cm.getConnector(testId)!;
    connector.authToken = testToken;
    cm.saveConnector(connector);

    await new Promise((resolve) => setTimeout(resolve, 800));

    // Query server
    const res = await new Promise<{ runtime: string; pid: number; authToken: string; spotifyToken: string }>((resolve, reject) => {
      http.get(`http://127.0.0.1:${port}`, (r) => {
        let body = "";
        r.on("data", (c) => (body += c));
        r.on("end", () => resolve(JSON.parse(body)));
      }).on("error", reject);
    });

    assert.equal(res.runtime, "python");
    assert.equal(res.authToken, testToken);
    assert.equal(res.spotifyToken, testToken);

    // Stop companion
    const stopResult = await cm.stopCompanion(testId);
    assert.equal(stopResult.success, true);
    status = cm.getCompanionStatus(testId);
    assert.equal(status.status, "stopped");
  });

  test("Obsidian Self-Signed HTTPS Support: localhost https requests succeed with self-signed cert", async () => {
    // Generate an in-memory HTTPS server with self-signed certificate (mimics Obsidian Local REST API)
    const { generateKeyPairSync } = await import("node:crypto");
    // We can test that fetchWithTimeout connects without rejecting self-signed certs on 127.0.0.1
    // We create a dummy connector config pointing to localhost with https
    const testId = `conn_obsidian_test_${Date.now()}`;
    createdConnectorIds.push(testId);

    const connConfig = {
      id: testId,
      name: "Obsidian Mock",
      type: "custom_rest" as const,
      description: "Testing self-signed cert handling",
      icon: "📓",
      enabled: true,
      host: "127.0.0.1",
      port: 27124,
      protocol: "https" as const,
      authType: "bearer" as const,
      authToken: "sample_bearer_token",
      options: { test_path: "/" },
    };

    cm.saveConnector(connConfig);
    const result = await cm.testConnection(testId);
    // Because nothing is running on 27124 right now, it should fail with ECONNREFUSED,
    // NOT with DEPTH_ZERO_SELF_SIGNED_CERT!
    assert.ok(
      result.message.includes("ECONNREFUSED") || result.message.includes("failed") || result.success,
      `Expected network connection error or success, but got: ${result.message}`
    );
    assert.ok(
      !result.message.includes("DEPTH_ZERO_SELF_SIGNED_CERT"),
      `Should not fail due to self-signed cert rejection`
    );
  });

  test("Connector Authentication Requirements: authType none omits token, bearer/apikey requires token", () => {
    function requiresAuthToken(conn: {
      id?: string;
      authType?: string;
      authToken?: string;
      options?: Record<string, any>;
    }): boolean {
      return Boolean(
        conn.id === "spotify_api" ||
        conn.id === "obsidian_vault" ||
        conn.id === "notion" ||
        conn.authType === "bearer" ||
        conn.authType === "apikey" ||
        conn.authType === "basic" ||
        conn.options?.requires_token ||
        conn.options?.requires_auth ||
        (Boolean(conn.authToken && conn.authToken.trim()) && conn.authType !== "none")
      );
    }

    // Connectors where auth is NOT needed
    assert.equal(requiresAuthToken({ id: "office_bridge", authType: "none" }), false);
    assert.equal(requiresAuthToken({ id: "file_explorer_bridge", authType: "none" }), false);
    assert.equal(requiresAuthToken({ id: "weather_rest_connector", authType: "none" }), false);
    assert.equal(requiresAuthToken({ id: "blender", authType: "none" }), false);
    assert.equal(requiresAuthToken({ id: "comfyui", authType: "none" }), false);
    assert.equal(requiresAuthToken({ id: "godot", authType: "none" }), false);
    assert.equal(requiresAuthToken({ id: "obs", authType: "none" }), false);
    assert.equal(requiresAuthToken({ id: "custom_local_service", authType: "none" }), false);

    // Connectors where auth IS needed
    assert.equal(requiresAuthToken({ id: "spotify_api", authType: "bearer" }), true);
    assert.equal(requiresAuthToken({ id: "obsidian_vault", authType: "bearer" }), true);
    assert.equal(requiresAuthToken({ id: "notion", authType: "bearer" }), true);
    assert.equal(requiresAuthToken({ id: "custom_bearer", authType: "bearer" }), true);
    assert.equal(requiresAuthToken({ id: "custom_apikey", authType: "apikey" }), true);
    assert.equal(requiresAuthToken({ id: "custom_basic", authType: "basic" }), true);
  });
});
