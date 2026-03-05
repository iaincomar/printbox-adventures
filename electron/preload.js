const { contextBridge } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  backendUrl: 'http://localhost:4000',
})
