const { app, BrowserWindow } = require('electron')
const path = require('path')

const isDev = !app.isPackaged

// Arranca el backend Express embebido en producción
if (!isDev) {
  require('../backend/server')
}

function createWindow(route, width, height, title) {
  const win = new BrowserWindow({
    width,
    height,
    title,
    backgroundColor: '#0a0a0f',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  })

  if (isDev) {
    win.loadURL(`http://localhost:3000/#${route}`)
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'), { hash: route })
  }

  return win
}

app.whenReady().then(() => {
  createWindow('/printer', 1200, 750, 'PrintboxAdventures — Panel de Control')
  createWindow('/viewer', 1500, 850, 'PrintboxAdventures — Visor de Evento')
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
