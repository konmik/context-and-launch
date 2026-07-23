import { contextBridge, ipcRenderer } from "electron";
import { seedAppearance } from "./app-protocol.js";

seedAppearance(window.localStorage, process.argv);

contextBridge.exposeInMainWorld("contextLaunch", {
  setPalette: (name: string) => ipcRenderer.send("context-launch:set-palette", name),
  setMode: (mode: string) => ipcRenderer.send("context-launch:set-mode", mode),
});
