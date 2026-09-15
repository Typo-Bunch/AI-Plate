/**
 * High-Performance Local Moonshine STT Service.
 *
 * Manages a persistent Python background worker executing `moonshine_onnx`
 * with native low-latency speech recognition, zero 30s padding overhead,
 * automatic idle memory unloading, and robust IPC communication.
 */

import { spawn, type ChildProcess } from "node:child_process";
import { createInterface, type Interface } from "node:readline";
import { existsSync, mkdirSync, unlinkSync, writeFileSync, statSync, rmSync, readdirSync } from "node:fs";
import { resolve, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { PythonEngine } from "./python-engine.js";
import { logger } from "./logger.js";
import { CONFIG } from "./config.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

export interface STTTranscribeOptions {
  model?: "moonshine/tiny" | "moonshine/base";
}

export interface STTTranscriptionResult {
  success: boolean;
  id?: string;
  text?: string;
  duration?: number;
  elapsedMs?: number;
  model?: string;
  error?: string;
}

export interface STTModelStatus {
  downloaded: boolean;
  modelPath: string | null;
  totalSizeBytes: number;
  available: boolean;
  isDownloading?: boolean;
  currentProgress?: STTDownloadProgress | null;
  activeModel?: string;
}

export interface STTDownloadProgress {
  label: string;
  percent: number;
  downloadedBytes: number;
  totalBytes: number;
  speedBps?: number;
  statusText?: string;
}

interface PendingRequest {
  resolve: (val: any) => void;
  reject: (err: any) => void;
  timer: NodeJS.Timeout;
}

export class STTService {
  private static instance: STTService | null = null;
  private workerProcess: ChildProcess | null = null;
  private readline: Interface | null = null;
  private pendingRequests: Map<string, PendingRequest> = new Map();
  private requestCounter: number = 0;
  private outputDir: string;
  private resolvedModelDir: string | null = null;
  private resolvedWorkerPath: string | null = null;
  private isStarting: boolean = false;
  private isDownloadingModel: boolean = false;
  private currentDownloadProgress: STTDownloadProgress | null = null;
  private activeModelVariant: string = "moonshine/tiny";

  private constructor() {
    const base = process.env.AIPLATE_USERDATA || process.cwd();
    this.outputDir = resolve(base, CONFIG.SHELL.SANDBOX_DIR || ".sandbox", "stt");
    try {
      if (!existsSync(this.outputDir)) {
        mkdirSync(this.outputDir, { recursive: true });
      }
    } catch {}

    this.resolvePaths();

    // Trigger deferred Python engine initialization in background
    PythonEngine.getInstance().initialize().catch((err) => {
      logger.debug("STT", `Deferred PythonEngine initialization: ${err?.message || err}`);
    });
  }

  public static getInstance(): STTService {
    if (!STTService.instance) {
      STTService.instance = new STTService();
    }
    return STTService.instance;
  }

  /** Locate worker script and Moonshine model files across possible locations */
  public resolvePaths(): void {
    const resources = (process as any).resourcesPath;
    const searchBases = [
      process.env.AIPLATE_APP_PATH,
      process.env.AIPLATE_APP_ROOT,
      resolve(__dirname, "../../"),
      resolve(__dirname, "../"),
      resources ? resolve(resources) : null,
      process.env.AIPLATE_USERDATA,
      process.cwd(),
    ].filter(Boolean) as string[];

    // 1. Worker script
    for (const b of searchBases) {
      const candidates = [
        join(b, "scripts", "moonshine-worker.py"),
        join(b, "moonshine-worker.py"),
      ];
      for (const cand of candidates) {
        if (existsSync(cand)) {
          this.resolvedWorkerPath = cand;
          break;
        }
      }
      if (this.resolvedWorkerPath) break;
    }

    const userDataDir =
      process.env.AIPLATE_USERDATA ||
      (process.env.APPDATA ? join(process.env.APPDATA, "AI Plate") : null) ||
      process.cwd();

    // 2. Model search locations
    const possibleModelDirs = [
      resolve(userDataDir, "models", "moonshine"),
      ...searchBases.map((b) => join(b, "models", "moonshine")),
      ...searchBases.map((b) => join(b, "models")),
      ...searchBases,
    ];

    for (const dir of possibleModelDirs) {
      const tinyDir = join(dir, "tiny");
      const enc = join(tinyDir, "encoder_model.onnx");
      const dec = join(tinyDir, "decoder_model_merged.onnx");
      if (existsSync(enc) && existsSync(dec)) {
        this.resolvedModelDir = tinyDir;
        break;
      }
      if (existsSync(join(dir, "encoder_model.onnx")) && existsSync(join(dir, "decoder_model_merged.onnx"))) {
        this.resolvedModelDir = dir;
        break;
      }
    }
  }

  /** Check whether Moonshine STT is available and ready for inference */
  public isAvailable(): boolean {
    if (!this.resolvedWorkerPath) {
      this.resolvePaths();
    }
    const pythonEngine = PythonEngine.getInstance();
    const hasPython = pythonEngine.isAvailable || this.hasPythonExecutableSync();
    const status = this.getModelStatus();
    return Boolean(hasPython && this.resolvedWorkerPath && existsSync(this.resolvedWorkerPath) && status.downloaded);
  }

  private hasPythonExecutableSync(): boolean {
    const searchBases = [
      process.env.AIPLATE_APP_PATH,
      process.env.AIPLATE_APP_ROOT,
      resolve(__dirname, "../../"),
      resolve(__dirname, "../"),
      (process as any).resourcesPath ? resolve((process as any).resourcesPath) : null,
      process.env.AIPLATE_USERDATA,
      process.cwd(),
    ].filter(Boolean) as string[];

    for (const b of searchBases) {
      if (
        existsSync(join(b, "runtime", "python", "python.exe")) ||
        existsSync(join(b, "runtime", "python", "bin", "python3")) ||
        existsSync(join(b, "runtime", "python", "bin", "python"))
      ) {
        return true;
      }
    }
    return Boolean(process.env.PYTHON_PATH && existsSync(resolve(process.cwd(), process.env.PYTHON_PATH)));
  }

  /** Inspect Moonshine model status and cached weights footprint */
  public getModelStatus(): STTModelStatus {
    this.resolvePaths();

    // Check HuggingFace hub cache as well
    const home = process.env.USERPROFILE || process.env.HOME || "";
    const hfCacheDir = join(home, ".cache", "huggingface", "hub", "models--UsefulSensors--moonshine");
    const hasHfCache = existsSync(hfCacheDir);

    let totalSizeBytes = 0;
    let modelDir: string | null = this.resolvedModelDir;

    const calculateDirSize = (dir: string): number => {
      let s = 0;
      try {
        const entries = readdirSync(dir, { withFileTypes: true });
        for (const e of entries) {
          const p = join(dir, e.name);
          if (e.isDirectory()) s += calculateDirSize(p);
          else if (e.isFile()) s += statSync(p).size;
        }
      } catch {}
      return s;
    };

    if (modelDir && existsSync(modelDir)) {
      try {
        const enc = join(modelDir, "encoder_model.onnx");
        const dec = join(modelDir, "decoder_model_merged.onnx");
        if (existsSync(enc)) totalSizeBytes += statSync(enc).size;
        if (existsSync(dec)) totalSizeBytes += statSync(dec).size;
      } catch {}
    } else if (hasHfCache) {
      modelDir = hfCacheDir;
      totalSizeBytes = calculateDirSize(hfCacheDir);
    }

    const downloaded = Boolean((this.resolvedModelDir && existsSync(this.resolvedModelDir)) || (hasHfCache && totalSizeBytes > 1_000_000));

    return {
      downloaded,
      modelPath: modelDir,
      totalSizeBytes: totalSizeBytes || (downloaded ? 29_000_000 : 0),
      available: downloaded && Boolean(this.resolvedWorkerPath && existsSync(this.resolvedWorkerPath)),
      isDownloading: this.isDownloadingModel,
      currentProgress: this.currentDownloadProgress,
      activeModel: this.activeModelVariant,
    };
  }

  /**
   * On-demand download or pre-warming of Moonshine model assets (~27MB for Tiny, ~65MB for Base).
   */
  public async downloadModel(
    modelName: "moonshine/tiny" | "moonshine/base" = "moonshine/tiny",
    onProgress?: (data: STTDownloadProgress) => void
  ): Promise<{ success: boolean; error?: string }> {
    if (this.isDownloadingModel) {
      return { success: false, error: "Download is already in progress" };
    }

    this.isDownloadingModel = true;
    const targetSize = modelName.includes("tiny") ? 29_000_000 : 65_000_000;
    this.currentDownloadProgress = {
      label: `Downloading ${modelName}...`,
      percent: 10,
      downloadedBytes: Math.round(targetSize * 0.1),
      totalBytes: targetSize,
      statusText: "Initializing model download...",
    };
    onProgress?.(this.currentDownloadProgress);

    try {
      // 1. Ensure Python dependencies are installed in active python runtime
      const pythonEngine = PythonEngine.getInstance();
      await pythonEngine.initialize();
      const installed = await pythonEngine.listInstalledPackages();
      const hasPackage = installed.some((p) => p.name.toLowerCase() === "useful-moonshine-onnx");
      if (!hasPackage) {
        this.currentDownloadProgress.statusText = "Installing neural STT dependencies (useful-moonshine-onnx)...";
        this.currentDownloadProgress.percent = 25;
        onProgress?.(this.currentDownloadProgress);
        try {
          await pythonEngine.installPackages(["useful-moonshine-onnx", "soundfile"]);
        } catch (err: any) {
          logger.warn("STT", `Auto-install warning: ${err?.message || err}`);
        }
      }

      this.currentDownloadProgress.statusText = `Fetching ONNX weights for ${modelName}...`;
      this.currentDownloadProgress.percent = 45;
      onProgress?.(this.currentDownloadProgress);

      const resp = await this.sendCommand({
        action: "load",
        model: modelName,
        models_dir: this.resolvedModelDir || undefined,
      }, 180000);

      if (resp.status !== "ok") {
        return { success: false, error: resp.error || "Failed to load/download model" };
      }

      this.currentDownloadProgress = {
        label: `Moonshine Model Ready`,
        percent: 100,
        downloadedBytes: targetSize,
        totalBytes: targetSize,
        statusText: "Model cached and ready for real-time transcription.",
      };
      onProgress?.(this.currentDownloadProgress);

      this.activeModelVariant = modelName;
      this.resolvePaths();
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    } finally {
      this.isDownloadingModel = false;
    }
  }

  /** Pre-warm Moonshine STT model in RAM asynchronously on startup for sub-100ms first inference */
  public async preload(): Promise<void> {
    if (!this.isAvailable()) return;
    try {
      logger.info("STT", "Pre-warming Moonshine STT model in RAM...");
      const resp = await this.sendCommand({
        action: "load",
        model: this.activeModelVariant,
        models_dir: this.resolvedModelDir || undefined,
      }, 60000);
      if (resp.status === "ok") {
        logger.info("STT", "Moonshine STT model pre-warmed successfully (ready for instant inference).");
      }
    } catch (err: any) {
      logger.warn("STT", `Moonshine STT pre-warm skipped or deferred: ${err.message || err}`);
    }
  }

  /** Delete local Moonshine model assets */
  public deleteModel(): { success: boolean; error?: string } {
    this.unload();

    let deleted = false;
    if (this.resolvedModelDir && existsSync(this.resolvedModelDir)) {
      try {
        rmSync(this.resolvedModelDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
        this.resolvedModelDir = null;
        deleted = true;
      } catch (err: any) {
        return { success: false, error: `Failed to remove models directory: ${err.message}` };
      }
    }

    const home = process.env.USERPROFILE || process.env.HOME || "";
    const hfCacheDir = join(home, ".cache", "huggingface", "hub", "models--UsefulSensors--moonshine");
    if (existsSync(hfCacheDir)) {
      try {
        rmSync(hfCacheDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
        deleted = true;
      } catch (err: any) {
        return { success: false, error: `Failed to remove HF cache: ${err.message}` };
      }
    }

    return { success: true };
  }

  /** Transcribe speech audio (WAV Buffer or base64) to text using Moonshine ONNX */
  public async transcribe(
    audioData: Buffer | string,
    options: STTTranscribeOptions = {}
  ): Promise<STTTranscriptionResult> {
    if (!existsSync(this.outputDir)) {
      mkdirSync(this.outputDir, { recursive: true });
    }

    const tempFilename = `stt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.wav`;
    const tempPath = resolve(this.outputDir, tempFilename);

    try {
      const buffer = typeof audioData === "string"
        ? Buffer.from(audioData.replace(/^data:audio\/[a-z0-9]+;base64,/, ""), "base64")
        : audioData;

      writeFileSync(tempPath, buffer);

      const model = options.model || this.activeModelVariant;
      logger.info("STT", `Transcribe started: audio=${buffer.length} bytes, model=${model}, path=${tempFilename}`);

      const resp = await this.sendCommand(
        {
          action: "transcribe",
          audio_path: tempPath,
          model,
          models_dir: this.resolvedModelDir || undefined,
        },
        60000
      );

      if (resp.status !== "ok") {
        logger.warn("STT", `Transcription failed from worker: ${resp.error}`);
        return { success: false, error: resp.error || "Transcription failed" };
      }

      logger.info("STT", `Transcription succeeded: "${resp.text}", elapsed=${resp.elapsed_ms}ms, dur=${resp.duration}s`);

      return {
        success: true,
        id: resp.id,
        text: resp.text || "",
        duration: resp.duration,
        elapsedMs: resp.elapsed_ms,
        model: resp.model || model,
      };
    } catch (err: any) {
      logger.error("STT", `Transcription exception: ${err.message || String(err)}`);
      return { success: false, error: err.message };
    } finally {
      // Always remove temporary recording file to ensure zero disk clutter
      if (existsSync(tempPath)) {
        try {
          unlinkSync(tempPath);
        } catch {}
      }
    }
  }

  /** Send JSON command to worker process with timeout and automatic error recovery */
  private async sendCommand(cmd: Record<string, any>, timeoutMs: number = 30000): Promise<any> {
    await this.ensureWorkerRunning();

    const id = `req_${++this.requestCounter}_${Date.now()}`;
    const payload = { ...cmd, id };

    return new Promise((resolveReq, rejectReq) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(id);
        rejectReq(new Error(`STT worker command '${cmd.action}' timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      this.pendingRequests.set(id, {
        resolve: resolveReq,
        reject: rejectReq,
        timer,
      });

      try {
        this.workerProcess!.stdin!.write(JSON.stringify(payload) + "\n");
      } catch (err: any) {
        clearTimeout(timer);
        this.pendingRequests.delete(id);
        rejectReq(new Error(`Failed to write to STT worker stdin: ${err.message}`));
      }
    });
  }

  /** Ensure persistent Python worker is running */
  private async ensureWorkerRunning(): Promise<ChildProcess> {
    if (this.workerProcess && !this.workerProcess.killed) {
      return this.workerProcess;
    }

    if (this.isStarting) {
      let attempts = 0;
      while (this.isStarting && attempts < 50) {
        await new Promise((r) => setTimeout(r, 100));
        attempts++;
      }
      if (this.workerProcess && !this.workerProcess.killed) {
        return this.workerProcess;
      }
    }

    this.isStarting = true;
    try {
      this.resolvePaths();
      if (!this.resolvedWorkerPath || !existsSync(this.resolvedWorkerPath)) {
        throw new Error(`Moonshine worker script not found at ${this.resolvedWorkerPath}`);
      }

      const pythonEngine = PythonEngine.getInstance();
      await pythonEngine.initialize();
      let pythonPath = pythonEngine.executable;

      const searchBases = [
        process.env.AIPLATE_APP_PATH,
        process.env.AIPLATE_APP_ROOT,
        resolve(__dirname, "../../"),
        resolve(__dirname, "../"),
        (process as any).resourcesPath ? resolve((process as any).resourcesPath) : null,
        process.env.AIPLATE_USERDATA,
        process.cwd(),
      ].filter(Boolean) as string[];

      const dedicatedPythonCandidates = [
        ...searchBases.map((b) => join(b, "runtime", "python", "python.exe")),
        ...searchBases.map((b) => join(b, "runtime", "python", "bin", "python3")),
        ...searchBases.map((b) => join(b, "runtime", "python", "bin", "python")),
      ];
      for (const cand of dedicatedPythonCandidates) {
        if (existsSync(cand)) {
          pythonPath = cand;
          break;
        }
      }

      logger.info("STT", `Starting Moonshine STT worker with: ${pythonPath}`);

      const pythonDir = dirname(pythonPath);
      const scriptsDir = join(pythonDir, "Scripts");

      const proc = spawn(pythonPath, [this.resolvedWorkerPath], {
        stdio: ["pipe", "pipe", "pipe"],
        windowsHide: true,
        env: {
          ...process.env,
          PYTHONIOENCODING: "utf-8",
          PYTHONUNBUFFERED: "1",
          PATH: `${scriptsDir};${pythonDir};${process.env.PATH || ""}`,
        },
      });

      this.workerProcess = proc;

      this.readline = createInterface({
        input: proc.stdout!,
        crlfDelay: Infinity,
      });

      this.readline.on("line", (line: string) => {
        const trimmed = line.trim();
        if (!trimmed) return;
        try {
          const res = JSON.parse(trimmed);
          const reqId = res.id;
          if (reqId && this.pendingRequests.has(reqId)) {
            const pending = this.pendingRequests.get(reqId)!;
            clearTimeout(pending.timer);
            this.pendingRequests.delete(reqId);
            pending.resolve(res);
          } else {
            // Un-keyed broadcast or command response
            for (const [k, p] of this.pendingRequests.entries()) {
              clearTimeout(p.timer);
              this.pendingRequests.delete(k);
              p.resolve(res);
              break;
            }
          }
        } catch (err) {
          logger.warn("STT", `Error parsing STT worker output: ${line}`);
        }
      });

      proc.stderr?.on("data", (data: Buffer) => {
        const errStr = data.toString("utf-8").trim();
        if (errStr) {
          logger.debug("STT", `[Worker stderr] ${errStr}`);
          const pctMatch = errStr.match(/(\d+)%/);
          if (pctMatch && this.isDownloadingModel && this.currentDownloadProgress) {
            const pct = parseInt(pctMatch[1], 10);
            this.currentDownloadProgress.percent = Math.min(99, Math.max(10, pct));
            this.currentDownloadProgress.statusText = `Downloading model weights... ${pct}%`;
          }
        }
      });

      proc.on("error", (err) => {
        logger.error("STT", `Worker process error: ${err.message}`);
        this.cleanupWorker();
      });

      proc.on("exit", (code, signal) => {
        logger.info("STT", `Worker process exited (code=${code}, signal=${signal})`);
        this.cleanupWorker();
      });

      return proc;
    } finally {
      this.isStarting = false;
    }
  }

  private cleanupWorker(): void {
    if (this.readline) {
      try {
        this.readline.close();
      } catch {}
      this.readline = null;
    }
    if (this.workerProcess) {
      try {
        if (!this.workerProcess.killed) {
          this.workerProcess.kill();
        }
      } catch {}
    }
    this.workerProcess = null;

    for (const [id, req] of this.pendingRequests.entries()) {
      clearTimeout(req.timer);
      req.reject(new Error("Worker terminated unexpectedly"));
    }
    this.pendingRequests.clear();
  }

  /** Unload Moonshine model from RAM */
  public async unload(): Promise<{ success: boolean }> {
    if (!this.workerProcess || this.workerProcess.killed) {
      return { success: true };
    }
    try {
      await this.sendCommand({ action: "unload" }, 5000);
      return { success: true };
    } catch {
      this.cleanupWorker();
      return { success: true };
    }
  }

  /** Shutdown worker completely */
  public async shutdown(): Promise<void> {
    this.cleanupWorker();
  }

  public get isWorkerRunning(): boolean {
    return Boolean(this.workerProcess && !this.workerProcess.killed);
  }
}
