const { app, BrowserWindow } = require('electron')
const path = require('path')

const isDev = !app.isPackaged

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
    // En producción cargar desde Express (puerto 4000) para que /assets/ funcione
    win.loadURL(`http://localhost:4000/#${route}`)
  }

  return win
}

app.whenReady().then(() => {
  if (!isDev) {
    // Esperar a que el backend arranque antes de abrir ventanas
    setTimeout(() => {
      createWindow('/printer', 1200, 750, 'PrintboxAdventures — Panel de Control')
      createWindow('/viewer', 1500, 850, 'PrintboxAdventures — Visor de Evento')
    }, 2000)
  } else {
    createWindow('/printer', 1200, 750, 'PrintboxAdventures — Panel de Control')
    createWindow('/viewer', 1500, 850, 'PrintboxAdventures — Visor de Evento')
  }
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})