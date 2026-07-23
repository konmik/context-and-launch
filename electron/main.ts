import { app, BrowserWindow, ipcMain, nativeTheme, net, protocol, screen } from "electron";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { startServer, type ServerHandle } from "./server-adapter.js";
import {
  paletteBackground,
  isPaletteName,
  DEFAULT_PALETTE,
  type PaletteName,
} from "../src/components/shared/palette-pure.js";
import {
  isDarkMode,
  parseMode,
  type AppMode,
} from "../src/components/shared/theme-toggle-pure.js";
import {
  APP_SCHEME,
  APP_ORIGIN,
  toServerUrl,
  toServerHeaders,
  rewriteRedirect,
  appearanceArgs,
} from "./app-protocol.js";
import {
  migrateWindowState,
  restoreEntries,
  cascadeFrom,
  addSessionWindow,
  updateSessionWindow,
  closeSessionWindow,
  recordFocus,
  removeFromFocusOrder,
  mostRecentlyFocusedId,
  toWindowStateEntries,
  projectSlugFromUrl,
  DEFAULT_WINDOW_WIDTH,
  DEFAULT_WINDOW_HEIGHT,
  type WindowBounds,
  type WindowStateEntry,
  type SessionWindow,
} from "./window-bookkeeping.js";

const electronDir = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(electronDir, "..");
const preloadPath = path.join(electronDir, "preload.cjs");
process.env.CONTEXT_LAUNCH_CONFIG_DEFAULTS_DIR = path.join(process.resourcesPath, "config-defaults");
if (process.env.CONTEXT_LAUNCH_USER_DATA_DIR) {
  app.setPath("userData", process.env.CONTEXT_LAUNCH_USER_DATA_DIR);
}
const windowStateFile = path.join(app.getPath("userData"), "window-state.json");

protocol.registerSchemesAsPrivileged([
  {
    scheme: APP_SCHEME,
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true },
  },
]);

const SYNC_WINDOW_DELAY_MS = 5000;

const windowsById = new Map<number, BrowserWindow>();
let sessionWindows: SessionWindow[] = [];
let focusOrder: number[] = [];
let quitting = false;
let serverHandle: ServerHandle | null = null;
let currentPalette: PaletteName = DEFAULT_PALETTE;
let currentMode: AppMode = "system";

function backgroundColor(): string {
  return paletteBackground(currentPalette, isDarkMode(currentMode, nativeTheme.shouldUseDarkColors));
}

function writeWindowState(): void {
  fs.writeFileSync(
    windowStateFile,
    JSON.stringify({
      windows: toWindowStateEntries(sessionWindows),
      palette: currentPalette,
      mode: currentMode,
    }),
  );
}

function applyWindowBackgrounds(): void {
  const bg = backgroundColor();
  for (const win of windowsById.values()) {
    if (!win.isDestroyed()) win.setBackgroundColor(bg);
  }
}

function applyAppearance(): void {
  applyWindowBackgrounds();
  writeWindowState();
}

function currentBounds(win: BrowserWindow): { bounds: WindowBounds; maximized: boolean } {
  const maximized = win.isMaximized();
  const bounds = maximized ? win.getNormalBounds() : win.getBounds();
  return { bounds, maximized };
}

function snapshotAllWindows(): void {
  for (const [windowId, win] of windowsById) {
    if (win.isDestroyed()) continue;
    const { bounds, maximized } = currentBounds(win);
    sessionWindows = updateSessionWindow(sessionWindows, windowId, { bounds, maximized });
  }
  writeWindowState();
}

function createProjectWindow(opts: {
  url: string;
  bounds: WindowBounds;
  maximized: boolean;
}): BrowserWindow {
  const { url, bounds, maximized } = opts;
  const win = new BrowserWindow({
    title: `Context & Launch v${app.getVersion()}`,
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    backgroundColor: backgroundColor(),
    autoHideMenuBar: true,
    show: false,
    icon: path.join(appRoot, "build-resources", "icon.png"),
    webPreferences: {
      preload: preloadPath,
      additionalArguments: appearanceArgs(currentPalette, currentMode),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
    },
  });

  const windowId = win.id;
  windowsById.set(windowId, win);
  sessionWindows = addSessionWindow(sessionWindows, {
    windowId,
    projectSlug: projectSlugFromUrl(url),
    bounds,
    maximized,
  });
  focusOrder = recordFocus(focusOrder, windowId);
  writeWindowState();

  win.on("focus", () => {
    focusOrder = recordFocus(focusOrder, windowId);
  });

  const onNavigate = (navigatedUrl: string) => {
    const navigatedProjectSlug = projectSlugFromUrl(navigatedUrl);
    const entry = sessionWindows.find((w) => w.windowId === windowId);
    if (entry && entry.projectSlug === navigatedProjectSlug) return;
    sessionWindows = updateSessionWindow(sessionWindows, windowId, {
      projectSlug: navigatedProjectSlug,
    });
    writeWindowState();
  };
  win.webContents.on("did-navigate", (_event, navigatedUrl) => onNavigate(navigatedUrl));
  win.webContents.on("did-navigate-in-page", (_event, navigatedUrl) => onNavigate(navigatedUrl));

  win.on("close", () => {
    if (quitting) return;
    const { bounds: b, maximized: m } = currentBounds(win);
    sessionWindows = closeSessionWindow(sessionWindows, windowId, b, m);
    writeWindowState();
  });

  win.on("closed", () => {
    windowsById.delete(windowId);
    focusOrder = removeFromFocusOrder(focusOrder, windowId);
  });

  win.webContents.setWindowOpenHandler(({ url: popupUrl }) => handleWindowOpen(win, popupUrl));

  if (maximized) win.maximize();
  win.loadURL(url)
    .then(() => win.show())
    .catch((err) => console.error("Project Window failed to load:", err));

  return win;
}

function handleWindowOpen(
  opener: BrowserWindow,
  url: string,
): { action: "allow" } | { action: "deny" } {
  const targetProjectSlug = projectSlugFromUrl(url);
  if (targetProjectSlug === null) {
    return { action: "allow" };
  }

  for (const id of focusOrder) {
    const entry = sessionWindows.find((w) => w.windowId === id);
    if (entry && entry.projectSlug === targetProjectSlug) {
      const existing = windowsById.get(id);
      if (existing && !existing.isDestroyed()) {
        if (existing.isMinimized()) existing.restore();
        existing.focus();
        return { action: "deny" };
      }
    }
  }

  const workArea = screen.getDisplayMatching(opener.getBounds()).workArea;
  const bounds = cascadeFrom(opener.getBounds(), workArea);
  createProjectWindow({ url, bounds, maximized: false });
  return { action: "deny" };
}

const execMtimeAtStart = fs.statSync(process.execPath).mtimeMs;
const gotLock = app.requestSingleInstanceLock();

if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    const execMtimeNow = fs.statSync(process.execPath).mtimeMs;
    if (execMtimeNow !== execMtimeAtStart) {
      snapshotAllWindows();
      quitting = true;
      app.relaunch();
      app.exit(0);
      return;
    }
    const id = mostRecentlyFocusedId(focusOrder);
    const win = id === null ? null : windowsById.get(id);
    if (win && !win.isDestroyed()) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

  app.on("ready", async () => {
    serverHandle = await startServer(appRoot);
    const serverPort = serverHandle.port;
    const base = APP_ORIGIN;

    protocol.handle(APP_SCHEME, async (request) => {
      const response = await net.fetch(toServerUrl(request.url, serverPort), {
        method: request.method,
        headers: toServerHeaders(request.headers, serverPort),
        body: request.body,
        redirect: "manual",
        ...(request.body ? { duplex: "half" } : {}),
      } as RequestInit).catch((err: unknown) => {
        console.error("app protocol proxy failed:", request.method, request.url, err);
        throw err;
      });
      return rewriteRedirect(response, serverPort);
    });

    let raw: unknown = null;
    try {
      raw = JSON.parse(fs.readFileSync(windowStateFile, "utf-8"));
    } catch {
      raw = null;
    }
    if (raw !== null && typeof raw === "object") {
      const state = raw as Record<string, unknown>;
      if (isPaletteName(state.palette)) currentPalette = state.palette;
      const storedMode = parseMode(state.mode);
      if (storedMode) currentMode = storedMode;
    }
    let entries = migrateWindowState(raw);
    entries = restoreEntries(
      entries,
      new Set(serverHandle.listProjectSlugs()),
      screen.getAllDisplays().map((d) => d.workArea),
    );
    if (entries.length === 0) {
      entries = [{
        projectSlug: null,
        bounds: { width: DEFAULT_WINDOW_WIDTH, height: DEFAULT_WINDOW_HEIGHT },
        maximized: false,
      } satisfies WindowStateEntry];
    }

    nativeTheme.on("updated", () => {
      applyWindowBackgrounds();
    });

    ipcMain.on("context-launch:set-palette", (_event, name: unknown) => {
      if (isPaletteName(name) && name !== currentPalette) {
        currentPalette = name;
        applyAppearance();
      }
    });

    ipcMain.on("context-launch:set-mode", (_event, mode: unknown) => {
      const parsed = parseMode(mode);
      if (parsed && parsed !== currentMode) {
        currentMode = parsed;
        applyAppearance();
      }
    });

    for (const entry of entries) {
      const url = entry.projectSlug
        ? `${base}/project/${encodeURIComponent(entry.projectSlug)}`
        : base;
      createProjectWindow({ url, bounds: entry.bounds, maximized: entry.maximized });
    }
  });

  app.on("before-quit", () => {
    if (!quitting && windowsById.size > 0) {
      snapshotAllWindows();
    }
    quitting = true;
  });

  app.on("window-all-closed", async () => {
    if (!serverHandle) {
      app.quit();
      return;
    }

    serverHandle.shutdown();

    const opsFinished = serverHandle.waitForPendingOps();
    const delayed = new Promise<"timeout">((r) => setTimeout(() => r("timeout"), SYNC_WINDOW_DELAY_MS));

    const race = await Promise.race([opsFinished.then(() => "done" as const), delayed]);

    if (race === "done") {
      app.quit();
      return;
    }

    const syncWindow = new BrowserWindow({
      width: 320,
      height: 120,
      resizable: false,
      minimizable: false,
      maximizable: false,
      autoHideMenuBar: true,
      icon: path.join(appRoot, "build-resources", "icon.png"),
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        webSecurity: true,
      },
    });

    syncWindow.loadURL(`data:text/html,${encodeURIComponent(
      `<html><body style="font-family:system-ui;display:flex;flex-direction:column;align-items:center;`
      + `justify-content:center;height:100%;margin:0">`
      + `<p>Finishing sync...</p>`
      + `<button onclick="window.close()" style="padding:6px 16px;cursor:pointer">Force Quit</button>`
      + `</body></html>`,
    )}`);

    syncWindow.on("closed", () => {
      app.quit();
    });

    await opsFinished;
    if (!syncWindow.isDestroyed()) syncWindow.close();
  });
}
