# Contributing to AI Plate

Welcome to the **AI Plate** open-source project! We are building a sovereign, cross-platform AI agent harness with multi-provider intelligence, local sandboxed execution, and extensible plug-and-play architecture.

Whether you are fixing a typo, designing a behavioral skill, integrating an external app connector, or architecting a full agent plugin, your contributions are welcome!

---

## 🎯 Contributor Progression Ladder

To make onboarding transparent and accessible, contributions in AI Plate are categorized into three distinct architectural tiers:

```
┌────────────────────────────────────────────────────────────────────────┐
│  🔥 LEVEL 3 — ADVANCED: Plugin Creation (.aiplugin.json + UI + Sandbox) │
├────────────────────────────────────────────────────────────────────────┤
│  ⚡ LEVEL 2 — MID-LEVEL: Connector Creation (connector.json + API/Proc) │
├────────────────────────────────────────────────────────────────────────┤
│  🌱 LEVEL 1 — BEGINNER: Skill Creation (SKILL.md + Workflow Rules)     │
└────────────────────────────────────────────────────────────────────────┘
```

| Level | Contribution Focus | Prerequisites | Scope & Risk |
| :--- | :--- | :--- | :--- |
| **🌱 Level 1: Beginner** | **Skill Creation** (`SKILL.md`) | Markdown, Prompt Engineering | Low barrier, zero runtime risk. Immediate execution within agent reasoning loop. |
| **⚡ Level 2: Mid-Level** | **Connector Creation** (`connector.json`) | JSON Schema, Node/Python scripting, REST/WS | Medium complexity. Local companion process management and API bridging. |
| **🔥 Level 3: Advanced** | **Plugin Creation** (`.aiplugin.json`) | Full-stack JS/TS, Python engine, UI DOM/CSS | High complexity. Deep integration into agent tool loop, security policies, and live UI. |

---

## 🌱 Level 1: Beginner — Skill Creation

**Skills** are specialized instructions and behavioral rules that extend AI Plate's problem-solving capabilities for specific tasks.

### Structure
Each skill lives in a dedicated folder under `.agents/skills/<skill-name>/`:

```
.agents/skills/<skill-name>/
├── SKILL.md          # (Required) YAML frontmatter + detailed markdown instructions
├── scripts/          # (Optional) Helper scripts for the skill
└── references/       # (Optional) Reference templates or documentation
```

### `SKILL.md` Example
```markdown
---
name: code-reviewer
description: Expert code review skill enforcing security, performance, and style standards.
---

# Code Reviewer Skill

## Instructions
1. Always analyze git diffs or file contents before proposing changes.
2. Flag potential security vulnerabilities (SQL injection, XSS, unescaped shell commands).
3. Verify test coverage and error handling paths.
4. Output constructive feedback formatted in GitHub-flavored markdown.
```

### How to Test
1. Add your skill folder to `.agents/skills/<your-skill>/`.
2. Start the dev server: `npm run dev`.
3. Open AI Plate and verify your skill appears and guides the assistant in chat sessions.

---

## ⚡ Level 2: Mid-Level — Connector Creation

**Connectors** bridge AI Plate to external applications, desktop software, or web services via companion processes or MCP endpoints (e.g., Blender, Obsidian, SQLite, Notion).

### Structure
Connectors are packaged as directories or `.zip` archives with a root `connector.json`:

```
connectors/installed/<connector-id>/
├── connector.json       # (Required) Connector manifest declaration
├── companion.py         # (Optional) Companion server script (Python or Node)
├── package.json         # (Optional) Node dependencies for companion
└── README.md            # Documentation and setup instructions
```

### `connector.json` Example
```json
{
  "id": "sqlite_explorer",
  "name": "SQLite Database Explorer",
  "version": "1.0.0",
  "description": "Query and inspect local SQLite databases with automated schema discovery.",
  "category": "database",
  "icon": "storage",
  "authType": "none",
  "companion_script": "companion.py",
  "companion_runtime": "python",
  "autoStartCompanion": true,
  "endpoints": {
    "http": "http://127.0.0.1:8765"
  },
  "tools": [
    {
      "name": "sqlite_run_query",
      "description": "Execute a read-only SELECT SQL query on a database.",
      "parametersJsonSchema": {
        "type": "object",
        "properties": {
          "db_path": { "type": "string", "description": "Absolute path to SQLite file." },
          "query": { "type": "string", "description": "SQL query to run." }
        },
        "required": ["db_path", "query"]
      }
    }
  ]
}
```

### How to Test
1. Place your connector in `connectors/installed/<connector-id>/` or install via the Connectors UI tab.
2. Run automated connector lifecycle tests:
   ```bash
   npm test
   ```
3. Verify companion process starts and stops cleanly via Settings → Connectors.

---

## 🔥 Level 3: Advanced — Plugin Creation

**Plugins** provide complete sovereign tool sets, custom sandboxed execution pipelines, and interactive UI extension panels rendered directly into AI Plate.

### Structure
Plugins live in `plugins/installed/<plugin-id>.aiplugin.json` or can be installed as portable `.zip` archives:

```
plugins/installed/<plugin-id>.aiplugin.json
```

### `.aiplugin.json` Example
```json
{
  "id": "custom_data_studio",
  "name": "Data Studio & Visualizer",
  "version": "1.0.0",
  "author": "Your Name",
  "description": "Generate charts, statistical summaries, and export plots to artifacts.",
  "icon": "analytics",
  "category": "creative",
  "enabled": true,
  "type": "custom",
  "tools": [
    {
      "name": "generate_chart",
      "description": "Generate a plot using python matplotlib and save to artifacts.",
      "ui_controls": true,
      "parametersJsonSchema": {
        "type": "object",
        "properties": {
          "chart_type": { "type": "string", "enum": ["bar", "line", "scatter"], "default": "bar" },
          "title": { "type": "string", "default": "Sample Chart" }
        }
      }
    }
  ],
  "ui_extension": {
    "css": ".custom-chart-badge { color: var(--accent-primary); font-weight: bold; }",
    "actionButtons": [
      { "id": "btn-preview", "label": "Preview Chart", "action": "preview" }
    ]
  }
}
```

### How to Test
1. Run plugin manager unit tests:
   ```bash
   node --import tsx --test "tests/plugin-manager.test.ts"
   ```
2. Verify tool execution, parameter serialization, and export as `.zip` from the Plugins tab in the app.

---

## 🛠️ Local Development Setup

### 1. Prerequisites
- **Node.js**: `v20.x` or higher
- **npm**: `v9.x` or higher
- **Git**

### 2. Setup
```bash
# Clone the repository
git clone https://github.com/Typo-Bunch/AI-Plate.git
cd AI-Plate

# Install dependencies
npm install

# Setup bundled Python runtime (optional, for sandboxed execution)
npm run setup:python

# Compile TypeScript and start Electron app in development mode
npm run dev
```

### 3. Running the Test Suite
All PRs must pass the automated test suite before merging:
```bash
npm test
```

---

## 🌿 Git Branching & Pull Request Guidelines

1. **Fork & Branch**: Create a descriptive branch from `main`:
   - `feat/add-git-workflow-skill`
   - `feat/connector-sqlite-bridge`
   - `fix/plugin-dropdown-sync`
   - `docs/update-contributing`
2. **Keep PRs Focused**: Avoid bundling unrelated changes into a single pull request.
3. **Commit Messages**: Follow standard conventional commits:
   - `feat(skill): add python data science workflow skill`
   - `feat(connector): add sqlite database companion connector`
   - `fix(plugins): preserve active theme during teardown`
4. **All Tests Must Pass**: Ensure `npm test` passes with 0 failures before opening a PR.

---

## 🤝 Code of Conduct & Getting Help

- Be respectful, constructive, and open to feedback.
- If you have questions or want to discuss an idea before building, open an issue labeled `question` or check the repository [Discussions](https://github.com/Typo-Bunch/AI-Plate/discussions).
