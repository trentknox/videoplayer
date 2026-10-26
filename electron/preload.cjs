const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('vividWindow', Object.freeze({
  minimize: () => ipcRenderer.send('vivid-window', 'minimize'),
  toggleMaximize: () => ipcRenderer.send('vivid-window', 'toggle-maximize'),
  close: () => ipcRenderer.send('vivid-window', 'close'),
}))
