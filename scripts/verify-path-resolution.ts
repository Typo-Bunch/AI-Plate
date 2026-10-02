import { resolveWorkspacePath } from "../core/config.js";
import path from "node:path";
import fs from "node:fs";

const appRoot = process.cwd();
const userData = path.join(process.env.APPDATA || "", "AI Plate");

process.env.AIPLATE_APP_ROOT = appRoot;
process.env.AIPLATE_USERDATA = userData;

// Simulate Electron runtime CWD = userData
process.chdir(userData);
console.log("Simulated Electron CWD:", process.cwd());

const testCases = [
  "scratch/test-okf-docs/order-processing-spec.md",
  "order-processing-spec.md",
  "artifacts/newton_raphson_explainer.png",
  "newton_raphson_explainer.png",
  "README.md",
  "payment-retry-runbook.md",
];

let allPassed = true;
for (const tc of testCases) {
  const resolved = resolveWorkspacePath(tc);
  const exists = fs.existsSync(resolved);
  console.log((exists ? "✔ [PASS]" : "❌ [FAIL]") + " " + tc + " => " + resolved);
  if (!exists) allPassed = false;
}

if (!allPassed) {
  process.exit(1);
} else {
  console.log("\nAll path resolution test cases passed!");
}
