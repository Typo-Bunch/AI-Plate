/**
 * Centralized Error Handler — AI Plate
 *
 * Provides a unified error taxonomy, classification, and serialization
 * layer for the entire application. All layers (IPC bridge, orchestrator,
 * plugins, connectors) use this module so errors are consistent,
 * structured, and never leak raw Node.js stack traces to the renderer.
 */

// ─── Error Codes ──────────────────────────────────────────────────────

export enum ErrorCode {
  // Permission / filesystem
  PERMISSION_DENIED = "PERMISSION_DENIED",
  FILE_NOT_FOUND = "FILE_NOT_FOUND",
  FILE_READ_ERROR = "FILE_READ_ERROR",
  FILE_WRITE_ERROR = "FILE_WRITE_ERROR",

  // Network / API
  API_KEY_INVALID = "API_KEY_INVALID",
  API_RATE_LIMITED = "API_RATE_LIMITED",
  API_QUOTA_EXCEEDED = "API_QUOTA_EXCEEDED",
  NETWORK_ERROR = "NETWORK_ERROR",
  TIMEOUT = "TIMEOUT",
  SERVICE_UNAVAILABLE = "SERVICE_UNAVAILABLE",

  // Plugin / Connector
  PLUGIN_LOAD_FAILED = "PLUGIN_LOAD_FAILED",
  PLUGIN_NOT_FOUND = "PLUGIN_NOT_FOUND",
  CONNECTOR_FAILED = "CONNECTOR_FAILED",
  CONNECTOR_NOT_FOUND = "CONNECTOR_NOT_FOUND",

  // Database
  DB_ERROR = "DB_ERROR",
  DB_LOCKED = "DB_LOCKED",

  // Validation
  VALIDATION_ERROR = "VALIDATION_ERROR",
  MISSING_REQUIRED_FIELD = "MISSING_REQUIRED_FIELD",
  INVALID_FORMAT = "INVALID_FORMAT",
  PAYLOAD_TOO_LARGE = "PAYLOAD_TOO_LARGE",

  // Runtime
  ABORTED = "ABORTED",
  EXECUTION_FAILED = "EXECUTION_FAILED",
  INITIALIZATION_FAILED = "INITIALIZATION_FAILED",

  // Unknown
  UNKNOWN = "UNKNOWN",
}

// ─── Severity Levels ──────────────────────────────────────────────────

export type ErrorSeverity = "fatal" | "error" | "warning" | "info";

// ─── AppError Class ───────────────────────────────────────────────────

export class AppError extends Error {
  public readonly code: ErrorCode;
  public readonly severity: ErrorSeverity;
  public readonly recoverable: boolean;
  public readonly context?: Record<string, unknown>;
  public readonly originalError?: unknown;
  public readonly timestamp: string;

  constructor(options: {
    code: ErrorCode;
    message: string;
    severity?: ErrorSeverity;
    recoverable?: boolean;
    context?: Record<string, unknown>;
    originalError?: unknown;
  }) {
    super(options.message);
    this.name = "AppError";
    this.code = options.code;
    this.severity = options.severity ?? "error";
    this.recoverable = options.recoverable ?? true;
    this.context = options.context;
    this.originalError = options.originalError;
    this.timestamp = new Date().toISOString();

    // Preserve original stack trace if available
    if (options.originalError instanceof Error && options.originalError.stack) {
      this.stack = `${this.stack}\nCaused by: ${options.originalError.stack}`;
    }
  }
}

// ─── Error Classification ─────────────────────────────────────────────

/**
 * Classify a raw unknown error into a structured AppError.
 * Detects common Node.js error codes and API error patterns.
 */
export function classifyError(err: unknown, context?: Record<string, unknown>): AppError {
  if (err instanceof AppError) return err;

  const message = err instanceof Error ? err.message : String(err ?? "Unknown error");
  const nodeCode = (err as any)?.code as string | undefined;

  // ── Abort / User-cancelled ──────────────────────────────────────────
  if (
    message.includes("AbortError") ||
    message.includes("The operation was aborted") ||
    message.includes("aborted") ||
    nodeCode === "ABORT_ERR"
  ) {
    return new AppError({
      code: ErrorCode.ABORTED,
      message: "Operation was cancelled.",
      severity: "info",
      recoverable: true,
      originalError: err,
      context,
    });
  }

  // ── Permission / Filesystem ─────────────────────────────────────────
  if (nodeCode === "EPERM" || nodeCode === "EACCES") {
    return new AppError({
      code: ErrorCode.PERMISSION_DENIED,
      message: `Permission denied: ${message}`,
      severity: "error",
      recoverable: false,
      originalError: err,
      context,
    });
  }
  if (nodeCode === "ENOENT") {
    return new AppError({
      code: ErrorCode.FILE_NOT_FOUND,
      message: `File not found: ${message}`,
      severity: "warning",
      recoverable: true,
      originalError: err,
      context,
    });
  }
  if (nodeCode === "EBUSY" || nodeCode === "ELOCKED") {
    return new AppError({
      code: ErrorCode.DB_LOCKED,
      message: `Resource is locked or busy: ${message}`,
      severity: "warning",
      recoverable: true,
      originalError: err,
      context,
    });
  }
  if (nodeCode === "EMFILE" || nodeCode === "ENOSPC") {
    return new AppError({
      code: ErrorCode.FILE_WRITE_ERROR,
      message: `Filesystem error: ${message}`,
      severity: "error",
      recoverable: false,
      originalError: err,
      context,
    });
  }

  // ── API Key / Auth ──────────────────────────────────────────────────
  if (
    message.includes("API key not valid") ||
    message.includes("API_KEY_INVALID") ||
    message.includes("invalid_api_key") ||
    message.includes("Incorrect API key") ||
    message.includes("401") ||
    message.includes("403") ||
    message.includes("authentication") ||
    message.includes("unauthorized") ||
    message.includes("permission_denied")
  ) {
    return new AppError({
      code: ErrorCode.API_KEY_INVALID,
      message: "Invalid or missing API key. Please check your settings.",
      severity: "error",
      recoverable: true,
      originalError: err,
      context,
    });
  }

  // ── Rate Limit ──────────────────────────────────────────────────────
  if (
    message.includes("429") ||
    message.includes("rate_limit") ||
    message.includes("rate limit") ||
    message.includes("Too Many Requests")
  ) {
    return new AppError({
      code: ErrorCode.API_RATE_LIMITED,
      message: "Rate limit exceeded. Please wait a moment before retrying.",
      severity: "warning",
      recoverable: true,
      originalError: err,
      context,
    });
  }

  // ── Quota / Billing ─────────────────────────────────────────────────
  if (
    message.includes("quota") ||
    message.includes("billing") ||
    message.includes("insufficient_quota") ||
    message.includes("402")
  ) {
    return new AppError({
      code: ErrorCode.API_QUOTA_EXCEEDED,
      message: "API quota or billing limit reached. Please check your account.",
      severity: "error",
      recoverable: false,
      originalError: err,
      context,
    });
  }

  // ── Network / Connectivity ──────────────────────────────────────────
  if (
    nodeCode === "ECONNREFUSED" ||
    nodeCode === "ECONNRESET" ||
    nodeCode === "ENOTFOUND" ||
    nodeCode === "ECONNABORTED" ||
    message.includes("fetch failed") ||
    message.includes("ECONNREFUSED") ||
    message.includes("network") ||
    message.includes("ERR_NETWORK") ||
    message.includes("Failed to fetch")
  ) {
    return new AppError({
      code: ErrorCode.NETWORK_ERROR,
      message: "Network connection error. Please check your internet connection.",
      severity: "error",
      recoverable: true,
      originalError: err,
      context,
    });
  }

  // ── Timeout ─────────────────────────────────────────────────────────
  if (
    message.includes("timeout") ||
    message.includes("ETIMEDOUT") ||
    message.includes("timed out") ||
    nodeCode === "ETIMEDOUT"
  ) {
    return new AppError({
      code: ErrorCode.TIMEOUT,
      message: "Request timed out. The service may be slow or unavailable.",
      severity: "warning",
      recoverable: true,
      originalError: err,
      context,
    });
  }

  // ── Service Unavailable ─────────────────────────────────────────────
  if (message.includes("503") || message.includes("502") || message.includes("Service Unavailable")) {
    return new AppError({
      code: ErrorCode.SERVICE_UNAVAILABLE,
      message: "Service temporarily unavailable. Please try again later.",
      severity: "warning",
      recoverable: true,
      originalError: err,
      context,
    });
  }

  // ── Database ────────────────────────────────────────────────────────
  if (
    message.includes("SQLITE") ||
    message.includes("database") ||
    message.toLowerCase().includes("sql")
  ) {
    return new AppError({
      code: ErrorCode.DB_ERROR,
      message: `Database error: ${message}`,
      severity: "error",
      recoverable: true,
      originalError: err,
      context,
    });
  }

  // ── Fallback Unknown ────────────────────────────────────────────────
  return new AppError({
    code: ErrorCode.UNKNOWN,
    message: message || "An unexpected error occurred.",
    severity: "error",
    recoverable: true,
    originalError: err,
    context,
  });
}

// ─── IPC Serialization ────────────────────────────────────────────────

/**
 * Serialize any error into a safe, structured IPC response object.
 * Never exposes raw stack traces or internal paths to the renderer.
 */
export function formatForIPC(err: unknown): {
  success: false;
  error: string;
  code: ErrorCode;
  severity: ErrorSeverity;
  recoverable: boolean;
} {
  const appError = classifyError(err);
  return {
    success: false,
    error: appError.message,
    code: appError.code,
    severity: appError.severity,
    recoverable: appError.recoverable,
  };
}

/**
 * Create a quick validation error for IPC input validation.
 */
export function validationError(message: string): AppError {
  return new AppError({
    code: ErrorCode.VALIDATION_ERROR,
    message,
    severity: "warning",
    recoverable: true,
  });
}
