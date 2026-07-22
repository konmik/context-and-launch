import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("contextLaunch", {
  setPalette: (name: string) => ipcRenderer.send("context-launch:set-palette", name),
});
