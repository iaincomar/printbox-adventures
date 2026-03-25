const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  backendUrl: 'https://printbox.incomar.net',
  installUpdate: () => ipcRenderer.invoke('install-update'),
})