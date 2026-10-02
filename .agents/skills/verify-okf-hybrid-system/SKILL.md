---
name: verify-okf-hybrid-system
description: Manual and automated verification procedures for the OKF Deterministic Graph + Vector RAG hybrid knowledge system in AI Plate.
---

# Verifying the OKF Hybrid Knowledge System

This skill explains how to verify the Open Knowledge Format (OKF) and Vector RAG subsystems in AI Plate.

## Method 1: AI Plate Chat Window (End-to-End UI Verification)

1. **Verify Canonical OKF Node Ingestion**:
   - Ask AI Plate:
     > *"Please ingest the file scratch/test-okf-docs/order-processing-spec.md into our OKF knowledge graph using ingest_okf_document."*
   - Verify tool response indicates node `order-processing-spec` was created with authority `canonical`.

2. **Verify Authoritative Tier 1 Retrieval**:
   - Ask AI Plate:
     > *"What is the maximum retry limit and exponential backoff rule for payment gateway failures?"*
   - Expected Result: AI Plate answers using `payment-retry-runbook` with `[VERIFIED KNOWLEDGE: OKF CANONICAL GRAPH]` priority context (3 retries, 2.0x backoff).

3. **Verify Supplementary Tier 2 Vector RAG**:
   - Ask AI Plate:
     > *"What was the root cause of the incident on server cluster alpha at 03:14 AM?"*
   - Expected Result: AI Plate queries Vector Store chunks and answers citing `incident_alpha_crash.txt` under `[SUPPLEMENTARY CONTEXT: VECTOR RAG]`.

4. **Verify No Random Artifact Popups**:
   - Ask AI Plate:
     > *"Explain the dependency graph of our checkout modules."*
   - Expected Result: Conversational explanation without any random images or past chart artifacts popping up.

## Method 2: Direct CLI Script Verification

Run the automated verification test runners from the project root:
```bash
# Verify OKF Store & Router API endpoints:
npx tsx scripts/test-okf-endpoints.ts

# Verify End-to-End Ingestion, Traversal & Prompt Hierarchy:
npx tsx scripts/test-okf-file-ingestion.ts

# Verify Multi-Root Path Resolution under simulated Electron CWD:
npx tsx scripts/verify-path-resolution.ts

# Verify In-Chat Artifact Listing & Popup Prevention across 7 scenarios:
npx tsx scripts/test-artifacts-inchat-scenarios.ts
```

## Method 3: Direct SQLite Database Inspection

Verify the persistent tables in both databases (`agent_data.db` and `%APPDATA%\AI Plate\agent_data.db`):
```bash
node -e "
const Database = require('better-sqlite3');
const path = require('path');

for (const [name, p] of [
  ['Workspace DB', 'agent_data.db'],
  ['AppData DB', path.join(process.env.APPDATA, 'AI Plate', 'agent_data.db')]
]) {
  console.log('\n=== ' + name + ' ===');
  const db = new Database(p);
  console.log('Nodes:', db.prepare('SELECT id, title, authority, domain FROM okf_nodes').all());
  console.log('Links:', db.prepare('SELECT source_id, target_id, relation FROM okf_links').all());
}
"
```
