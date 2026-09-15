/**
 * Rotating File Logger — AI Plate
 *
 * Writes structured log entries to %APPDATA%\AI Plate\logs\.
 * Rotates daily and keeps a rolling 7-day window of log files.
 * Used by the global error handlers in main.ts so that bugs can be
 * diagnosed from persisted logs even without DevTools access.
 */

import { appendFileSync, existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from "node:fs";
import { join } from "node:path";

// ─── Config ───────────────────────────────────────────────────────────

const MAX_LOG_FILES = 7;          // Keep 7 days of logs
const MAX_LOG_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB per file before forced rotation

// ─── Logger State ─────────────────────────────────────────────────────

let logsDir: string | null = null;
let currentLogPath: string | null = null;
let initialized = false;

// ─── Initialization ───────────────────────────────────────────────────

/**
 * Initialize the logger with the given directory (call once at app startup).
 * @param logsDirPath Absolute path to the logs directory (e.g. app.getPath('userData') + '/logs')
 */
export function initLogger(logsDirPath: string): void {
  try {
    logsDir = logsDirPath;
    mkdirSync(logsDir, { recursive: true });
    currentLogPath = join(logsDir, getLogFileName());
    initialized = true;
    pruneOldLogs();
    writeEntry("INFO", "Logger", "─── AI Plate session started ───");
  } catch {
    // Logger init must never crash the app
    initialized = false;
  }
}

// ─── Core Write ───────────────────────────────────────────────────────

/**
 * Write a structured log entry to the current log file.
 */
export function logToFile(
  level: "DEBUG" | "INFO" | "WARN" | "ERROR" | "FATAL",
  category: string,
  message: string,
  extra?: Record<string, unknown>
): void {
  if (!initialized || !currentLogPath) return;

  try {
    // Rotate if file is too large
    rotatIfNeeded();

    writeEntry(level, category, message, extra);
  } catch {
    // Logging must never throw
  }
}

// ─── Convenience Shortcuts ────────────────────────────────────────────

export const logger = {
  debug: (category: string, message: string, extra?: Record<string, unknown>) =>
    logToFile("DEBUG", category, message, extra),
  info: (category: string, message: string, extra?: Record<string, unknown>) =>
    logToFile("INFO", category, message, extra),
  warn: (category: string, message: string, extra?: Record<string, unknown>) =>
    logToFile("WARN", category, message, extra),
  error: (category: string, message: string, extra?: Record<string, unknown>) =>
    logToFile("ERROR", category, message, extra),
  fatal: (category: string, message: string, extra?: Record<string, unknown>) =>
    logToFile("FATAL", category, message, extra),
};

// ─── Internal Helpers ─────────────────────────────────────────────────

function getLogFileName(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `ai-plate-${y}-${m}-${day}.log`;
}

function writeEntry(
  level: string,
  category: string,
  message: string,
  extra?: Record<string, unknown>
): void {
  if (!currentLogPath) return;
  const ts = new Date().toISOString();
  const extraStr = extra ? " " + JSON.stringify(extra) : "";
  const line = `[${ts}] [${level.padEnd(5)}] [${category}] ${message}${extraStr}\n`;
  appendFileSync(currentLogPath, line, "utf-8");
}

function rotatIfNeeded(): void {
  if (!currentLogPath || !logsDir) return;

  // Switch log file if date changed (new day)
  const expectedName = getLogFileName();
  const expectedPath = join(logsDir, expectedName);
  if (currentLogPath !== expectedPath) {
    currentLogPath = expectedPath;
    pruneOldLogs();
    return;
  }

  // Force rotate if current file exceeds size limit
  if (existsSync(currentLogPath)) {
    try {
      const stat = statSync(currentLogPath);
      if (stat.size > MAX_LOG_SIZE_BYTES) {
        const ts = Date.now();
        currentLogPath = join(logsDir, `ai-plate-overflow-${ts}.log`);
        pruneOldLogs();
      }
    } catch {}
  }
}

function pruneOldLogs(): void {
  if (!logsDir) return;
  try {
    const files = readdirSync(logsDir)
      .filter((f) => f.startsWith("ai-plate-") && f.endsWith(".log"))
      .map((f) => ({ name: f, path: join(logsDir!, f), mtime: statSync(join(logsDir!, f)).mtime.getTime() }))
      .sort((a, b) => b.mtime - a.mtime);

    // Delete files beyond MAX_LOG_FILES
    for (const file of files.slice(MAX_LOG_FILES)) {
      try { unlinkSync(file.path); } catch {}
    }
  } catch {}
}

/**
 * Get the path to the current log file (for display in UI / bug reports).
 */
export function getCurrentLogPath(): string | null {
  return currentLogPath;
}

/**
 * Get the logs directory path.
 */
export function getLogsDir(): string | null {
  return logsDir;
}
