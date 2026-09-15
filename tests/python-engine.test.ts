import { test, describe, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { join } from "node:path";
import { PythonEngine } from "../core/python-engine.js";
import { shellPlugin } from "../plugins/tools/shell-plugin.js";
import { PluginManager } from "../core/plugin-manager.js";

describe("Bundled Python Engine & Package Management", () => {
  const python = PythonEngine.getInstance();
  const pm = PluginManager.getInstance();

  after(() => {
    try {
      const sandboxDir = python.sandboxDir;
      if (fs.existsSync(sandboxDir)) {
        const files = fs.readdirSync(sandboxDir);
        for (const f of files) {
          if (f.startsWith("script_") && f.endsWith(".py")) {
            try { fs.unlinkSync(join(sandboxDir, f)); } catch {}
          }
        }
      }
    } catch {}
  });

  test("PythonEngine should discover and resolve the bundled Python runtime", async () => {
    await python.initialize();
    const isAvailable = python.isAvailable;
    assert.equal(isAvailable, true, "Python runtime should be available");

    const executable = python.executable;
    assert.ok(typeof executable === "string" && executable.length > 0, "Executable path must be non-empty");
    assert.ok(fs.existsSync(executable), `Python executable must exist at ${executable}`);
    assert.equal(python.isBundled, true, "Should recognize runtime as bundled");
  });

  test("getEnvironmentInfo should return version, isBundled flag, and package list", async () => {
    const info = await python.getEnvironmentInfo();
    assert.equal(info.isBundled, true);
    assert.ok(info.version.toLowerCase().includes("python 3.11"), `Version should be Python 3.11.x, got ${info.version}`);
    assert.ok(Array.isArray(info.packages), "Packages should be an array");
    
    // Check for pip, setuptools, wheel
    const packageNames = info.packages.map((p) => p.name.toLowerCase());
    assert.ok(packageNames.includes("pip"), "Pip should be installed in bundled runtime");
    assert.ok(packageNames.includes("setuptools"), "Setuptools should be installed");
    assert.ok(packageNames.includes("wheel"), "Wheel should be installed");
  });

  test("runScript should execute sandboxed Python code with isolated runtime", async () => {
    const script = `
import sys
import json

output = {
    "version": f"{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}",
    "platform": sys.platform,
    "status": "bundled_ok"
}
print(json.dumps(output))
`;
    const result = await python.runScript(script);
    assert.equal(result.exitCode, 0, `Script execution failed: ${result.stderr}`);
    
    const parsed = JSON.parse(result.stdout.trim());
    assert.equal(parsed.status, "bundled_ok");
    assert.ok(parsed.version.startsWith("3.11"));
  });

  test("ShellPlugin tools: check_python_environment should return runtime info", async () => {
    pm.registerPlugin(shellPlugin);

    const result = await pm.executeTool("check_python_environment", {});
    const content = typeof result === "string" ? result : JSON.stringify(result);
    assert.ok(content.includes("true") || content.includes("Yes") || content.includes("Python 3.11"), "Should report bundled python status");
    assert.ok(content.includes("pip"), "Should list pip");
  });

  test("ShellPlugin tools: install_python_package should install or verify packages", async () => {
    pm.registerPlugin(shellPlugin);

    // Verify install_python_package with 'six' (lightweight package, fast verification)
    const result = await pm.executeTool("install_python_package", { packages: ["six"] });
    const content = typeof result === "string" ? result : JSON.stringify(result);
    assert.ok(content.includes("Successfully installed") || content.includes("six") || content.includes("already satisfied") || content.includes("Installed packages"));
  });
});
