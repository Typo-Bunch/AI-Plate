/**
 * High-Performance Local Kokoro TTS Service.
 *
 * Manages a persistent Python background worker executing `kokoro-onnx`
 * with native 24kHz audio synthesis, zero external dependencies,
 * automatic idle memory unloading, on-demand online model downloader,
 * and markdown text sanitization.
 */

import { spawn, type ChildProcess } from "node:child_process";
import { createInterface, type Interface } from "node:readline";
import { existsSync, mkdirSync, readFileSync, unlinkSync, createWriteStream, renameSync, statSync } from "node:fs";
import { resolve, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { PythonEngine } from "./python-engine.js";
import { logger } from "./logger.js";
import { CONFIG } from "./config.js";
import { convertLatexInText } from "./latex-speech.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

export const KOKORO_MODEL_URL =
  "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.onnx";
export const KOKORO_VOICES_URL =
  "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin";

export interface TTSSynthesizeOptions {
  voice?: string;
  speed?: number;
  lang?: string;
  returnBase64?: boolean;
}

export interface TTSSynthesisResult {
  success: boolean;
  id?: string;
  audioPath?: string;
  audioBase64?: string;
  duration?: number;
  sampleRate?: number;
  elapsedMs?: number;
  error?: string;
}

export interface KokoroVoiceInfo {
  id: string;
  name: string;
  gender: "female" | "male";
  accent: "American" | "British" | "Spanish" | "French" | "Italian" | "Japanese" | "Chinese" | "Other";
}

export interface TTSModelStatus {
  downloaded: boolean;
  modelPath: string | null;
  voicesPath: string | null;
  totalSizeBytes: number;
  available: boolean;
  isDownloading?: boolean;
  currentProgress?: TTSDownloadProgress | null;
}

export interface TTSDownloadProgress {
  file: string;
  step?: number;
  totalSteps?: number;
  percent: number;
  overallPercent?: number;
  downloadedBytes: number;
  totalBytes: number;
  overallDownloadedBytes?: number;
  overallTotalBytes?: number;
  speedMBs: number;
  statusText?: string;
}

interface PendingRequest {
  resolve: (res: any) => void;
  reject: (err: Error) => void;
  timer: NodeJS.Timeout;
}

export class TTSService {
  private static instance: TTSService | null = null;
  private workerProcess: ChildProcess | null = null;
  private readline: Interface | null = null;
  private pendingRequests: Map<string, PendingRequest> = new Map();
  private requestCounter: number = 0;
  private outputDir: string;
  private resolvedModelPath: string | null = null;
  private resolvedVoicesPath: string | null = null;
  private resolvedWorkerPath: string | null = null;
  private isStarting: boolean = false;
  private isDownloadingModel: boolean = false;
  private currentDownloadProgress: TTSDownloadProgress | null = null;

  private constructor() {
    const base = process.env.AIPLATE_USERDATA || process.cwd();
    this.outputDir = resolve(base, CONFIG.SHELL.SANDBOX_DIR || ".sandbox", "tts");
    try {
      if (!existsSync(this.outputDir)) {
        mkdirSync(this.outputDir, { recursive: true });
      }
    } catch {}

    this.resolvePaths();
  }

  public static getInstance(): TTSService {
    if (!TTSService.instance) {
      TTSService.instance = new TTSService();
    }
    return TTSService.instance;
  }

  /** Locate worker script and Kokoro ONNX model files across possible locations */
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
        join(b, "scripts", "kokoro-worker.py"),
        join(b, "kokoro-worker.py"),
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

    // 2. Model & Voices search locations (prioritize structured user data directory)
    const possibleModelDirs = [
      resolve(userDataDir, "models", "kokoro"),
      ...searchBases.map((b) => join(b, "models", "kokoro")),
      ...searchBases.map((b) => join(b, "models")),
      ...searchBases,
    ];

    for (const dir of possibleModelDirs) {
      const mCand = join(dir, "kokoro-v1.0.onnx");
      const vCand = join(dir, "voices-v1.0.bin");
      if (existsSync(mCand) && existsSync(vCand)) {
        this.resolvedModelPath = mCand;
        this.resolvedVoicesPath = vCand;
        break;
      }
    }
  }

  /** Current model download and storage status */
  public getModelStatus(): TTSModelStatus {
    this.resolvePaths();
    let totalSizeBytes = 0;
    try {
      if (this.resolvedModelPath && existsSync(this.resolvedModelPath)) {
        totalSizeBytes += statSync(this.resolvedModelPath).size;
      }
      if (this.resolvedVoicesPath && existsSync(this.resolvedVoicesPath)) {
        totalSizeBytes += statSync(this.resolvedVoicesPath).size;
      }
    } catch {}

    const downloaded = Boolean(
      this.resolvedModelPath &&
      existsSync(this.resolvedModelPath) &&
      this.resolvedVoicesPath &&
      existsSync(this.resolvedVoicesPath)
    );

    return {
      downloaded,
      modelPath: this.resolvedModelPath,
      voicesPath: this.resolvedVoicesPath,
      totalSizeBytes,
      available: this.isAvailable(),
      isDownloading: this.isDownloadingModel,
      currentProgress: this.currentDownloadProgress,
    };
  }

  /** Check if the TTS system (worker + models) is available */
  public isAvailable(): boolean {
    if (!this.resolvedWorkerPath || !this.resolvedModelPath || !this.resolvedVoicesPath) {
      this.resolvePaths();
    }
    return (
      Boolean(this.resolvedWorkerPath && existsSync(this.resolvedWorkerPath)) &&
      Boolean(this.resolvedModelPath && existsSync(this.resolvedModelPath)) &&
      Boolean(this.resolvedVoicesPath && existsSync(this.resolvedVoicesPath))
    );
  }

  /**
   * On-demand download of Kokoro model assets (~351MB total) from reliable GitHub Releases CDN.
   */
  public async downloadModel(
    onProgress?: (data: TTSDownloadProgress) => void
  ): Promise<{ success: boolean; error?: string }> {
    if (this.isDownloadingModel) {
      return { success: false, error: "Download is already in progress" };
    }

    this.isDownloadingModel = true;
    const userDataDir =
      process.env.AIPLATE_USERDATA ||
      (process.env.APPDATA ? join(process.env.APPDATA, "AI Plate") : null) ||
      process.cwd();
    const targetDir = resolve(userDataDir, "models", "kokoro");
    try {
      if (!existsSync(targetDir)) {
        mkdirSync(targetDir, { recursive: true });
      }

      const modelFile = join(targetDir, "kokoro-v1.0.onnx");
      const voicesFile = join(targetDir, "voices-v1.0.bin");

      // Approximate known sizes: voices ~28.2MB, onnx ~341.2MB -> total ~369.4MB
      const APPROX_VOICES_BYTES = 28_214_398;
      const APPROX_MODEL_BYTES = 341_200_000;
      const totalEstimatedBytes = APPROX_VOICES_BYTES + APPROX_MODEL_BYTES;

      const progressCallback = (data: TTSDownloadProgress) => {
        this.currentDownloadProgress = data;
        onProgress?.(data);
      };

      let voicesDownloaded = 0;
      let modelDownloaded = 0;

      // 1. Download voices-v1.0.bin (~28MB) first
      if (!existsSync(voicesFile)) {
        logger.info("TTS", "Downloading Kokoro voices asset...");
        voicesDownloaded = await this.downloadFileWithProgress({
          url: KOKORO_VOICES_URL,
          destPath: voicesFile,
          label: "voices-v1.0.bin",
          step: 1,
          totalSteps: 2,
          estimatedFileSize: APPROX_VOICES_BYTES,
          prevCompletedBytes: 0,
          totalAllFilesBytes: totalEstimatedBytes,
          onProgress: progressCallback,
        });
      } else {
        try {
          voicesDownloaded = statSync(voicesFile).size;
        } catch {
          voicesDownloaded = APPROX_VOICES_BYTES;
        }
      }

      // 2. Download kokoro-v1.0.onnx (~341MB)
      if (!existsSync(modelFile)) {
        logger.info("TTS", "Downloading Kokoro ONNX model asset...");
        modelDownloaded = await this.downloadFileWithProgress({
          url: KOKORO_MODEL_URL,
          destPath: modelFile,
          label: "kokoro-v1.0.onnx",
          step: 2,
          totalSteps: 2,
          estimatedFileSize: APPROX_MODEL_BYTES,
          prevCompletedBytes: voicesDownloaded,
          totalAllFilesBytes: voicesDownloaded + APPROX_MODEL_BYTES,
          onProgress: progressCallback,
        });
      } else {
        try {
          modelDownloaded = statSync(modelFile).size;
        } catch {
          modelDownloaded = APPROX_MODEL_BYTES;
        }
      }

      this.resolvePaths();
      logger.info("TTS", "Kokoro model assets downloaded successfully");

      const finalProgress: TTSDownloadProgress = {
        file: "kokoro-v1.0.onnx",
        step: 2,
        totalSteps: 2,
        percent: 100,
        overallPercent: 100,
        downloadedBytes: modelDownloaded,
        totalBytes: modelDownloaded,
        overallDownloadedBytes: voicesDownloaded + modelDownloaded,
        overallTotalBytes: voicesDownloaded + modelDownloaded,
        speedMBs: 0,
        statusText: "Download complete! Models are ready.",
      };
      this.currentDownloadProgress = finalProgress;
      onProgress?.(finalProgress);

      return { success: true };
    } catch (err: any) {
      logger.error("TTS", `Failed to download Kokoro models: ${err.message}`);
      return { success: false, error: err.message };
    } finally {
      this.isDownloadingModel = false;
      this.currentDownloadProgress = null;
    }
  }

  private async downloadFileWithProgress(opts: {
    url: string;
    destPath: string;
    label: string;
    step: number;
    totalSteps: number;
    estimatedFileSize: number;
    prevCompletedBytes: number;
    totalAllFilesBytes: number;
    onProgress?: (data: TTSDownloadProgress) => void;
  }): Promise<number> {
    const {
      url,
      destPath,
      label,
      step,
      totalSteps,
      estimatedFileSize,
      prevCompletedBytes,
      totalAllFilesBytes,
      onProgress,
    } = opts;

    // Immediately emit 0% "Connecting" status
    onProgress?.({
      file: label,
      step,
      totalSteps,
      percent: 0,
      overallPercent: Math.min(99, Math.round((prevCompletedBytes / totalAllFilesBytes) * 100)),
      downloadedBytes: 0,
      totalBytes: estimatedFileSize,
      overallDownloadedBytes: prevCompletedBytes,
      overallTotalBytes: totalAllFilesBytes,
      speedMBs: 0,
      statusText: `Connecting to CDN for ${label}...`,
    });

    const res = await fetch(url, { redirect: "follow" });
    if (!res.ok || !res.body) {
      throw new Error(`Failed to download ${label}: HTTP ${res.status} ${res.statusText}`);
    }

    const contentLenHeader = Number(res.headers.get("content-length"));
    const fileTotalBytes = contentLenHeader > 0 ? contentLenHeader : estimatedFileSize;
    const actualTotalAllBytes = prevCompletedBytes + fileTotalBytes;

    const tempPath = `${destPath}.tmp_${Date.now()}`;
    const fileStream = createWriteStream(tempPath);

    let downloadedBytes = 0;
    let lastTime = Date.now();
    let lastBytes = 0;
    let speedMBs = 0;

    const reader = res.body.getReader();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          downloadedBytes += value.length;
          fileStream.write(Buffer.from(value));

          const now = Date.now();
          if (now - lastTime >= 200) {
            const bytesDiff = downloadedBytes - lastBytes;
            const timeDiff = Math.max(0.05, (now - lastTime) / 1000);
            speedMBs = Math.round((bytesDiff / timeDiff / (1024 * 1024)) * 10) / 10;
            lastTime = now;
            lastBytes = downloadedBytes;

            const percent = fileTotalBytes > 0 ? Math.min(100, Math.round((downloadedBytes / fileTotalBytes) * 100)) : 0;
            const currentOverallDownloaded = prevCompletedBytes + downloadedBytes;
            const overallPercent = actualTotalAllBytes > 0 ? Math.min(100, Math.round((currentOverallDownloaded / actualTotalAllBytes) * 100)) : percent;

            onProgress?.({
              file: label,
              step,
              totalSteps,
              percent,
              overallPercent,
              downloadedBytes,
              totalBytes: fileTotalBytes,
              overallDownloadedBytes: currentOverallDownloaded,
              overallTotalBytes: actualTotalAllBytes,
              speedMBs,
              statusText: `Downloading ${label} (${step}/${totalSteps})...`,
            });
          }
        }
      }

      await new Promise<void>((resolve, reject) => {
        fileStream.end((err?: Error | null) => (err ? reject(err) : resolve()));
      });

      if (existsSync(destPath)) {
        try {
          unlinkSync(destPath);
        } catch {}
      }
      renameSync(tempPath, destPath);

      const currentOverallDownloaded = prevCompletedBytes + downloadedBytes;
      const overallPercent = actualTotalAllBytes > 0 ? Math.min(100, Math.round((currentOverallDownloaded / actualTotalAllBytes) * 100)) : 100;

      onProgress?.({
        file: label,
        step,
        totalSteps,
        percent: 100,
        overallPercent,
        downloadedBytes,
        totalBytes: fileTotalBytes,
        overallDownloadedBytes: currentOverallDownloaded,
        overallTotalBytes: actualTotalAllBytes,
        speedMBs: 0,
        statusText: `Completed ${label} (${step}/${totalSteps})`,
      });

      return downloadedBytes;
    } catch (err) {
      try {
        fileStream.destroy();
      } catch {}
      if (existsSync(tempPath)) {
        try {
          unlinkSync(tempPath);
        } catch {}
      }
      throw err;
    }
  }

  /** Delete downloaded model files to free disk space */
  public async deleteModel(): Promise<{ success: boolean; error?: string }> {
    await this.unload();
    try {
      if (this.resolvedModelPath && existsSync(this.resolvedModelPath)) {
        unlinkSync(this.resolvedModelPath);
      }
      if (this.resolvedVoicesPath && existsSync(this.resolvedVoicesPath)) {
        unlinkSync(this.resolvedVoicesPath);
      }
      this.resolvedModelPath = null;
      this.resolvedVoicesPath = null;
      this.resolvePaths();
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  /** Start or retrieve active Python worker process */
  private async ensureWorker(): Promise<ChildProcess> {
    if (this.workerProcess && !this.workerProcess.killed && this.workerProcess.exitCode === null) {
      return this.workerProcess;
    }

    if (this.isStarting) {
      await new Promise((r) => setTimeout(r, 200));
      return this.ensureWorker();
    }

    this.isStarting = true;
    try {
      this.resolvePaths();
      if (!this.isAvailable()) {
        throw new Error(
          `Kokoro TTS model assets missing. Please download the Kokoro model files on-demand in Plugins & Tools > Kokoro TTS.`
        );
      }

      const pythonEngine = PythonEngine.getInstance();
      let pythonPath = pythonEngine.executable;
      if (!pythonEngine.isAvailable || pythonPath === "python") {
        try {
          pythonPath = await pythonEngine.initialize();
        } catch {}
      }

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

      logger.info("TTS", `Starting Kokoro TTS worker with: ${pythonPath}`);

      const proc = spawn(pythonPath, [this.resolvedWorkerPath!], {
        stdio: ["pipe", "pipe", "pipe"],
        windowsHide: true,
        env: {
          ...process.env,
          PYTHONIOENCODING: "utf-8",
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
          }
        } catch (err) {
          logger.warn("TTS", `Error parsing worker message: ${line}`);
        }
      });

      proc.stderr?.on("data", (data: Buffer) => {
        const errStr = data.toString("utf-8").trim();
        if (errStr) {
          logger.debug("TTS", `[Worker stderr] ${errStr}`);
        }
      });

      proc.on("error", (err) => {
        logger.error("TTS", `Worker process error: ${err.message}`);
        this.cleanupWorker();
      });

      proc.on("exit", (code, signal) => {
        logger.info("TTS", `Worker process exited (code=${code}, signal=${signal})`);
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
      req.reject(new Error("Kokoro TTS worker process terminated unexpectedly"));
    }
    this.pendingRequests.clear();
  }

  private async sendCommand(command: Record<string, any>, timeoutMs: number = 30000): Promise<any> {
    const proc = await this.ensureWorker();
    const reqId = `tts_${Date.now()}_${++this.requestCounter}`;
    command.id = reqId;
    command.model_path = this.resolvedModelPath;
    command.voices_path = this.resolvedVoicesPath;

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(reqId);
        reject(new Error(`TTS command '${command.action}' timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      this.pendingRequests.set(reqId, { resolve, reject, timer });

      try {
        proc.stdin!.write(JSON.stringify(command) + "\n");
      } catch (err: any) {
        clearTimeout(timer);
        this.pendingRequests.delete(reqId);
        reject(new Error(`Failed to write to TTS worker: ${err.message}`));
      }
    });
  }

  public sanitizeTextForSpeech(text: string): string {
    if (!text || typeof text !== "string") return "";

    let sanitized = text;

    // 1. Replace multi-line fenced code blocks with spoken notice
    sanitized = sanitized.replace(/```[\s\S]*?```/g, " [Code snippet provided in chat] ");

    // 2. Replace inline code
    sanitized = sanitized.replace(/`([^`]+)`/g, "$1");

    // 3. Convert Mathematical LaTeX expressions ($...$, $$...$$, \[...\], \frac, \sqrt, etc.) to human-readable spoken words
    sanitized = convertLatexInText(sanitized);

    // 4. Remove markdown images
    sanitized = sanitized.replace(/!\[([^\]]*)\]\([^)]+\)/g, "");

    // 4. Convert markdown links [text](url) -> text
    sanitized = sanitized.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");

    // 5. Remove HTML tags
    sanitized = sanitized.replace(/<[^>]+>/g, "");

    // 6. Remove markdown tables
    sanitized = sanitized.replace(/^\|.*\|$/gm, "");

    // 7. Remove markdown headers (#)
    sanitized = sanitized.replace(/^#{1,6}\s+/gm, "");

    // 8. Remove blockquotes (>)
    sanitized = sanitized.replace(/^>\s+/gm, "");

    // 9. Remove bullet asterisks/dashes
    sanitized = sanitized.replace(/^\s*[-*+]\s+/gm, "");

    // 10. Remove bold / italic markers
    sanitized = sanitized.replace(/[*_]{1,3}([^*_]+)[*_]{1,3}/g, "$1");

    // 11. Normalize excess whitespace
    sanitized = sanitized.replace(/\r\n/g, "\n");
    sanitized = sanitized.replace(/\n{2,}/g, ". ");
    sanitized = sanitized.replace(/\n/g, " ");
    sanitized = sanitized.replace(/\s{2,}/g, " ");

    return sanitized.trim();
  }

  public async synthesize(
    text: string,
    options: TTSSynthesizeOptions = {}
  ): Promise<TTSSynthesisResult> {
    const rawClean = this.sanitizeTextForSpeech(text);
    if (!rawClean) {
      return { success: false, error: "No readable speech content in text" };
    }

    if (!this.isAvailable()) {
      return {
        success: false,
        error: "Kokoro TTS model assets not found. Download the model on-demand under Plugins & Tools > Kokoro TTS.",
      };
    }

    const voice = options.voice || "af_heart";
    const speed = Math.max(0.5, Math.min(2.0, options.speed ?? 1.0));
    const lang = options.lang || "en-us";

    if (!existsSync(this.outputDir)) {
      mkdirSync(this.outputDir, { recursive: true });
    }

    const audioFilename = `tts_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.wav`;
    const outputPath = resolve(this.outputDir, audioFilename);

    try {
      const resp = await this.sendCommand(
        {
          action: "synthesize",
          text: rawClean,
          voice,
          speed,
          lang,
          output_path: outputPath,
        },
        45000
      );

      if (resp.status !== "ok") {
        return { success: false, error: resp.error || "Synthesis failed" };
      }

      let audioBase64: string | undefined;
      if (options.returnBase64 !== false && existsSync(outputPath)) {
        const buf = readFileSync(outputPath);
        audioBase64 = buf.toString("base64");
      }

      return {
        success: true,
        id: resp.id,
        audioPath: outputPath,
        audioBase64,
        duration: resp.duration,
        sampleRate: resp.sample_rate ?? resp.sampleRate ?? 24000,
        elapsedMs: resp.elapsed_ms,
      };
    } catch (err: any) {
      logger.error("TTS", `Synthesis error: ${err.message}`);
      return { success: false, error: err.message };
    }
  }

  public async getVoices(): Promise<KokoroVoiceInfo[]> {
    if (this.isAvailable()) {
      try {
        const resp = await this.sendCommand({ action: "get_voices" }, 15000);
        if (resp.status === "ok" && Array.isArray(resp.voices)) {
          return resp.voices.map((id: string) => this.categorizeVoice(id));
        }
      } catch (err: any) {
        logger.warn("TTS", `Failed to get voices from worker: ${err.message}`);
      }
    }

    const standardVoices = [
      "af_heart", "af_bella", "af_nicole", "af_sarah", "af_sky", "af_alloy", "af_aoede", "af_jessica", "af_kore", "af_river",
      "am_adam", "am_michael", "am_echo", "am_eric", "am_fenrir", "am_liam", "am_onyx", "am_puck", "am_santa",
      "bf_emma", "bf_isabella", "bf_alice", "bf_lily",
      "bm_george", "bm_fable", "bm_daniel", "bm_lewis",
      "ef_dora", "em_alex", "ff_siwis", "if_sara", "im_nicola", "jf_alpha", "zf_xiaobei"
    ];

    return standardVoices.map((id) => this.categorizeVoice(id));
  }

  private categorizeVoice(id: string): KokoroVoiceInfo {
    const gender: "female" | "male" = id.includes("m_") || id.startsWith("m") ? "male" : "female";
    let accent: KokoroVoiceInfo["accent"] = "American";

    if (id.startsWith("bf") || id.startsWith("bm")) accent = "British";
    else if (id.startsWith("ef") || id.startsWith("em")) accent = "Spanish";
    else if (id.startsWith("ff")) accent = "French";
    else if (id.startsWith("if") || id.startsWith("im")) accent = "Italian";
    else if (id.startsWith("jf") || id.startsWith("jm")) accent = "Japanese";
    else if (id.startsWith("zf") || id.startsWith("zm")) accent = "Chinese";

    const rawName = id.replace(/^[a-z]{2}_/, "");
    const friendlyName = rawName.charAt(0).toUpperCase() + rawName.slice(1);

    return {
      id,
      name: `${friendlyName} (${accent} ${gender === "female" ? "Female" : "Male"})`,
      gender,
      accent,
    };
  }

  public get isWorkerRunning(): boolean {
    return Boolean(this.workerProcess && !this.workerProcess.killed && this.workerProcess.exitCode === null);
  }

  public async unload(): Promise<void> {
    try {
      if (this.workerProcess && !this.workerProcess.killed) {
        await this.sendCommand({ action: "exit" }, 1500).catch(() => {});
      }
    } catch {}
    this.cleanupWorker();
  }

  public async shutdown(): Promise<void> {
    await this.unload();
  }
}
