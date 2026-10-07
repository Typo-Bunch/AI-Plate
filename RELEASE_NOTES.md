#   <img src="https://raw.githubusercontent.com/Typo-Bunch/AI-Plate/main/ui/assets/logo.png" alt="AI Plate Logo" width="180" /> AI Plate v1.0.2 — Patch Release

We are pleased to announce **AI Plate v1.0.2**, focusing on modular plugin portability, real-time Material Symbols customization, process lifecycle reliability, and comprehensive test suite stabilization.

---

### 🌟 What's New & Fixed in v1.0.2

- 📦 **Custom Plugin .zip Export & Distribution**:
  - Export any installed or custom plugin directly from its card in the Plugins section as a portable `.zip` package.
  - Automatically bundles all tool schemas, parameters, code handlers, and UI extensions with a standardized root `plugin.json` manifest.
  - Exported archives are 100% plug-and-play and can be installed into any AI Plate instance via drag-and-drop or the Install ZIP button.

- 🎨 **Google Material Symbols Live Customization & Glyphs**:
  - **Live Auto-Apply**: Changing any individual icon glyph, font weight, fill, or size in the plugin settings applies to the UI in real time without having to click "Run / Apply".
  - **Ligature Integrity**: Corrected legacy font ligatures (such as replacing `chat_bubble_outline` with `chat_bubble` and `question_answer` with `chat`) to guarantee clean, ungarbled icon rendering across all platforms.
  - **Expanded Glyph Coverage**: Custom icons now cleanly style reasoning depth indicators (`.thinking-chip`, `.thinking-brain-pulse`), all Settings tabs (General, Skills, Models, Plugins, Connectors, Security, Config), and the Past Chats section header.
  - **State Persistence & Reset**: Restored complete parameter serialization in local storage and added a dedicated "🔄 Reset Default" button that restores default glyphs and synchronizes all open controls immediately.

- 🔌 **Connector Companion Lifecycle & Stability**:
  - Improved process termination on Windows with process-tree cleanup and explicit intentional-stop state tracking, ensuring companion processes report `stopped` cleanly rather than false-positive `crashed`.
  - Bundled modular sample connector packages (`blender`, `file-explorer-bridge`, `obsidian-vault`, `office-bridge`).

- 🛡️ **Subsystem Integrity & 100% Test Coverage**:
  - Automated test suite passes 100% across Plugin Manager Subsystem, Security Governance, Plug-and-Play Connectors, Companion Lifecycle, Intelligent Context Compressor, and Multi-Agent Chat Modes.

---

### 💻 Installation Instructions (Windows)

1. Download **`AI.Plate.Setup.1.0.1.exe`** from the **Assets** section below.
2. Run the installer and follow the setup wizard (creates a Desktop shortcut and Start Menu entry).
3. Launch **AI Plate**:
   - Add your preferred API key (Gemini, OpenRouter, Mistral, Anthropic, OpenAI, etc.) in the Settings tab, or connect to your local Ollama / LM Studio endpoint.
   - Start chatting, analyzing code, or giving autonomous tasks to your sovereign AI assistant!

---

### 📋 System Requirements
- **OS**: Windows 10 / 11 (64-bit)
- **RAM**: 4 GB minimum (8 GB recommended)
- **Disk Space**: ~250 MB for app installation

---

*Open Power to All. Sovereign AI for everyone.*
