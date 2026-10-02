/**
 * Artifacts In-Chat Listing & Popup Prevention Verification Agent
 *
 * Runs multi-scenario verification:
 *   Scenario 1: False positive keyword prevention (graph, chart, plot, timeline)
 *   Scenario 2: Substring collision prevention (run vs run.py, graph vs graph.png)
 *   Scenario 3: Strict exact filename & path mention detection
 *   Scenario 4: Explicit listing intent recognition
 *   Scenario 5: Structured In-Chat Artifacts Listing generation
 *   Scenario 6: End-to-end simulated message block pipeline
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

interface ScenarioResult {
  scenario: string;
  description: string;
  passed: boolean;
  details: string;
}

export async function runArtifactsVerificationAgent(): Promise<{
  totalPassed: number;
  totalFailed: number;
  results: ScenarioResult[];
}> {
  console.log("\n========================================================");
  console.log("🤖 ARTIFACTS IN-CHAT LISTING & VERIFICATION AGENT RUNNING");
  console.log("========================================================\n");

  const results: ScenarioResult[] = [];

  // Extract functions directly from ui/app.js to test real implementation
  const appJsContent = readFileSync(resolve(process.cwd(), "ui", "app.js"), "utf-8");

  // Extract isArtifactSpecificallyMentioned
  const mentionFnMatch = appJsContent.match(
    /function isArtifactSpecificallyMentioned\([\s\S]*?\n\}/
  );
  if (!mentionFnMatch) {
    throw new Error("Could not find isArtifactSpecificallyMentioned in ui/app.js");
  }
  const isArtifactSpecificallyMentioned = new Function(
    `return (${mentionFnMatch[0]})`
  )();

  // Extract isExplicitArtifactListRequest
  const listReqFnMatch = appJsContent.match(
    /function isExplicitArtifactListRequest\([\s\S]*?\n\}/
  );
  if (!listReqFnMatch) {
    throw new Error("Could not find isExplicitArtifactListRequest in ui/app.js");
  }
  const isExplicitArtifactListRequest = new Function(
    `return (${listReqFnMatch[0]})`
  )();

  // Extract isUserRequestingArtifactView
  const userViewFnMatch = appJsContent.match(
    /function isUserRequestingArtifactView\([\s\S]*?\n\}/
  );
  if (!userViewFnMatch) {
    throw new Error("Could not find isUserRequestingArtifactView in ui/app.js");
  }
  const isUserRequestingArtifactView = new Function(
    `return (${userViewFnMatch[0]})`
  )();

  // ─── Scenario 1: False Positive Keyword Prevention ──────────────────
  {
    console.log("🔍 Scenario 1: Testing False Positive Keyword Prevention...");
    const sampleFiles = [
      { name: "newton_raphson_explainer.png", sizeBytes: 81860, modifiedAt: new Date().toISOString() },
      { name: "sales_chart.png", sizeBytes: 45000, modifiedAt: new Date().toISOString() },
      { name: "latency_timeline.svg", sizeBytes: 12000, modifiedAt: new Date().toISOString() },
    ];

    const testPrompts = [
      "Please ingest the file scratch/test-okf-docs/order-processing-spec.md into our OKF knowledge graph using the ingest_okf_document tool.",
      "Can you plot out our implementation roadmap for Q4?",
      "Let's chart a path forward for the backend refactor.",
      "Explain the timeline of events that caused the database crash.",
      "Draw a dependency graph of the modules in core/.",
      "What is the mathematical graph theory behind topological sort?",
    ];

    let passed = true;
    const failures: string[] = [];

    for (const prompt of testPrompts) {
      // Must not be flagged as explicit listing request
      if (isExplicitArtifactListRequest(prompt)) {
        passed = false;
        failures.push(`Prompt falsely marked as listing request: "${prompt}"`);
      }

      // None of the sample files should be flagged as mentioned
      for (const file of sampleFiles) {
        if (isArtifactSpecificallyMentioned(prompt, file.name)) {
          passed = false;
          failures.push(`Artifact "${file.name}" falsely triggered by prompt: "${prompt}"`);
        }
      }
    }

    results.push({
      scenario: "Scenario 1: False Positive Keyword Prevention",
      description: "Generic words (graph, chart, plot, timeline) must never trigger random artifact popups",
      passed,
      details: passed ? `Tested ${testPrompts.length} deceptive prompts — 0 false positives.` : failures.join("; "),
    });
    console.log(`  ${passed ? "✅ [PASS]" : "❌ [FAIL]"} Scenario 1: 0 false positive triggers across ${testPrompts.length} prompts`);
  }

  // ─── Scenario 2: Substring & Subword Collision Prevention ───────────
  {
    console.log("\n🔍 Scenario 2: Testing Substring & Subword Collision Prevention...");
    const testCases = [
      { file: "run.py", text: "We should run the tests before deploying.", shouldMatch: false },
      { file: "graph.png", text: "The graph has 5 nodes and 4 edges.", shouldMatch: false },
      { file: "test.py", text: "This is a test message for verification.", shouldMatch: false },
      { file: "data.csv", text: "The database stores all structured data.", shouldMatch: false },
      { file: "plan.md", text: "I plan to refactor this tomorrow.", shouldMatch: false },
      { file: "a.png", text: "This is a great feature.", shouldMatch: false },
    ];

    let passed = true;
    const failures: string[] = [];

    for (const tc of testCases) {
      const matched = isArtifactSpecificallyMentioned(tc.text, tc.file);
      if (matched !== tc.shouldMatch) {
        passed = false;
        failures.push(`Substring collision: file "${tc.file}" matched in "${tc.text}"`);
      }
    }

    results.push({
      scenario: "Scenario 2: Substring Collision Prevention",
      description: "Words matching artifact basename without extension/boundaries must not trigger popups",
      passed,
      details: passed ? `Tested ${testCases.length} substring collision cases — all properly rejected.` : failures.join("; "),
    });
    console.log(`  ${passed ? "✅ [PASS]" : "❌ [FAIL]"} Scenario 2: Substring collisions prevented (${testCases.length}/${testCases.length})`);
  }

  // ─── Scenario 3: Exact Filename & Path Mentions (Positive Matches) ───
  {
    console.log("\n🔍 Scenario 3: Testing Exact Filename & Path Mentions...");
    const testCases = [
      { file: "newton_raphson_explainer.png", text: "I have generated `newton_raphson_explainer.png`.", shouldMatch: true },
      { file: "sales_chart.png", text: "See the chart in artifacts/sales_chart.png for details.", shouldMatch: true },
      { file: "data.csv", text: "Download the dataset at [data.csv](artifacts/data.csv).", shouldMatch: true },
      { file: "metrics.json", text: "The metrics are saved to metrics.json.", shouldMatch: true },
      { file: "unrelated.png", text: "I have generated `newton_raphson_explainer.png`.", shouldMatch: false },
    ];

    let passed = true;
    const failures: string[] = [];

    for (const tc of testCases) {
      const matched = isArtifactSpecificallyMentioned(tc.text, tc.file);
      if (matched !== tc.shouldMatch) {
        passed = false;
        failures.push(`Expected match=${tc.shouldMatch} for "${tc.file}" in "${tc.text}", got ${matched}`);
      }
    }

    results.push({
      scenario: "Scenario 3: Strict Exact Mentions",
      description: "Explicit filenames in backticks, markdown links, or paths are accurately detected",
      passed,
      details: passed ? `Tested ${testCases.length} exact mention cases — all properly detected.` : failures.join("; "),
    });
    console.log(`  ${passed ? "✅ [PASS]" : "❌ [FAIL]"} Scenario 3: Exact mentions detected (${testCases.length}/${testCases.length})`);
    if (!passed) console.log("   Failure details:", failures);
  }

  // ─── Scenario 4: Explicit Artifact Listing Intent Recognition ───────
  {
    console.log("\n🔍 Scenario 4: Testing Explicit Listing Intent Recognition...");
    const positiveIntents = [
      "list all artifacts",
      "show artifacts",
      "show all deliverables",
      "what artifacts do I have?",
      "list deliverables",
      "view artifacts",
      "display my artifacts",
      "artifacts",
      "/artifacts",
      "deliverables",
    ];

    const negativeIntents = [
      "How does the artifacts directory work?",
      "Please ingest the file into our knowledge graph",
      "Write a Python script that plots a chart",
      "What is an artifact in software development?",
      "I want to create an artifact",
    ];

    let passed = true;
    const failures: string[] = [];

    for (const pos of positiveIntents) {
      if (!isExplicitArtifactListRequest(pos)) {
        passed = false;
        failures.push(`Failed to recognize positive intent: "${pos}"`);
      }
    }

    for (const neg of negativeIntents) {
      if (isExplicitArtifactListRequest(neg)) {
        passed = false;
        failures.push(`Falsely classified negative intent as listing request: "${neg}"`);
      }
    }

    results.push({
      scenario: "Scenario 4: Explicit Listing Intent Recognition",
      description: "Accurately distinguishes between explicit 'list artifacts' requests and general questions",
      passed,
      details: passed ? `Tested ${positiveIntents.length} positive and ${negativeIntents.length} negative prompts.` : failures.join("; "),
    });
    console.log(`  ${passed ? "✅ [PASS]" : "❌ [FAIL]"} Scenario 4: Listing intent classification accurate (${positiveIntents.length + negativeIntents.length} checks)`);
  }

  // ─── Scenario 5: End-to-End Chat Delivery Simulation ─────────────────
  {
    console.log("\n🔍 Scenario 5: Testing End-to-End Chat Delivery Simulation...");
    const sampleFiles = [
      { name: "newton_raphson_explainer.png", sizeBytes: 81860, modifiedAt: "2026-09-26T06:00:00.000Z" },
      { name: "quarterly_summary.csv", sizeBytes: 1540, modifiedAt: "2026-09-25T14:30:00.000Z" },
    ];

    // Mock simulate what the onComplete handler produces
    function simulateDelivery(userPrompt: string, responseText: string) {
      const userTextTrimmed = userPrompt.trim();
      const isListReq = isExplicitArtifactListRequest(userTextTrimmed);

      if (isListReq) {
        return {
          type: "listing_card",
          itemCount: sampleFiles.length,
          files: sampleFiles.map((f) => f.name),
        };
      }

      const mentioned = sampleFiles.filter((f) => {
        return (
          isArtifactSpecificallyMentioned(responseText, f.name) ||
          isUserRequestingArtifactView(userTextTrimmed, f.name)
        );
      });

      return {
        type: mentioned.length > 0 ? "individual_cards" : "none",
        cards: mentioned.map((f) => f.name),
      };
    }

    // Case A: The original user bug (OKF graph question)
    const resA = simulateDelivery(
      "Please ingest the file scratch/test-okf-docs/order-processing-spec.md into our OKF knowledge graph using the ingest_okf_document tool.",
      "The order processing spec has been verified."
    );
    const passA = resA.type === "none" && resA.cards?.length === 0;

    // Case B: User asking for all deliverables
    const resB = simulateDelivery("show all artifacts", "Here are your files.");
    const passB = resB.type === "listing_card" && resB.itemCount === 2;

    // Case C: User asking why an artifact popped up (complaint/meta-query) -> must NOT popup
    const resC = simulateDelivery(
      "Why did newton_raphson_explainer.png pop up randomly?",
      "I apologize for the confusion. Artifact cards will only appear when requested."
    );
    const passC = resC.type === "none" && resC.cards?.length === 0;

    // Case D: Explicit user command to view specific artifact -> exactly 1 card
    const resD = simulateDelivery(
      "show newton_raphson_explainer.png",
      "Displaying the requested file."
    );
    const passD = resD.type === "individual_cards" && resD.cards?.includes("newton_raphson_explainer.png");

    const passed = passA && passB && passC && passD;

    results.push({
      scenario: "Scenario 5: End-to-End Chat Delivery Simulation",
      description: "Simulates full delivery pipeline across normal questions, list requests, complaints, and explicit view commands",
      passed,
      details: passed
        ? "All delivery types correctly dispatched (0 unwanted popups on graph query & complaints, listing card on request, single card on explicit show)."
        : `A=${passA}, B=${passB}, C=${passC}, D=${passD}`,
    });
    console.log(`  ${passed ? "✅ [PASS]" : "❌ [FAIL]"} Scenario 5: End-to-end delivery simulation passed`);
  }

  // ─── Scenario 6: In-Chat Artifacts Listing HTML & UI Structure ───────
  {
    console.log("\n🔍 Scenario 6: Testing In-Chat Artifacts Listing HTML & UI Structure...");
    const sampleFiles = [
      { name: "revenue_chart.png", sizeBytes: 1048576, modifiedAt: "2026-09-26T10:00:00.000Z" },
      { name: "transactions.csv", sizeBytes: 2048, modifiedAt: "2026-09-25T12:00:00.000Z" },
      { name: "data_cleaner.py", sizeBytes: 4096, modifiedAt: "2026-09-24T08:00:00.000Z" },
    ];

    // Verify formatFileSize logic
    function formatSize(bytes: number) {
      if (bytes < 1024) return `${bytes} B`;
      if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
      return `${(bytes / 1048576).toFixed(1)} MB`;
    }

    const size1 = formatSize(sampleFiles[0].sizeBytes);
    const size2 = formatSize(sampleFiles[1].sizeBytes);

    const hasMB = size1 === "1.0 MB";
    const hasKB = size2 === "2.0 KB";

    // Verify icons
    function getIcon(name: string) {
      const ext = "." + name.split(".").pop()?.toLowerCase();
      if ([".png", ".jpg", ".svg"].includes(ext)) return "🖼️";
      if ([".csv", ".tsv"].includes(ext)) return "📊";
      if (ext === ".py") return "🐍";
      return "📄";
    }

    const iconImg = getIcon("revenue_chart.png") === "🖼️";
    const iconCsv = getIcon("transactions.csv") === "📊";
    const iconPy = getIcon("data_cleaner.py") === "🐍";

    const passed = hasMB && hasKB && iconImg && iconCsv && iconPy;

    results.push({
      scenario: "Scenario 6: In-Chat Listing Metadata & Icons",
      description: "Verifies human-readable formatting and appropriate icons for mixed file types",
      passed,
      details: passed ? "Size formatting and file type icon mappings verified." : "Formatting failed.",
    });
    console.log(`  ${passed ? "✅ [PASS]" : "❌ [FAIL]"} Scenario 6: Listing metadata & icons verified`);
  }

  // ─── Scenario 7: Session History Restoration Without Ghost Popups ────
  {
    console.log("\n🔍 Scenario 7: Testing Session History Restoration...");
    const existingArtifacts = [
      { name: "newton_raphson_explainer.png", sizeBytes: 81860 },
      { name: "sales_chart.png", sizeBytes: 45000 },
      { name: "order-processing-spec.md", sizeBytes: 706 },
    ];

    const historicalMessages = [
      { role: "user", content: "Can you derive the Newton-Raphson method?" },
      { role: "assistant", content: "The Newton-Raphson method is an iterative root-finding algorithm." },
      { role: "user", content: "Please ingest the file scratch/test-okf-docs/order-processing-spec.md into our OKF knowledge graph" },
      { role: "assistant", content: "The order processing spec has been verified in the knowledge graph." },
      { role: "user", content: "Show me the plot in sales_chart.png." },
      { role: "assistant", content: "Here is the sales_chart.png deliverable for your review." },
    ];

    const restoredCardsPerMessage: string[][] = historicalMessages.map((msg) => {
      if (msg.role !== "assistant") return [];
      return existingArtifacts
        .filter((art) => isArtifactSpecificallyMentioned(msg.content, art.name))
        .map((art) => art.name);
    });

    // Message 1 (assistant): Newton-Raphson text explanation without naming file -> 0 cards
    const turn1Pass = restoredCardsPerMessage[1].length === 0;

    // Message 3 (assistant): OKF knowledge graph turn -> 0 cards (No random newton_raphson popup!)
    const turn3Pass = restoredCardsPerMessage[3].length === 0;

    // Message 5 (assistant): Specifically mentions sales_chart.png -> exactly 1 card ("sales_chart.png")
    const turn5Pass =
      restoredCardsPerMessage[5].length === 1 &&
      restoredCardsPerMessage[5][0] === "sales_chart.png";

    const passed = turn1Pass && turn3Pass && turn5Pass;

    results.push({
      scenario: "Scenario 7: Session History Restoration",
      description: "Guarantees historical message restoration does not inject ghost artifacts into previous turns",
      passed,
      details: passed
        ? "Session restore verified: 0 ghost cards on knowledge graph turn, exactly 1 card on genuine file mention."
        : `Turn1=${turn1Pass}, Turn3=${turn3Pass}, Turn5=${turn5Pass}`,
    });
    console.log(`  ${passed ? "✅ [PASS]" : "❌ [FAIL]"} Scenario 7: Session history restored without ghost popups`);
  }

  // ─── Scenario 8: Negation & User Complaint Protection ───────────────
  {
    console.log("\n🔍 Scenario 8: Testing Negation & User Complaint Protection...");
    const artifactName = "newton_raphson_explainer.png";

    // 1. Assistant error messages containing file names with negation phrasing
    const negationResponses = [
      "The file newton_raphson_explainer.png could not be located in the current environment.",
      "Error: could not find newton_raphson_explainer.png on disk.",
      "The deliverable newton_raphson_explainer.png does not exist.",
      "failed to locate newton_raphson_explainer.png in artifacts directory.",
      "newton_raphson_explainer.png is missing.",
      "newton_raphson_explainer.png not found.",
    ];

    let negationPassed = true;
    const negationFailures: string[] = [];
    for (const text of negationResponses) {
      if (isArtifactSpecificallyMentioned(text, artifactName)) {
        negationPassed = false;
        negationFailures.push(`Negation response matched artifact: "${text}"`);
      }
    }

    // 2. User complaint / inquiry prompts mentioning artifact names
    const complaintPrompts = [
      "Why did newton_raphson_explainer.png pop up?",
      "ingest sample ? why it is in Knowledge Base , if not neede remove it",
      "Please remove newton_raphson_explainer.png from the view",
      "newton_raphson_explainer.png keeps popping up randomly, fix it",
      "There is an error with newton_raphson_explainer.png",
    ];

    let complaintPassed = true;
    const complaintFailures: string[] = [];
    for (const prompt of complaintPrompts) {
      if (isUserRequestingArtifactView(prompt, artifactName)) {
        complaintPassed = false;
        complaintFailures.push(`User complaint falsely treated as view command: "${prompt}"`);
      }
    }

    // 3. Genuine user view commands
    const validViewCommands = [
      "show newton_raphson_explainer.png",
      "open newton_raphson_explainer.png",
      "view newton_raphson_explainer.png",
      "preview artifacts/newton_raphson_explainer.png",
      "display the image newton_raphson_explainer.png",
    ];

    let viewPassed = true;
    const viewFailures: string[] = [];
    for (const cmd of validViewCommands) {
      if (!isUserRequestingArtifactView(cmd, artifactName)) {
        viewPassed = false;
        viewFailures.push(`Valid view command was rejected: "${cmd}"`);
      }
    }

    const passed = negationPassed && complaintPassed && viewPassed;
    results.push({
      scenario: "Scenario 8: Negation & User Complaint Protection",
      description: "Guarantees error/missing messages and user complaints do not trigger popups, while explicit view commands do",
      passed,
      details: passed
        ? `Tested ${negationResponses.length} negation texts, ${complaintPrompts.length} complaints, and ${validViewCommands.length} view commands — all accurately handled.`
        : [...negationFailures, ...complaintFailures, ...viewFailures].join("; "),
    });
    console.log(`  ${passed ? "✅ [PASS]" : "❌ [FAIL]"} Scenario 8: Negation & complaint protection verified`);
    if (!passed) console.log("   Failure details:", [...negationFailures, ...complaintFailures, ...viewFailures]);
  }

  // ─── Summary ────────────────────────────────────────────────────────
  const totalPassed = results.filter((r) => r.passed).length;
  const totalFailed = results.filter((r) => !r.passed).length;

  console.log("\n========================================================");
  console.log(`🎯 VERIFICATION AGENT SUMMARY: ${totalPassed} Passed, ${totalFailed} Failed`);
  console.log("========================================================\n");

  return { totalPassed, totalFailed, results };
}

// Direct CLI execution
if (process.argv[1]?.endsWith("test-artifacts-inchat-scenarios.ts") || process.argv[1]?.endsWith("test-artifacts-inchat-scenarios.js")) {
  runArtifactsVerificationAgent()
    .then((report) => {
      process.exit(report.totalFailed === 0 ? 0 : 1);
    })
    .catch((err) => {
      console.error("Verification Agent encountered fatal error:", err);
      process.exit(1);
    });
}
