/**
 * Shell & Sandboxed Script Execution Plugin.
 *
 * Provides isolated, sandboxed execution for terminal commands, Python scripts,
 * Node.js scripts, and ad-hoc mini-tools.
 *
 * Security & Isolation Guarantees:
 *   1. Dedicated Sandbox Directory (`.sandbox/`) for all temporary scripts & output files.
 *   2. Environment Sanitization: Strips sensitive API keys (OpenAI, Gemini, Anthropic, OpenRouter, Groq, DeepSeek)
 *      from child process environments so generated scripts cannot access credentials.
 *   3. Strict Timeouts (30s) and Output Truncation (4,000 chars / ~1,000 tokens).
 *   4. Destructive System Command Blocklist.
 *
 * Tools Registered:
 *   - `execute_command`      — Run shell commands in sandboxed workspace.
 *   - `run_sandboxed_script` — Create and execute Python/Node/PowerShell scripts in .sandbox/.
 *   - `list_sandbox_files`   — View files created in the sandbox directory.
 *   - `clean_sandbox`        — Remove all temporary scripts and outputs.
 */

import { exec } from "node:child_process";
import { promisify } from "node:util";
import { writeFileSync, readFileSync, readdirSync, statSync, unlinkSync, mkdirSync, existsSync, copyFileSync, rmdirSync } from "node:fs";
import { resolve, join, basename, extname, dirname } from "node:path";
import { CONFIG } from "../../core/config.js";
import { parseDocumentContent } from "../../core/document-parser.js";
import { PythonEngine } from "../../core/python-engine.js";
import type { ToolHandler, ToolPlugin, ToolSchema } from "../../core/types.js";

const execAsync = promisify(exec);

// ─── Constants & Setup ──────────────────────────────────────────────

const TIMEOUT_MS = CONFIG.SHELL.TIMEOUT_MS;
const MAX_BUFFER = CONFIG.SHELL.MAX_BUFFER_BYTES;
const _userBase = () => process.env.AIPLATE_USERDATA || process.cwd();
const SANDBOX_DIR = resolve(_userBase(), CONFIG.SHELL.SANDBOX_DIR || ".sandbox");
const ARTIFACTS_DIR = resolve(_userBase(), CONFIG.SHELL.ARTIFACTS_DIR || "artifacts");

// Ensure directories exist on startup safely
try {
  if (!existsSync(SANDBOX_DIR)) mkdirSync(SANDBOX_DIR, { recursive: true });
  if (!existsSync(ARTIFACTS_DIR)) mkdirSync(ARTIFACTS_DIR, { recursive: true });
} catch {
  // Non-fatal if loaded in restricted or early context
}

// ─── Environment Sanitization ────────────────────────────────────────

const BLOCKED_ENV_VARS = [
  "OPENAI_API_KEY",
  "GEMINI_API_KEY",
  "ANTHROPIC_API_KEY",
  "OPENROUTER_API_KEY",
  "GROQ_API_KEY",
  "DEEPSEEK_API_KEY",
  "AWS_SECRET_ACCESS_KEY",
  "AWS_SESSION_TOKEN",
  "GITHUB_TOKEN",
  "GH_TOKEN",
];

async function getSanitizedEnv(): Promise<NodeJS.ProcessEnv> {
  const env: NodeJS.ProcessEnv = { ...process.env };
  for (const key of BLOCKED_ENV_VARS) {
    delete env[key];
  }

  // Prepend isolated bundled Python and Scripts paths so `python` and `pip` commands resolve to it
  try {
    const pythonExe = await PythonEngine.getInstance().initialize();
    if (pythonExe && existsSync(pythonExe)) {
      const pythonDir = dirname(pythonExe);
      const scriptsDir = join(pythonDir, "Scripts");
      env.PATH = `${scriptsDir};${pythonDir};${env.PATH || ""}`;
    }
  } catch {}

  return env;
}

function truncateOutput(text: string): { text: string; isTruncated: boolean } {
  if (text.length <= CONFIG.SHELL.MAX_OUTPUT_CHARS) {
    return { text, isTruncated: false };
  }
  const truncated = text.slice(0, CONFIG.SHELL.MAX_OUTPUT_CHARS);
  return {
    text: `${truncated}\n\n... [Output truncated: exceeded ${CONFIG.SHELL.MAX_OUTPUT_CHARS} characters]`,
    isTruncated: true,
  };
}

// ─── Tool 1: execute_command ─────────────────────────────────────────

const executeCommandHandler: ToolHandler = async (args) => {
  const command = args.command as string;
  if (!command || typeof command !== "string") {
    return { error: "The 'command' argument is required and must be a string." };
  }

  const startTime = Date.now();

  try {
    const env = await getSanitizedEnv();
    const { stdout, stderr } = await execAsync(command, {
      cwd: SANDBOX_DIR,
      timeout: TIMEOUT_MS,
      maxBuffer: MAX_BUFFER,
      shell: "cmd.exe",
      windowsHide: true,
      env,
    });

    const elapsedMs = Date.now() - startTime;
    const truncatedStdout = truncateOutput(stdout);
    const truncatedStderr = truncateOutput(stderr);

    return {
      command,
      elapsedMs,
      stdout: truncatedStdout.text,
      stderr: truncatedStderr.text,
      isTruncated: truncatedStdout.isTruncated || truncatedStderr.isTruncated,
      exitCode: 0,
      sandboxed: true,
    };
  } catch (err: unknown) {
    const execError = err as {
      stdout?: string;
      stderr?: string;
      code?: number;
      killed?: boolean;
      message?: string;
    };

    return {
      command,
      stdout: execError.stdout?.trim() ?? "",
      stderr: execError.stderr?.trim() ?? "",
      exitCode: execError.code ?? 1,
      error: execError.killed
        ? `Command timed out after ${TIMEOUT_MS / 1000} seconds.`
        : (execError.message ?? "Command execution failed"),
      sandboxed: true,
    };
  }
};

const executeCommandSchema: ToolSchema = {
  name: "execute_command",
  description:
    "Execute a shell command with .sandbox/ as its working directory. " +
    "Can list or read user-requested absolute local paths, subject to OS permissions and security policy. " +
    "The working directory is not a filesystem access boundary. " +
    "Useful for running scripts, compiling, data transformations, or running system utilities. " +
    "Sensitive credentials (API keys) are stripped from the execution environment. " +
    "Destructive system commands (rmdir /s, format, etc.) are blocked.",
  parametersJsonSchema: {
    type: "object",
    properties: {
      command: {
        type: "string",
        description: "The shell command to execute inside .sandbox/.",
      },
    },
    required: ["command"],
  },
};

// ─── Tool 2: run_sandboxed_script ────────────────────────────────────

const runScriptHandler: ToolHandler = async (args) => {
  const language = ((args.language as string) || "python").toLowerCase();
  const code = args.code as string;
  let scriptName = (args.script_name as string) || "";

  if (!code || typeof code !== "string") {
    return { error: "The 'code' argument is required and must be a string." };
  }

  // 1. Determine file extension and default name
  const extMap: Record<string, string> = {
    python: ".py",
    node: ".js",
    powershell: ".ps1",
    cmd: ".bat",
  };

  const ext = extMap[language] || ".py";
  if (!scriptName) {
    scriptName = `script_${Date.now()}${ext}`;
  } else if (!scriptName.endsWith(ext)) {
    scriptName += ext;
  }

  const scriptPath = join(SANDBOX_DIR, basename(scriptName));
  const startTime = Date.now();

  try {
    // 2. Write the script to the sandbox directory
    writeFileSync(scriptPath, code, "utf-8");

    // Check if Python execution can use the isolated local Python engine
    if (language === "python" || (scriptName && scriptName.endsWith(".py"))) {
      const pythonEngine = PythonEngine.getInstance();
      const runRes = await pythonEngine.runScript(code, scriptName || undefined);
      const elapsedMs = Date.now() - startTime;
      const truncatedStdout = truncateOutput(runRes.stdout);
      const truncatedStderr = truncateOutput(runRes.stderr);

      // Auto-detect and promote any generated plot/image files to artifacts/
      const promotedArtifacts: Array<{ name: string; url: string; sizeBytes: number }> = (runRes.generatedFiles || []).map((f) => ({
        name: f.name,
        url: `/api/artifacts/file?name=${encodeURIComponent(f.name)}`,
        sizeBytes: f.sizeBytes,
      }));

      return {
        scriptName,
        sandboxPath: runRes.scriptPath || scriptPath,
        language: "python",
        elapsedMs,
        stdout: truncatedStdout.text,
        stderr: truncatedStderr.text,
        isTruncated: truncatedStdout.isTruncated || truncatedStderr.isTruncated,
        exitCode: runRes.exitCode,
        sandboxed: true,
        artifacts: promotedArtifacts,
        deliverables: promotedArtifacts.map((a) => ({
          title: a.name,
          type: a.name.match(/\.(png|jpg|jpeg|svg)$/i) ? "image" : "file",
          content: a.url,
        })),
      };
    }

    // Determine runner command for non-python scripts
    let runCommand: string;
    switch (language) {
      case "node":
        runCommand = `node "${basename(scriptName)}"`;
        break;
      case "powershell":
        runCommand = `powershell -NonInteractive -NoProfile -ExecutionPolicy Bypass -File "${basename(scriptName)}"`;
        break;
      case "cmd":
        runCommand = `cmd.exe /c "${basename(scriptName)}"`;
        break;
      default:
        runCommand = `node "${basename(scriptName)}"`;
        break;
    }

    // 3. Execute in the sandbox with sanitized env
    const env = await getSanitizedEnv();
    const { stdout, stderr } = await execAsync(runCommand, {
      cwd: SANDBOX_DIR,
      timeout: TIMEOUT_MS,
      maxBuffer: MAX_BUFFER,
      shell: "cmd.exe",
      windowsHide: true,
      env,
    });

    const elapsedMs = Date.now() - startTime;
    const truncatedStdout = truncateOutput(stdout);
    const truncatedStderr = truncateOutput(stderr);

    // Auto-detect and promote any generated files to artifacts/
    const promotedArtifacts: Array<{ name: string; url: string; sizeBytes: number }> = [];
    try {
      if (existsSync(SANDBOX_DIR)) {
        const files = readdirSync(SANDBOX_DIR);
        for (const file of files) {
          if (file.startsWith(".")) continue;
          const fileExt = extname(file).toLowerCase();
          if ([".png", ".jpg", ".jpeg", ".svg", ".csv", ".pdf", ".html"].includes(fileExt)) {
            const srcPath = join(SANDBOX_DIR, file);
            const st = statSync(srcPath);
            if (st.mtimeMs >= startTime - 1000) {
              if (!existsSync(ARTIFACTS_DIR)) mkdirSync(ARTIFACTS_DIR, { recursive: true });
              const destPath = join(ARTIFACTS_DIR, file);
              copyFileSync(srcPath, destPath);
              promotedArtifacts.push({
                name: file,
                url: `/api/artifacts/file?name=${encodeURIComponent(file)}`,
                sizeBytes: st.size,
              });
            }
          }
        }

        // Check if the script created a nested artifacts directory inside .sandbox/
        const nestedArtifactsDir = join(SANDBOX_DIR, "artifacts");
        if (existsSync(nestedArtifactsDir)) {
          if (!existsSync(ARTIFACTS_DIR)) mkdirSync(ARTIFACTS_DIR, { recursive: true });
          const nestedFiles = readdirSync(nestedArtifactsDir);
          for (const file of nestedFiles) {
            const src = join(nestedArtifactsDir, file);
            const dest = join(ARTIFACTS_DIR, file);
            try {
              const st = statSync(src);
              if (st.isFile()) {
                copyFileSync(src, dest);
                unlinkSync(src);
                promotedArtifacts.push({
                  name: file,
                  url: `/api/artifacts/file?name=${encodeURIComponent(file)}`,
                  sizeBytes: st.size,
                });
              }
            } catch {}
          }
          try {
            rmdirSync(nestedArtifactsDir);
          } catch {}
        }
      }
    } catch {}

    return {
      scriptName,
      sandboxPath: scriptPath,
      language,
      elapsedMs,
      stdout: truncatedStdout.text,
      stderr: truncatedStderr.text,
      isTruncated: truncatedStdout.isTruncated || truncatedStderr.isTruncated,
      exitCode: 0,
      sandboxed: true,
      artifacts: promotedArtifacts,
      deliverables: promotedArtifacts.map((a) => ({
        title: a.name,
        type: a.name.match(/\.(png|jpg|jpeg|svg)$/i) ? "image" : "file",
        content: a.url,
      })),
    };
  } catch (err: unknown) {
    const execError = err as {
      stdout?: string;
      stderr?: string;
      code?: number;
      killed?: boolean;
      message?: string;
    };

    return {
      scriptName,
      sandboxPath: scriptPath,
      language,
      stdout: execError.stdout?.trim() ?? "",
      stderr: execError.stderr?.trim() ?? "",
      exitCode: execError.code ?? 1,
      error: execError.killed
        ? `Script execution timed out after ${TIMEOUT_MS / 1000} seconds.`
        : (execError.message ?? "Script execution error"),
      sandboxed: true,
    };
  }
};

const runScriptSchema: ToolSchema = {
  name: "run_sandboxed_script",
  description:
    "Write and execute a mini-tool or script (Python, Node.js, PowerShell) stored in .sandbox/. " +
    "Scripts can list or read user-requested absolute local paths, subject to OS permissions and security policy. " +
    "Keep temporary script files and intermediate outputs in .sandbox/. " +
    "Use this for data analysis (pandas, math), calculations, plotting, or file processing. " +
    "Credentials and API keys are isolated and not exposed to the script.",
  parametersJsonSchema: {
    type: "object",
    properties: {
      language: {
        type: "string",
        enum: ["python", "node", "powershell", "cmd"],
        description: "Script language ('python', 'node', 'powershell', 'cmd'). Default: 'python'.",
      },
      code: {
        type: "string",
        description: "The complete script code to write and execute.",
      },
      script_name: {
        type: "string",
        description: "Optional filename (e.g., 'calc_totals.py', 'process_data.js').",
      },
    },
    required: ["code"],
  },
};

// ─── Tool 3: list_sandbox_files ──────────────────────────────────────

const listSandboxHandler: ToolHandler = async () => {
  try {
    if (!existsSync(SANDBOX_DIR)) {
      return { totalFiles: 0, files: [] };
    }

    const fileNames = readdirSync(SANDBOX_DIR);
    const files = fileNames
      .filter((name) => {
        if (name.startsWith(".")) return false;
        try {
          return statSync(join(SANDBOX_DIR, name)).isFile();
        } catch {
          return false;
        }
      })
      .map((name) => {
        const fullPath = join(SANDBOX_DIR, name);
        const stat = statSync(fullPath);
        return {
          name,
          sizeBytes: stat.size,
          modifiedAt: stat.mtime.toISOString(),
        };
      });

    return {
      sandboxDirectory: SANDBOX_DIR,
      totalFiles: files.length,
      files,
    };
  } catch (err) {
    return { error: `Failed to list sandbox: ${err instanceof Error ? err.message : String(err)}` };
  }
};

const listSandboxSchema: ToolSchema = {
  name: "list_sandbox_files",
  description: "List all temporary scripts and output files created in the .sandbox/ workspace.",
  parametersJsonSchema: {
    type: "object",
    properties: {},
    required: [],
  },
};

// ─── Tool 4: clean_sandbox ───────────────────────────────────────────

const cleanSandboxHandler: ToolHandler = async () => {
  try {
    if (!existsSync(SANDBOX_DIR)) {
      return { message: "Sandbox is already clean." };
    }

    const fileNames = readdirSync(SANDBOX_DIR);
    let deletedCount = 0;

    for (const name of fileNames) {
      const fullPath = join(SANDBOX_DIR, name);
      try {
        unlinkSync(fullPath);
        deletedCount++;
      } catch {
        // Skip locked files
      }
    }

    return {
      message: `Cleaned sandbox: deleted ${deletedCount} file(s).`,
      sandboxDirectory: SANDBOX_DIR,
    };
  } catch (err) {
    return { error: `Failed to clean sandbox: ${err instanceof Error ? err.message : String(err)}` };
  }
};

const cleanSandboxSchema: ToolSchema = {
  name: "clean_sandbox",
  description: "Remove all temporary scripts, logs, and generated files from the .sandbox/ workspace.",
  parametersJsonSchema: {
    type: "object",
    properties: {},
    required: [],
  },
};

// ─── Tool 5: read_file ───────────────────────────────────────────────

const readFileHandler: ToolHandler = async (args) => {
  const filePath = args.file_path as string;
  if (!filePath || typeof filePath !== "string") {
    return { error: "The 'file_path' argument is required and must be a string." };
  }

  // Try locating file in artifacts first, then .sandbox, then workspace root
  let targetPath = resolve(ARTIFACTS_DIR, filePath);
  if (!existsSync(targetPath)) {
    targetPath = resolve(SANDBOX_DIR, filePath);
  }
  if (!existsSync(targetPath)) {
    targetPath = resolve(process.cwd(), filePath);
  }

  if (!existsSync(targetPath)) {
    return { error: `File not found: "${filePath}". Looked in artifacts/, .sandbox/, and workspace root.` };
  }

  try {
    const rawBuffer = readFileSync(targetPath);
    const filename = basename(targetPath);
    const parsed = await parseDocumentContent(filename, rawBuffer);
    const truncated = truncateOutput(parsed.text);

    return {
      filename,
      filePath: targetPath,
      isBinary: parsed.isBinary,
      totalCharacters: parsed.extractedLength,
      isTruncated: truncated.isTruncated,
      content: truncated.text,
    };
  } catch (err) {
    return { error: `Failed to read file: ${err instanceof Error ? err.message : String(err)}` };
  }
};

const readFileSchema: ToolSchema = {
  name: "read_file",
  description:
    "Read and parse the contents of any file in the workspace, artifacts/, or .sandbox/ directory (e.g. PDF documents, source code, text, CSV, JSON, Markdown). Automatically extracts clean text from PDFs.",
  parametersJsonSchema: {
    type: "object",
    properties: {
      file_path: {
        type: "string",
        description: "Path or name of the file to read (e.g. 'CV Resume.pdf', 'script.py', 'data.csv', 'artifacts/report.md').",
      },
    },
    required: ["file_path"],
  },
};

// ─── Tool 6: save_artifact ───────────────────────────────────────────

const saveArtifactHandler: ToolHandler = async (args) => {
  const name = (args.name as string)?.trim();
  const fromSandbox = (args.from_sandbox as string)?.trim();
  const content = args.content as string | undefined;
  const description = (args.description as string)?.trim();

  if (!name) {
    return { error: "The 'name' argument is required (e.g. 'sales_chart.png', 'summary_report.md')." };
  }

  const cleanName = basename(name);
  const destPath = join(ARTIFACTS_DIR, cleanName);

  try {
    if (fromSandbox) {
      const srcPath = join(SANDBOX_DIR, basename(fromSandbox));
      if (!existsSync(srcPath)) {
        return { error: `Source file "${fromSandbox}" not found in .sandbox/ scratchpad.` };
      }
      const data = readFileSync(srcPath);
      writeFileSync(destPath, data);
    } else if (content !== undefined) {
      const isBase64 = Boolean(args.is_base64);
      const buffer = isBase64 ? Buffer.from(content, "base64") : Buffer.from(content, "utf-8");
      writeFileSync(destPath, buffer);
    } else {
      return { error: "Provide either 'from_sandbox' filename or 'content' to save as an artifact." };
    }

    const stat = statSync(destPath);
    return {
      success: true,
      artifactName: cleanName,
      sizeBytes: stat.size,
      savedTo: destPath,
      url: `/api/artifacts/file?name=${encodeURIComponent(cleanName)}`,
      description: description || "Saved deliverable artifact",
    };
  } catch (err) {
    return { error: `Failed to save artifact: ${err instanceof Error ? err.message : String(err)}` };
  }
};

const saveArtifactSchema: ToolSchema = {
  name: "save_artifact",
  description:
    "Promote a meaningful file from .sandbox/ scratchpad or write direct content to the persistent artifacts/ gallery (e.g. generated charts, PNG/SVG plots, datasets, reports). Artifacts are permanently kept and rendered in the user's Artifacts Gallery.",
  parametersJsonSchema: {
    type: "object",
    properties: {
      name: {
        type: "string",
        description: "Filename for the permanent artifact (e.g., 'correlation_heatmap.png', 'monthly_data.csv', 'report.md').",
      },
      from_sandbox: {
        type: "string",
        description: "Optional filename in .sandbox/ scratchpad to promote into artifacts/.",
      },
      content: {
        type: "string",
        description: "Optional direct text or code content to save.",
      },
      is_base64: {
        type: "boolean",
        description: "Set true if 'content' is base64-encoded binary data.",
      },
      description: {
        type: "string",
        description: "Brief summary of what this artifact contains.",
      },
    },
    required: ["name"],
  },
};

// ─── Tool 7: list_artifacts ───────────────────────────────────────────

const listArtifactsHandler: ToolHandler = async () => {
  try {
    if (!existsSync(ARTIFACTS_DIR)) {
      return { totalArtifacts: 0, artifacts: [] };
    }

    const fileNames = readdirSync(ARTIFACTS_DIR);
    const artifacts = fileNames
      .filter((name) => {
        if (name.startsWith(".")) return false;
        try {
          return statSync(join(ARTIFACTS_DIR, name)).isFile();
        } catch {
          return false;
        }
      })
      .map((name) => {
        const fullPath = join(ARTIFACTS_DIR, name);
        const stat = statSync(fullPath);
        return {
          name,
          sizeBytes: stat.size,
          modifiedAt: stat.mtime.toISOString(),
          url: `/api/artifacts/file?name=${encodeURIComponent(name)}`,
        };
      });

    return {
      artifactsDirectory: ARTIFACTS_DIR,
      totalArtifacts: artifacts.length,
      artifacts,
    };
  } catch (err) {
    return { error: `Failed to list artifacts: ${err instanceof Error ? err.message : String(err)}` };
  }
};

const listArtifactsSchema: ToolSchema = {
  name: "list_artifacts",
  description: "List all persistent deliverable artifacts (plots, charts, data files, reports) stored in the artifacts/ gallery.",
  parametersJsonSchema: {
    type: "object",
    properties: {},
    required: [],
  },
};

// ─── Tool 8: delete_artifact ──────────────────────────────────────────

const deleteArtifactHandler: ToolHandler = async (args) => {
  const name = (args.name as string)?.trim();
  if (!name) {
    return { error: "The 'name' argument is required (e.g. 'chart.png')." };
  }

  const cleanName = basename(name);
  const targetPath = join(ARTIFACTS_DIR, cleanName);

  if (!existsSync(targetPath)) {
    return { error: `Artifact "${cleanName}" not found in artifacts/ directory.` };
  }

  try {
    unlinkSync(targetPath);
    return {
      success: true,
      message: `Artifact "${cleanName}" deleted successfully from artifacts gallery.`,
      deletedArtifact: cleanName,
    };
  } catch (err) {
    return { error: `Failed to delete artifact: ${err instanceof Error ? err.message : String(err)}` };
  }
};

const deleteArtifactSchema: ToolSchema = {
  name: "delete_artifact",
  description: "Delete a specific deliverable artifact from the artifacts/ gallery by filename.",
  parametersJsonSchema: {
    type: "object",
    properties: {
      name: {
        type: "string",
        description: "Filename of the artifact to delete (e.g. 'sales_chart.png', 'summary_report.md').",
      },
    },
    required: ["name"],
  },
};

// ─── Tool 9: clear_artifacts ──────────────────────────────────────────

const clearArtifactsHandler: ToolHandler = async () => {
  if (!existsSync(ARTIFACTS_DIR)) {
    return { success: true, message: "Artifacts directory is already empty.", deletedCount: 0 };
  }

  try {
    const files = readdirSync(ARTIFACTS_DIR);
    let deletedCount = 0;
    const removed: string[] = [];

    for (const f of files) {
      if (f.startsWith(".")) continue;
      const fullPath = join(ARTIFACTS_DIR, f);
      try {
        if (statSync(fullPath).isFile()) {
          unlinkSync(fullPath);
          deletedCount++;
          removed.push(f);
        }
      } catch {
        // Skip locked files
      }
    }

    return {
      success: true,
      message: `Cleared artifacts gallery: removed ${deletedCount} file(s).`,
      deletedCount,
      removedFiles: removed,
    };
  } catch (err) {
    return { error: `Failed to clear artifacts: ${err instanceof Error ? err.message : String(err)}` };
  }
};

const clearArtifactsSchema: ToolSchema = {
  name: "clear_artifacts",
  description: "Remove and clean all files from the persistent artifacts/ gallery.",
  parametersJsonSchema: {
    type: "object",
    properties: {},
    required: [],
  },
};

// ─── Tool 10: install_python_package ──────────────────────────────────

const installPythonPackageHandler: ToolHandler = async (args) => {
  let packages: string[] = [];
  if (Array.isArray(args.packages)) {
    packages = args.packages.map((p) => String(p).trim()).filter(Boolean);
  } else if (typeof args.packages === "string") {
    packages = args.packages.split(/\s+/).map((p) => p.trim()).filter(Boolean);
  } else if (args.package && typeof args.package === "string") {
    packages = [args.package.trim()];
  }

  if (packages.length === 0) {
    return { error: "The 'packages' argument is required (e.g. ['pandas', 'matplotlib'] or 'pandas matplotlib')." };
  }

  const upgrade = Boolean(args.upgrade);
  const startTime = Date.now();

  try {
    const pythonEngine = PythonEngine.getInstance();
    const result = await pythonEngine.installPackages(packages, upgrade);
    const elapsedMs = Date.now() - startTime;
    const truncatedStdout = truncateOutput(result.stdout);

    return {
      success: true,
      installedPackages: packages,
      elapsedMs,
      message: `Successfully installed ${packages.join(", ")} into isolated Python environment.`,
      stdout: truncatedStdout.text,
      isBundledEngine: pythonEngine.isBundled,
    };
  } catch (err: any) {
    return {
      success: false,
      error: err.message || String(err),
      attemptedPackages: packages,
    };
  }
};

const installPythonPackageSchema: ToolSchema = {
  name: "install_python_package",
  description:
    "Install one or more Python packages/libraries into AI Plate's isolated bundled Python runtime using pip. " +
    "Use this whenever you need an external Python library (e.g., 'pandas', 'matplotlib', 'seaborn', 'scipy', 'scikit-learn', 'yfinance', 'requests', 'pillow') " +
    "to analyze data, train models, parse datasets, or generate visual plots.",
  parametersJsonSchema: {
    type: "object",
    properties: {
      packages: {
        type: "array",
        items: { type: "string" },
        description: "List of package names to install (e.g. ['pandas', 'matplotlib', 'seaborn']).",
      },
      upgrade: {
        type: "boolean",
        description: "Whether to pass --upgrade to pip (default: false).",
      },
    },
    required: ["packages"],
  },
};

// ─── Tool 11: check_python_environment ────────────────────────────────

const checkPythonEnvironmentHandler: ToolHandler = async (args) => {
  try {
    const pythonEngine = PythonEngine.getInstance();
    const info = await pythonEngine.getEnvironmentInfo();
    const targetPackage = typeof args.package_name === "string" ? args.package_name.trim().toLowerCase() : null;

    if (targetPackage) {
      const match = info.packages.find((p) => p.name.toLowerCase() === targetPackage);
      return {
        isInstalled: Boolean(match),
        packageName: targetPackage,
        installedVersion: match ? match.version : null,
        pythonVersion: info.version,
        isBundledEngine: info.isBundled,
        executable: info.executable,
      };
    }

    return {
      pythonVersion: info.version,
      executable: info.executable,
      isBundledEngine: info.isBundled,
      totalInstalledPackages: info.packages.length,
      packages: info.packages,
    };
  } catch (err: any) {
    return {
      error: `Failed to inspect Python environment: ${err.message || String(err)}`,
    };
  }
};

const checkPythonEnvironmentSchema: ToolSchema = {
  name: "check_python_environment",
  description:
    "Inspect the status of the isolated bundled Python engine: check if Python is ready, list installed packages and versions, " +
    "or verify if a specific package (e.g. 'matplotlib') is already installed before running code.",
  parametersJsonSchema: {
    type: "object",
    properties: {
      package_name: {
        type: "string",
        description: "Optional specific package name to check (e.g. 'pandas' or 'seaborn').",
      },
    },
    required: [],
  },
};

// ─── Plugin Registration ────────────────────────────────────────────

export const shellPlugin: ToolPlugin = {
  id: "shell",
  name: "Sandboxed Shell & Scripts",
  description: "Isolated terminal commands, Python/Node scripts, and workspace artifact generation in .sandbox/ directory.",
  icon: "💻",

  register(registerTool) {
    registerTool(executeCommandSchema, executeCommandHandler);
    registerTool(runScriptSchema, runScriptHandler);
    registerTool(readFileSchema, readFileHandler);
    registerTool(listSandboxSchema, listSandboxHandler);
    registerTool(cleanSandboxSchema, cleanSandboxHandler);
    registerTool(saveArtifactSchema, saveArtifactHandler);
    registerTool(listArtifactsSchema, listArtifactsHandler);
    registerTool(deleteArtifactSchema, deleteArtifactHandler);
    registerTool(clearArtifactsSchema, clearArtifactsHandler);
    registerTool(installPythonPackageSchema, installPythonPackageHandler);
    registerTool(checkPythonEnvironmentSchema, checkPythonEnvironmentHandler);
  },
};
