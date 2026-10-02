---
description: Critical filesystem path resolution and UI rendering invariants for the AI Plate Electron runtime.
always_on: true
---

# AI Plate Electron Runtime Invariants

## 1. Multi-Root Workspace Path Resolution
- **Invariant**: When AI Plate runs under Electron, `process.cwd()` points to `userData` (`%APPDATA%\AI Plate`).
- **Guideline**: Never assume `process.cwd()` contains the project/workspace files (e.g. `scratch/`, `tests/`, `README.md`).
- **Implementation**: Always resolve workspace paths using `resolveWorkspacePath()` from `core/config.ts`, which checks:
  1. Absolute paths
  2. `process.cwd()`
  3. `process.env.AIPLATE_APP_ROOT` (the launch/project directory)
  4. `process.env.AIPLATE_USERDATA`
  5. Subdirectories (`scratch/`, `artifacts/`, `.sandbox/`, `docs/`)

## 2. Chat Window Artifact Delivery
- **Invariant**: An artifact must NEVER pop up in chat due to general English words (e.g. "graph", "plot", "chart", "timeline").
- **Guideline**: In-chat artifact rendering must use strict boundary matching (`isArtifactSpecificallyMentioned`):
  - Requires the complete filename with extension (`\bfilename\.ext\b`).
  - Recognizes code backticks, markdown links, and `artifacts/` path prefixes.
  - Recognizes sentence-ending punctuation (`.,;:!?`).
- **Explicit Listing**: User requests like "list all artifacts" or "show deliverables" must render the compact `renderInChatArtifactsListing()` table card rather than individual full-sized cards.
