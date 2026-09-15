import { app, BrowserWindow, shell, ipcMain, Notification, Menu, Tray, nativeImage, NativeImage, protocol, net, dialog, session } from "electron";
import { join, resolve } from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
// ipc-bridge is loaded dynamically (after process.chdir) so all its module-level
// process.cwd() constants resolve to the correct userData path.
import { getResolvedConfigYamlPath, getResolvedEnvPath } from "../core/config.js";
import { classifyError, ErrorCode } from "../core/error-handler.js";
import { initLogger, logger, getCurrentLogPath, getLogsDir } from "../core/logger.js";
import { PersonalMemoryManager } from "../core/personal-memory.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = resolve(__filename, "..");

// Ensure app identity and userData path name is explicitly "AI Plate"
app.name = "AI Plate";

// Register custom privileged scheme before app ready (standard web origin without file:// quirks)
protocol.registerSchemesAsPrivileged([
  {
    scheme: "app",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
      bypassCSP: true,
    },
  },
]);

// Native Hardware Acceleration & Responsiveness Flags
app.commandLine.appendSwitch("disable-renderer-backgrounding");
app.commandLine.appendSwitch("enable-gpu-rasterization");
app.commandLine.appendSwitch("enable-accelerated-2d-canvas");
app.commandLine.appendSwitch("high-dpi-support", "1");
app.commandLine.appendSwitch("force-color-profile", "srgb");

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;
let hasShownTrayNotification = false;

function showTrayBalloonOnce(): void {
  if (!hasShownTrayNotification && Notification.isSupported()) {
    hasShownTrayNotification = true;
    try {
      new Notification({
        title: "AI Plate",
        body: "AI Plate is running in the background. Click the system tray icon to open.",
        silent: true,
      }).show();
    } catch {}
  }
}

// Holds functions loaded from ipc-bridge after dynamic import
let _cleanSandboxOnShutdown: (() => void) | null = null;
let _stopAllCompanionsOnShutdown: (() => void) | null = null;
let setupIpcBridge: ((win: BrowserWindow) => void) | null = null;

// ─── Global Process Safety Nets ───────────────────────────────────────
// Catch any uncaught exception in the main process. Instead of showing
// Electron's raw crash dialog, we log the error and send a friendly toast
// to the renderer so the app keeps running.

function sendErrorToast(title: string, message: string): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    try {
      mainWindow.webContents.send("app:error-toast", { title, message });
    } catch {}
  }
}

process.on("uncaughtException", (err: Error) => {
  const appErr = classifyError(err);

  // EPERM on optional dirs is non-fatal — log and continue
  if ((err as any).code === "EPERM" || (err as any).code === "EACCES") {
    logger.warn("Process", `Non-fatal EPERM suppressed: ${err.message}`, { stack: err.stack });
    return;
  }

  // Abort errors are user-initiated — silent
  if (appErr.code === ErrorCode.ABORTED) return;

  logger.fatal("Process", `Uncaught exception: ${err.message}`, { stack: err.stack, code: appErr.code });
  console.error("[AI Plate] Uncaught Exception:", err);

  sendErrorToast(
    "Unexpected Error",
    appErr.recoverable
      ? appErr.message
      : `${appErr.message} The app may need to be restarted.`
  );
});

process.on("unhandledRejection", (reason: unknown) => {
  const appErr = classifyError(reason);

  // Silently swallow abort/cancellation rejections
  if (appErr.code === ErrorCode.ABORTED) return;

  const message = reason instanceof Error ? reason.message : String(reason);
  logger.error("Process", `Unhandled promise rejection: ${message}`, { code: appErr.code });
  console.error("[AI Plate] Unhandled Rejection:", reason);

  // Only surface user-facing toasts for unexpected errors (not network blips)
  if (appErr.code !== ErrorCode.NETWORK_ERROR && appErr.code !== ErrorCode.TIMEOUT) {
    sendErrorToast("Background Error", appErr.message);
  }
});

// Ensure Windows groups the process under AI Plate with its own taskbar identity and icon
if (process.platform === "win32") {
  app.setAppUserModelId("com.aiplate.app");
}

function getAppLogo(): NativeImage | undefined {
  const iconPaths = [
    resolve(__dirname, "../../build/icon.ico"),
    resolve(process.cwd(), "build/icon.ico"),
    resolve(__dirname, "../../ui/assets/icon.ico"),
    resolve(process.cwd(), "ui/assets/icon.ico"),
    resolve(__dirname, "../../ui/assets/logo.png"),
    resolve(process.cwd(), "ui/assets/logo.png"),
    resolve(__dirname, "../../build/icon.png"),
    resolve(process.cwd(), "build/icon.png"),
  ];
  for (const p of iconPaths) {
    if (existsSync(p)) {
      try {
        const img = nativeImage.createFromPath(p);
        if (!img.isEmpty()) return img;
      } catch {}
    }
  }
  return undefined;
}

// Helper to generate or load the tray icon
function createTrayIcon(): NativeImage {
  const appLogo = getAppLogo();
  if (appLogo) {
    return appLogo.resize({ width: 16, height: 16 });
  }

  // 32x32 AI Plate Neural Bolt SVG icon buffer
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
    <rect width="32" height="32" rx="7" fill="#09090b"/>
    <rect x="2" y="2" width="28" height="28" rx="6" fill="none" stroke="#6366f1" stroke-width="2"/>
    <path d="M17 5 L9 17 L15 17 L14 27 L23 14 L17 14 Z" fill="#38bdf8"/>
  </svg>`;
  return nativeImage.createFromBuffer(Buffer.from(svg));
}

function setupSystemTray() {
  if (tray) return;

  try {
    const icon = createTrayIcon();
    tray = new Tray(icon);
    tray.setToolTip("AI Plate — Open Power");

    const contextMenu = Menu.buildFromTemplate([
      {
        label: "Open AI Plate",
        click: () => {
          if (mainWindow) {
            if (!mainWindow.isVisible()) mainWindow.show();
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.focus();
          }
        },
      },
      { type: "separator" },
      {
        label: "New Chat",
        click: () => {
          if (mainWindow) {
            if (!mainWindow.isVisible()) mainWindow.show();
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.focus();
            mainWindow.webContents.send("action:new-chat");
          }
        },
      },
      {
        label: "Settings",
        click: () => {
          if (mainWindow) {
            if (!mainWindow.isVisible()) mainWindow.show();
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.focus();
            mainWindow.webContents.send("action:open-settings");
          }
        },
      },
      { type: "separator" },
      {
        label: "Quit AI Plate",
        click: () => {
          isQuitting = true;
          app.quit();
        },
      },
    ]);

    tray.setContextMenu(contextMenu);

    tray.on("click", () => {
      if (mainWindow) {
        if (mainWindow.isVisible()) {
          if (mainWindow.isFocused()) {
            mainWindow.hide();
          } else {
            mainWindow.focus();
          }
        } else {
          mainWindow.show();
          mainWindow.focus();
        }
      }
    });

    tray.on("double-click", () => {
      if (mainWindow) {
        if (!mainWindow.isVisible()) mainWindow.show();
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.focus();
      }
    });
  } catch (err) {
    console.error("[AI Plate Desktop] Failed to initialize system tray:", err);
  }
}

// Enforce single instance lock
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (!mainWindow.isVisible()) mainWindow.show();
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

async function createWindow() {
  const preloadPath = existsSync(join(__dirname, "preload.cjs"))
    ? join(__dirname, "preload.cjs")
    : resolve(process.cwd(), "electron/preload.cjs");

  const appLogo = getAppLogo() || createTrayIcon();

  mainWindow = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 980,
    minHeight: 640,
    backgroundColor: "#09090b",
    title: "AI Plate — Open Power",
    icon: appLogo,
    autoHideMenuBar: true,
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "hidden",
    titleBarOverlay: process.platform === "win32" ? {
      color: "#09090b",
      symbolColor: "#a1a1aa",
      height: 32,
    } : false,
    show: false,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      backgroundThrottling: false,
      spellcheck: false,
    },
  });

  if (appLogo && process.platform === "win32") {
    mainWindow.setIcon(appLogo);
  }

  // Explicitly remove window-level menu on Windows/Linux
  mainWindow.setMenu(null);

  // Disable default Electron / Chromium shortcuts (DevTools, Reload, Zoom, Fullscreen, Config)
  mainWindow.webContents.on("before-input-event", (event, input) => {
    if (input.type !== "keyDown") return;

    // 1. Block Reload: F5, Ctrl+R, Cmd+R, Ctrl+Shift+R, Cmd+Shift+R
    if (input.key === "F5" || ((input.control || input.meta) && input.key.toLowerCase() === "r")) {
      event.preventDefault();
      return;
    }

    // 2. DevTools: Allow F12 or Ctrl+Shift+I in development mode
    if (
      input.key === "F12" ||
      ((input.control || input.meta) && input.shift && (input.key.toLowerCase() === "i" || input.key.toLowerCase() === "j"))
    ) {
      if (!app.isPackaged) {
        mainWindow?.webContents.toggleDevTools();
      }
      event.preventDefault();
      return;
    }

    // 3. Block Zoom: Ctrl/Cmd + (+ / - / = / 0 / _)
    if (
      (input.control || input.meta) &&
      (input.key === "=" || input.key === "+" || input.key === "-" || input.key === "_" || input.key === "0")
    ) {
      event.preventDefault();
      return;
    }

    // 4. Block Fullscreen: F11
    if (input.key === "F11") {
      event.preventDefault();
      return;
    }

    // 5. Block System Configuration shortcut: Ctrl+, / Cmd+,
    if ((input.control || input.meta) && input.key === ",") {
      event.preventDefault();
      return;
    }
  });

  // Allow browser verification and OAuth popups (Puter, Google, Cloudflare, hCaptcha)
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (
      url.includes("puter.com") ||
      url.includes("accounts.google.com") ||
      url.includes("github.com/login") ||
      url.includes("hcaptcha.com") ||
      url.includes("recaptcha.net") ||
      url.includes("challenges.cloudflare.com") ||
      url.includes("turnstile") ||
      url.includes("auth") ||
      url.includes("login") ||
      url.includes("signin")
    ) {
      return {
        action: "allow",
        overrideBrowserWindowOptions: {
          width: 540,
          height: 720,
          autoHideMenuBar: true,
          parent: mainWindow || undefined,
          modal: true,
          webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: false,
          },
        },
      };
    }

    // Default: Open general web links in OS external browser
    if (url.startsWith("http://") || url.startsWith("https://")) {
      shell.openExternal(url);
    }
    return { action: "deny" };
  });

  // Grant audio / microphone capture permissions for local Moonshine STT
  const grantMedia = (permission: string) => {
    return permission === "media" || (permission as string) === "audioCapture";
  };

  session.defaultSession.setPermissionCheckHandler((_webContents, permission) => {
    if (grantMedia(permission)) return true;
    return true;
  });
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(true);
  });
  session.defaultSession.setDevicePermissionHandler(() => true);

  mainWindow.webContents.session.setPermissionCheckHandler((_webContents, permission) => {
    if (grantMedia(permission)) return true;
    return true;
  });
  mainWindow.webContents.session.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(true);
  });
  mainWindow.webContents.session.setDevicePermissionHandler(() => true);


  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith("app://") && !url.startsWith("file://")) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  const wasOpenedHidden =
    Boolean((app.getLoginItemSettings() as any).wasOpenedAsHidden) ||
    process.argv.includes("--hidden") ||
    process.argv.includes("--minimized");

  // Smooth appearance when ready (unless configured to launch hidden in tray)
  mainWindow.once("ready-to-show", () => {
    if (mainWindow && !wasOpenedHidden) {
      mainWindow.show();
      mainWindow.focus();
      mainWindow.webContents.focus();
    }
  });

  mainWindow.on("maximize", () => {
    mainWindow?.webContents.send("window-maximized-state", true);
  });

  mainWindow.on("unmaximize", () => {
    mainWindow?.webContents.send("window-maximized-state", false);
  });

  // Forward renderer console logs to disk logger for debugging (modern Electron signature)
  mainWindow.webContents.on("console-message", (event: any) => {
    const level = event?.level ?? 0;
    const message = event?.message ?? "";
    const line = event?.lineNumber ?? event?.line ?? 0;
    const sourceId = event?.sourceId ?? "";
    const src = sourceId ? sourceId.split(/[/\\]/).pop() : "renderer";
    logger.info("Renderer", `[L${level}] ${message} (${src}:${line})`);
  });

  // Configurable App Closing Mechanism
  mainWindow.on("close", (event) => {
    if (isQuitting) return;

    let closeAction = "tray";
    let confirmQuit = false;
    try {
      const pm = PersonalMemoryManager.getInstance();
      closeAction = pm.getGeneralSetting("close_action", "tray");
      confirmQuit = pm.getGeneralSetting("confirm_quit", "false") === "true";
    } catch (e) {
      console.warn("[AI Plate Desktop] Failed to query closing setting:", e);
    }

    if (closeAction === "quit") {
      if (confirmQuit) {
        event.preventDefault();
        const choice = dialog.showMessageBoxSync(mainWindow!, {
          type: "question",
          buttons: ["Quit AI Plate", "Cancel"],
          defaultId: 0,
          cancelId: 1,
          title: "Quit AI Plate",
          message: "Are you sure you want to quit AI Plate?",
          detail: "All background processes and active sessions will be terminated.",
          icon: getAppLogo() || undefined,
        });
        if (choice === 0) {
          isQuitting = true;
          app.quit();
        }
        return;
      }
      isQuitting = true;
      app.quit();
      return;
    }

    if (closeAction === "ask") {
      event.preventDefault();
      const choice = dialog.showMessageBoxSync(mainWindow!, {
        type: "question",
        buttons: ["Minimize to Tray", "Quit Completely", "Cancel"],
        defaultId: 0,
        cancelId: 2,
        title: "Close AI Plate",
        message: "What would you like to do with AI Plate?",
        detail: "You can keep AI Plate active in your notification tray or exit completely.",
        icon: getAppLogo() || undefined,
      });

      if (choice === 0) {
        mainWindow?.hide();
        showTrayBalloonOnce();
      } else if (choice === 1) {
        isQuitting = true;
        app.quit();
      }
      return;
    }

    // Default: "tray" (Keep running in background)
    event.preventDefault();
    mainWindow?.hide();
    showTrayBalloonOnce();
    return false;
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  // Wire up native IPC bridge handlers directly to mainWindow
  if (setupIpcBridge) {
    setupIpcBridge(mainWindow);
  }

  // Load UI through secure app:// protocol (Provides standard origin, eliminating file:// restrictions)
  await mainWindow.loadURL("app://local/index.html");
}

// ─── Setup Window Control IPC Handlers ────────────────────────────────

ipcMain.on("window-minimize", () => {
  if (mainWindow) mainWindow.minimize();
});

ipcMain.on("window-maximize", () => {
  if (mainWindow) {
    if (mainWindow.isMaximized()) mainWindow.unmaximize();
    else mainWindow.maximize();
  }
});

ipcMain.on("window-close", () => {
  if (mainWindow) mainWindow.close();
});

// Explicit quit handler from renderer / settings UI
ipcMain.handle("app:quit", async (_event, options?: { force?: boolean }) => {
  if (!options?.force) {
    let confirmQuit = false;
    try {
      const pm = PersonalMemoryManager.getInstance();
      confirmQuit = pm.getGeneralSetting("confirm_quit", "false") === "true";
    } catch {}
    if (confirmQuit && mainWindow && !mainWindow.isDestroyed()) {
      const choice = dialog.showMessageBoxSync(mainWindow, {
        type: "question",
        buttons: ["Quit AI Plate", "Cancel"],
        defaultId: 0,
        cancelId: 1,
        title: "Quit AI Plate",
        message: "Are you sure you want to quit AI Plate?",
        detail: "All active sessions and background services will be terminated.",
        icon: getAppLogo() || undefined,
      });
      if (choice !== 0) return false;
    }
  }
  isQuitting = true;
  app.quit();
  return true;
});

// System Startup & Login Item IPC Handlers
ipcMain.handle("system:get-startup-settings", () => {
  try {
    const loginItem = app.getLoginItemSettings() as any;
    let startMinimized = false;
    try {
      const pm = PersonalMemoryManager.getInstance();
      startMinimized = pm.getGeneralSetting("start_minimized", "false") === "true";
    } catch {}
    return {
      openAtLogin: !!loginItem.openAtLogin,
      openAsHidden: !!loginItem.openAsHidden || startMinimized,
    };
  } catch (e) {
    return { openAtLogin: false, openAsHidden: false };
  }
});

ipcMain.handle("system:set-startup-settings", (_event, payload: { openAtLogin: boolean; openAsHidden?: boolean }) => {
  try {
    const openAtLogin = !!payload.openAtLogin;
    const openAsHidden = !!payload.openAsHidden;
    (app.setLoginItemSettings as any)({
      openAtLogin,
      openAsHidden,
      args: openAsHidden ? ["--hidden"] : [],
    });
    try {
      const pm = PersonalMemoryManager.getInstance();
      pm.setGeneralSetting("launch_startup", String(openAtLogin));
      pm.setGeneralSetting("start_minimized", String(openAsHidden));
    } catch {}
    return { success: true, openAtLogin, openAsHidden };
  } catch (e: any) {
    logger.warn("App", `Failed to configure startup settings: ${e?.message || e}`);
    return { success: false, error: e?.message || String(e) };
  }
});

ipcMain.on("open-external", (_event, url: string) => {
  if (url && (url.startsWith("http://") || url.startsWith("https://"))) {
    shell.openExternal(url);
  }
});

ipcMain.on("show-notification", (_event, options: { title: string; body: string; silent?: boolean }) => {
  if (Notification.isSupported()) {
    new Notification({
      title: options.title || "AI Plate",
      body: options.body || "",
      silent: options.silent ?? false,
    }).show();
  }
});

ipcMain.on("set-title-bar-theme", (_event, payload: any) => {
  if (mainWindow && typeof (mainWindow as any).setTitleBarOverlay === "function" && process.platform === "win32") {
    if (typeof payload === "object" && payload !== null && payload.color) {
      mainWindow.setTitleBarOverlay({
        color: payload.color,
        symbolColor: payload.symbolColor || "#a1a1aa",
        height: 32,
      });
      try {
        mainWindow.setBackgroundColor(payload.color);
      } catch (e) {}
    } else if (payload === "light") {
      mainWindow.setTitleBarOverlay({
        color: "#f4f4f6",
        symbolColor: "#52525b",
        height: 32,
      });
      try {
        mainWindow.setBackgroundColor("#f4f4f6");
      } catch (e) {}
    } else {
      mainWindow.setTitleBarOverlay({
        color: "#09090b",
        symbolColor: "#a1a1aa",
        height: 32,
      });
      try {
        mainWindow.setBackgroundColor("#09090b");
      } catch (e) {}
    }
  }
});

ipcMain.handle("get-system-config-paths", async () => {
  return {
    configYamlPath: getResolvedConfigYamlPath(),
    envPath: getResolvedEnvPath(),
  };
});

// Health check — renderer calls this at startup to verify all subsystems
ipcMain.handle("health:check", () => {
  return {
    status: "ok",
    logPath: getCurrentLogPath(),
    logsDir: getLogsDir(),
    userData: app.getPath("userData"),
    version: app.getVersion(),
    platform: process.platform,
    cwd: process.cwd(),
  };
});

// Expose log file location to renderer for bug reports
ipcMain.handle("logs:get-path", () => ({
  logPath: getCurrentLogPath(),
  logsDir: getLogsDir(),
}));

ipcMain.handle("open-path-external", async (_event, targetPath: string) => {
  return shell.openPath(targetPath);
});

ipcMain.handle("show-item-in-folder", async (_event, targetPath: string) => {
  shell.showItemInFolder(targetPath);
  return true;
});

// ─── App Lifecycle ────────────────────────────────────────────────────

function setupApplicationMenu() {
  // Completely disable Electron application menu and all default menu accelerators
  Menu.setApplicationMenu(null);
}

app.whenReady().then(async () => {
  // ── Redirect writable CWD to userData (%APPDATA%\AI Plate) ──────────
  // When installed to C:\Program Files\, process.cwd() is read-only.
  // Switching to userData guarantees .sandbox/, artifacts/, and the
  // database are always created in a user-writable location.
  // IMPORTANT: chdir and env var MUST be set BEFORE dynamically importing
  // ipc-bridge, so all module-level process.cwd() constants in ipc-bridge,
  // plugin-manager, and connector-manager resolve to userData correctly.
  let userDataPath: string;
  try {
    process.env.AIPLATE_APP_ROOT = process.cwd();
    process.env.AIPLATE_APP_PATH = app.getAppPath();
    userDataPath = app.getPath("userData");
    const { mkdirSync: _mkdir } = await import("node:fs");
    _mkdir(userDataPath, { recursive: true });
    process.chdir(userDataPath);
    process.env.AIPLATE_USERDATA = userDataPath; // signal to core modules
  } catch (e) {
    userDataPath = process.cwd();
    process.env.AIPLATE_USERDATA = userDataPath;
    process.env.AIPLATE_APP_ROOT = process.cwd();
    process.env.AIPLATE_APP_PATH = app.getAppPath();
    console.warn("[AI Plate] Could not chdir to userData:", e);
  }

  // ── Initialize rotating file logger ─────────────────────────────────
  try {
    initLogger(join(userDataPath, "logs"));
    logger.info("App", `AI Plate starting up. userData=${userDataPath}`);
  } catch {}

  // ── Dynamically import ipc-bridge AFTER chdir ────────────────────────
  // This ensures all module-level constants in ipc-bridge.ts,
  // plugin-manager.ts, and connector-manager.ts that call process.cwd()
  // get the userData path, not the install directory.
  try {
    const ipcModule = await import("./ipc-bridge.js");
    setupIpcBridge = ipcModule.setupIpcBridge;
    _cleanSandboxOnShutdown = ipcModule.cleanSandboxOnShutdown;
    _stopAllCompanionsOnShutdown = ipcModule.stopAllCompanionsOnShutdown;
  } catch (err) {
    logger.fatal("App", `Failed to load IPC bridge: ${err}`);
    app.quit();
    return;
  }

  setupApplicationMenu();

  // Handle 'app://' protocol to serve local UI assets directly from disk / asar
  protocol.handle("app", (request) => {
    const url = new URL(request.url);
    const pathname = decodeURIComponent(url.pathname);

    // Direct serve for /api/artifacts/file or /api/media/file (supports <img src="...">, <video src="...">)
    if (pathname === "/api/artifacts/file" || pathname === "/api/media/file") {
      const name = url.searchParams.get("name") || "";
      const cleanName = name.replace(/^[/\\]+/, "").split(/[/\\]/).pop() || name;
      const candidateDirs = [
        resolve(app.getPath("userData"), "artifacts"),
        process.env.AIPLATE_USERDATA ? resolve(process.env.AIPLATE_USERDATA, "artifacts") : "",
        resolve(process.cwd(), "artifacts"),
      ].filter(Boolean);

      for (const dir of candidateDirs) {
        const target = resolve(dir, cleanName);
        if (existsSync(target)) {
          return net.fetch(pathToFileURL(target).toString());
        }
      }
      return new Response("File Not Found", { status: 404 });
    }

    // Direct serve for /api/sandbox/file (supports <img src="...">, <video src="...">)
    if (pathname === "/api/sandbox/file") {
      const name = url.searchParams.get("name") || "";
      const cleanName = name.replace(/^[/\\]+/, "").split(/[/\\]/).pop() || name;
      const candidateDirs = [
        resolve(app.getPath("userData"), ".sandbox"),
        process.env.AIPLATE_USERDATA ? resolve(process.env.AIPLATE_USERDATA, ".sandbox") : "",
        resolve(process.cwd(), ".sandbox"),
      ].filter(Boolean);

      for (const dir of candidateDirs) {
        const target = resolve(dir, cleanName);
        if (existsSync(target)) {
          return net.fetch(pathToFileURL(target).toString());
        }
      }
      return new Response("File Not Found", { status: 404 });
    }

    let p = pathname;
    if (p === "/" || !p) p = "/index.html";
    const relativePath = p.replace(/^\/+/, "");

    const possibleUiDirs = [
      resolve(__dirname, "../../ui"),
      resolve(process.cwd(), "ui"),
      (process as any).resourcesPath ? resolve((process as any).resourcesPath, "app.asar", "ui") : "",
      (process as any).resourcesPath ? resolve((process as any).resourcesPath, "ui") : "",
    ].filter(Boolean);

    const uiDir = possibleUiDirs.find((dir) => existsSync(dir)) || resolve(process.cwd(), "ui");
    const targetFile = resolve(uiDir, relativePath);

    if (existsSync(targetFile)) {
      return net.fetch(pathToFileURL(targetFile).toString());
    }
    return new Response("Not Found", { status: 404 });
  });

  try {
    await createWindow();
    setupSystemTray();

    app.on("activate", async () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        await createWindow();
      } else if (mainWindow) {
        if (!mainWindow.isVisible()) mainWindow.show();
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.focus();
      }
    });
  } catch (err) {
    console.error("[AI Plate Desktop] Fatal error during startup:", err);
    app.quit();
  }
});

app.on("before-quit", () => {
  isQuitting = true;
  if (_stopAllCompanionsOnShutdown) _stopAllCompanionsOnShutdown();
});

app.on("will-quit", () => {
  if (_stopAllCompanionsOnShutdown) _stopAllCompanionsOnShutdown();
  if (tray) {
    tray.destroy();
    tray = null;
  }
});

app.on("window-all-closed", async () => {
  if (isQuitting) {
    if (_stopAllCompanionsOnShutdown) _stopAllCompanionsOnShutdown();
    if (_cleanSandboxOnShutdown) _cleanSandboxOnShutdown();
    if (process.platform !== "darwin") {
      app.quit();
    }
  }
});
