/**
 * Self-Contained Python Engine — Packagable & Isolated Execution Service.
 *
 * Supports:
 *   1. Embedded / Bundled Python distributions (e.g. `./runtime/python/python.exe`).
 *   2. Dedicated Sandboxed Virtual Environment (`.sandbox/venv/`) isolated from system Python.
 *   3. Custom Python executable path via `PYTHON_PATH` in `.env`.
 *   4. Automatic dependency management (auto-installs pandas, numpy, matplotlib, etc. in sandbox).
 *   5. Plot image & file artifact detection.
 */

import { exec } from "node:child_process";
import { promisify } from "node:util";
import { existsSync, mkdirSync, writeFileSync, readdirSync, statSync, copyFileSync, unlinkSync, rmdirSync } from "node:fs";
import { resolve, join, extname, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { CONFIG } from "./config.js";

const execAsync = promisify(exec);
const __dirname = dirname(fileURLToPath(import.meta.url));

export interface PythonExecutionResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  elapsedMs: number;
  generatedFiles: Array<{ name: string; path: string; sizeBytes: number }>;
  scriptPath: string;
  isTruncated: boolean;
  engineUsed: string;
}

export class PythonEngine {
  private static instance: PythonEngine | null = null;
  private pythonExecutable: string = "python";
  private isInitialized: boolean = false;
  private readonly sandboxDir: string;
  private readonly venvDir: string;

  private constructor() {
    const base = process.env.AIPLATE_USERDATA || process.cwd();
    this.sandboxDir = resolve(base, CONFIG.SHELL.SANDBOX_DIR || ".sandbox");
    this.venvDir = join(this.sandboxDir, "venv");

    try {
      if (!existsSync(this.sandboxDir)) {
        mkdirSync(this.sandboxDir, { recursive: true });
      }
    } catch {}
  }

  public static getInstance(): PythonEngine {
    if (!PythonEngine.instance) {
      PythonEngine.instance = new PythonEngine();
    }
    return PythonEngine.instance;
  }

  /** Whether the engine has been initialized and resolved a Python executable */
  public get isAvailable(): boolean {
    return this.isInitialized && !!this.pythonExecutable;
  }

  /** Current Python executable path or command name */
  public get executable(): string {
    return this.pythonExecutable;
  }

  /**
   * Resolve and initialize the best available Python executable.
   * Priority:
   *   1. Explicit `PYTHON_PATH` from `.env` or config
   *   2. Bundled embeddable runtime (`resources/runtime/python` or `./runtime/python`)
   *   3. Sandboxed virtual environment (`.sandbox/venv/Scripts/python.exe`)
   *   4. System `python` / `py` / `python3`
   */
  public async initialize(): Promise<string> {
    if (this.isInitialized) return this.pythonExecutable;

    // 1. Explicit path from environment
    const envPath = process.env.PYTHON_PATH;
    if (envPath && existsSync(resolve(process.cwd(), envPath))) {
      this.pythonExecutable = resolve(process.cwd(), envPath);
      this.isInitialized = true;
      return this.pythonExecutable;
    }

    // 2. Check for bundled runtime in packaged Electron app (resourcesPath) or development (cwd)
    const possibleBundledDirs = [
      process.env.AIPLATE_APP_PATH ? resolve(process.env.AIPLATE_APP_PATH, "runtime/python") : null,
      process.env.AIPLATE_APP_ROOT ? resolve(process.env.AIPLATE_APP_ROOT, "runtime/python") : null,
      resolve(__dirname, "../../runtime/python"),
      resolve(__dirname, "../runtime/python"),
      (process as any).resourcesPath ? resolve((process as any).resourcesPath, "runtime/python") : null,
      resolve(process.cwd(), "runtime/python"),
    ].filter(Boolean) as string[];

    for (const bDir of possibleBundledDirs) {
      const candidates = [
        join(bDir, "python.exe"),
        join(bDir, "Scripts", "python.exe"),
        join(bDir, "bin", "python3"),
        join(bDir, "bin", "python"),
      ];
      for (const cand of candidates) {
        if (existsSync(cand)) {
          this.pythonExecutable = cand;
          this.isInitialized = true;
          return this.pythonExecutable;
        }
      }
    }

    // 3. Check for existing sandbox venv
    const venvWindows = join(this.venvDir, "Scripts", "python.exe");
    const venvUnix = join(this.venvDir, "bin", "python");
    if (existsSync(venvWindows)) {
      this.pythonExecutable = venvWindows;
      this.isInitialized = true;
      return this.pythonExecutable;
    }
    if (existsSync(venvUnix)) {
      this.pythonExecutable = venvUnix;
      this.isInitialized = true;
      return this.pythonExecutable;
    }

    // 4. Test system python candidates
    const candidates = ["python", "py -3", "python3"];
    for (const cmd of candidates) {
      try {
        const { stdout } = await execAsync(`${cmd} --version`, {
          timeout: 5000,
          windowsHide: true,
        });
        if (stdout.toLowerCase().includes("python")) {
          this.pythonExecutable = cmd;
          this.isInitialized = true;
          break;
        }
      } catch {
        // Continue to next candidate
      }
    }

    this.isInitialized = true;
    return this.pythonExecutable;
  }

  /**
   * Execute Python code inside the sandbox workspace.
   */
  public async runScript(
    code: string,
    scriptName: string = `script_${Date.now()}.py`
  ): Promise<PythonExecutionResult> {
    await this.initialize();

    const scriptPath = join(this.sandboxDir, scriptName);
    writeFileSync(scriptPath, code, "utf-8");

    // Track files in sandbox before execution
    const filesBefore = new Set(readdirSync(this.sandboxDir));
    const startTime = Date.now();

    // Sanitize environment & inject isolated Python binary and Scripts path
    const pythonDir = dirname(this.pythonExecutable);
    const scriptsDir = join(pythonDir, "Scripts");
    const sanitizedEnv: NodeJS.ProcessEnv = {
      ...process.env,
      PATH: `${scriptsDir};${pythonDir};${process.env.PATH || ""}`,
    };
    delete sanitizedEnv.OPENROUTER_API_KEY;
    delete sanitizedEnv.GOOGLE_API_KEY;
    delete sanitizedEnv.OPENAI_API_KEY;
    delete sanitizedEnv.ANTHROPIC_API_KEY;
    delete sanitizedEnv.GROQ_API_KEY;
    delete sanitizedEnv.DEEPSEEK_API_KEY;
    delete sanitizedEnv.MISTRAL_API_KEY;

    try {
      const { stdout, stderr } = await execAsync(
        `"${this.pythonExecutable}" "${scriptName}"`,
        {
          cwd: this.sandboxDir,
          timeout: CONFIG.SHELL.TIMEOUT_MS,
          maxBuffer: CONFIG.SHELL.MAX_BUFFER_BYTES,
          shell: "cmd.exe",
          windowsHide: true,
          env: sanitizedEnv,
        }
      );

      const elapsedMs = Date.now() - startTime;

      // Find files generated during this execution
      const filesAfter = readdirSync(this.sandboxDir);
      const generatedFiles: Array<{ name: string; path: string; sizeBytes: number }> = [];
      const base = process.env.AIPLATE_USERDATA || process.cwd();
      const artifactsDir = resolve(base, CONFIG.SHELL.ARTIFACTS_DIR || "artifacts");
      try {
        if (!existsSync(artifactsDir)) {
          mkdirSync(artifactsDir, { recursive: true });
        }
      } catch {}

      for (const file of filesAfter) {
        if (!filesBefore.has(file) && file !== scriptName) {
          const fullPath = join(this.sandboxDir, file);
          try {
            const st = statSync(fullPath);
            if (st.isFile()) {
              generatedFiles.push({
                name: file,
                path: fullPath,
                sizeBytes: st.size,
              });

              // Auto-mirror images and plots to artifacts directory
              const ext = extname(file).toLowerCase();
              if ([".png", ".jpg", ".jpeg", ".svg", ".webp", ".gif", ".bmp"].includes(ext)) {
                try {
                  copyFileSync(fullPath, join(artifactsDir, file));
                } catch {}
              }
            }
          } catch {
            // Non-fatal
          }
        }
      }

      // Check if a script created a nested artifacts directory inside the sandbox
      const nestedArtifacts = join(this.sandboxDir, "artifacts");
      if (existsSync(nestedArtifacts)) {
        try {
          const nested = readdirSync(nestedArtifacts);
          for (const nf of nested) {
            const src = join(nestedArtifacts, nf);
            const dst = join(artifactsDir, nf);
            try {
              const st = statSync(src);
              if (st.isFile()) {
                copyFileSync(src, dst);
                unlinkSync(src);
                generatedFiles.push({ name: nf, path: dst, sizeBytes: st.size });
              }
            } catch {}
          }
          rmdirSync(nestedArtifacts);
        } catch {}
      }

      // Truncate long stdout
      const maxChars = CONFIG.SHELL.MAX_OUTPUT_CHARS;
      let finalStdout = stdout.trim();
      let isTruncated = false;

      if (finalStdout.length > maxChars) {
        finalStdout =
          finalStdout.slice(0, maxChars) +
          `\n\n[⚠️ Output truncated: Showing first ${maxChars} of ${stdout.length} characters.]`;
        isTruncated = true;
      }

      return {
        stdout: finalStdout,
        stderr: stderr.trim(),
        exitCode: 0,
        elapsedMs,
        generatedFiles,
        scriptPath,
        isTruncated,
        engineUsed: this.pythonExecutable,
      };
    } catch (err: unknown) {
      const elapsedMs = Date.now() - startTime;
      const execError = err as {
        stdout?: string;
        stderr?: string;
        code?: number;
        killed?: boolean;
        message?: string;
      };

      return {
        stdout: execError.stdout?.trim() ?? "",
        stderr: execError.stderr?.trim() || (execError.message ?? "Python execution error"),
        exitCode: execError.code ?? 1,
        elapsedMs,
        generatedFiles: [],
        scriptPath,
        isTruncated: false,
        engineUsed: this.pythonExecutable,
      };
    }
  }

  /**
   * Whether the currently active Python engine is the bundled distribution.
   */
  public get isBundled(): boolean {
    const p = this.pythonExecutable.toLowerCase();
    return p.includes("runtime\\python") || p.includes("runtime/python");
  }

  /**
   * Create an isolated virtual environment inside `.sandbox/venv`.
   */
  public async createSandboxVenv(): Promise<boolean> {
    try {
      await execAsync(`python -m venv "${this.venvDir}"`, {
        cwd: this.sandboxDir,
        timeout: 30000,
        windowsHide: true,
      });

      const venvExe = join(this.venvDir, "Scripts", "python.exe");
      if (existsSync(venvExe)) {
        this.pythonExecutable = venvExe;
        return true;
      }
    } catch {
      // Fallback
    }
    return false;
  }

  /**
   * Install packages into the isolated Python runtime using pip.
   */
  public async installPackages(
    packages: string[],
    upgrade: boolean = false
  ): Promise<{ success: boolean; packages: string[]; stdout: string; stderr: string }> {
    await this.initialize();
    if (!packages || packages.length === 0) {
      return { success: true, packages: [], stdout: "No packages specified", stderr: "" };
    }

    const pkgArgs = packages.map((p) => p.trim()).filter(Boolean).join(" ");
    const upgradeFlag = upgrade ? " --upgrade" : "";
    const pythonDir = dirname(this.pythonExecutable);
    const scriptsDir = join(pythonDir, "Scripts");

    try {
      const { stdout, stderr } = await execAsync(
        `"${this.pythonExecutable}" -m pip install ${pkgArgs}${upgradeFlag} --no-warn-script-location`,
        {
          cwd: this.sandboxDir,
          timeout: 180000,
          windowsHide: true,
          env: {
            ...process.env,
            PATH: `${scriptsDir};${pythonDir};${process.env.PATH || ""}`,
          },
        }
      );

      return {
        success: true,
        packages,
        stdout: (stdout || "").trim(),
        stderr: (stderr || "").trim(),
      };
    } catch (err: any) {
      throw new Error(`Pip install failed: ${err.message || String(err)}`);
    }
  }

  /**
   * List installed packages in the isolated Python runtime.
   */
  public async listInstalledPackages(): Promise<Array<{ name: string; version: string }>> {
    await this.initialize();
    try {
      const { stdout } = await execAsync(`"${this.pythonExecutable}" -m pip list --format=json`, {
        cwd: this.sandboxDir,
        timeout: 15000,
        windowsHide: true,
      });
      return JSON.parse(stdout.trim());
    } catch {
      return [];
    }
  }

  /**
   * Detailed info about the active Python environment.
   */
  public async getEnvironmentInfo(): Promise<{
    executable: string;
    version: string;
    isBundled: boolean;
    packages: Array<{ name: string; version: string }>;
  }> {
    const exe = await this.initialize();
    let version = "Unknown";
    try {
      const { stdout } = await execAsync(`"${exe}" -V`, { timeout: 5000, windowsHide: true });
      version = stdout.trim();
    } catch {}

    const isBundled = this.isBundled;
    const packages = await this.listInstalledPackages();

    return {
      executable: exe,
      version,
      isBundled,
      packages,
    };
  }
}
