import { app, BrowserWindow } from "electron";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { startServer, type ServerHandle } from "./server-adapter.js";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
process.env.CONTEXT_LAUNCH_CONFIG_DEFAULTS_DIR = path.join(process.resourcesPath, "config-defaults");
const windowStateFile = path.join(app.getPath("userData"), "window-state.json");

const DEFAULT_WIDTH = 1400;
const DEFAULT_HEIGHT = 900;

interface WindowState {
  width: number;
  height: number;
  x?: number;
  y?: number;
  maximized?: boolean;
}

function loadWindowState(): WindowState {
  try {
    return JSON.parse(fs.readFileSync(windowStateFile, "utf-8"));
  } catch {
    return { width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT };
  }
}

function saveWindowState(win: BrowserWindow): void {
  const maximized = win.isMaximized();
  const bounds = maximized ? win.getNormalBounds() : win.getBounds();
  const state: WindowState = { ...bounds, maximized };
  fs.writeFileSync(windowStateFile, JSON.stringify(state));
}

let mainWindow: BrowserWindow | null = null;
let serverHandle: ServerHandle | null = null;

const SYNC_WINDOW_DELAY_MS = 5000;

const execMtimeAtStart = fs.statSync(process.execPath).mtimeMs;
const gotLock = app.requestSingleInstanceLock();

if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    const execMtimeNow = fs.statSync(process.execPath).mtimeMs;
    if (execMtimeNow !== execMtimeAtStart) {
      if (mainWindow) saveWindowState(mainWindow);
      app.relaunch();
      app.exit(0);
      return;
    }
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.on("ready", async () => {
    serverHandle = await startServer(appRoot);

    const state = loadWindowState();
    mainWindow = new BrowserWindow({
      title: `Context & Launch v${app.getVersion()}`,
      width: state.width,
      height: state.height,
      x: state.x,
      y: state.y,
      autoHideMenuBar: true,
      show: false,
      icon: path.join(appRoot, "build-resources", "icon.png"),
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        webSecurity: true,
      },
    });

    mainWindow.on("page-title-updated", (event) => {
      event.preventDefault();
    });

    if (state.maximized) mainWindow.maximize();

    mainWindow.on("close", () => {
      if (mainWindow) saveWindowState(mainWindow);
    });

    mainWindow.on("closed", () => {
      mainWindow = null;
    });

    await mainWindow.loadURL(`http://127.0.0.1:${serverHandle.port}`);
    mainWindow.show();
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
