import { contextBridge, ipcRenderer } from 'electron'
import { seedAppearance } from './app-protocol.js'

seedAppearance(window.localStorage, process.argv)

contextBridge.exposeInMainWorld('contextLaunch', {
  setAppearance: (palette: string, mode: string) => ipcRenderer.send('context-launch:set-appearance', palette, mode),
  pickDirectory: (preselect: string) => ipcRenderer.invoke('context-launch:pick-directory', preselect),
})
