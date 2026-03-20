const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  backendUrl: 'http://localhost:4000',
  installUpdate: () => ipcRenderer.invoke('install-update'),
})