import { test } from "node:test";
import assert from "node:assert/strict";
import { isChatMode, isToolAllowedInMode } from "../core/chat-mode.js";

test("read-only modes reject execution, writes, and unknown connector tools", () => {
  for (const mode of ["normal", "plan"] as const) {
    for (const tool of ["execute_command", "run_sandboxed_script", "save_artifact", "delete_artifact", "clean_sandbox", "ingest_document", "install_python_package", "connector_read_and_write"]) {
      assert.equal(isToolAllowedInMode(mode, tool), false, `${mode}: ${tool}`);
      assert.equal(isToolAllowedInMode("code", tool), true);
    }
    assert.equal(isToolAllowedInMode(mode, "web_search"), true);
  }
  assert.equal(isToolAllowedInMode("plan", "read_file"), true);
  assert.equal(isToolAllowedInMode("normal", "read_file"), false);
  for (const mode of [undefined, null, "", "admin", {}, "CODE"]) assert.equal(isChatMode(mode), false);
});
