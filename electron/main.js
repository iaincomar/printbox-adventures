const { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain } = require('electron')
const { autoUpdater } = require('electron-updater')
autoUpdater.logger = require('electron-log')
autoUpdater.logger.transports.file.level = 'info'
const path = require('path')
const os = require('os')

const isDev = !app.isPackaged

if (!isDev) {
  require('../backend/server')
}

let printerWin = null
let viewerWin  = null
let splashWin  = null
let tray       = null

// ── AUTO-ACTUALIZACIÓN ────────────────────────────────────────────────────────
if (!isDev) {
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('update-available', () => {
    if (printerWin) {
      printerWin.webContents.executeJavaScript(`
        const bar = document.createElement('div')
        bar.id = 'update-bar'
        bar.style = 'position:fixed;top:0;left:0;right:0;z-index:9999;background:#f7c604;color:#000;text-align:center;padding:8px;font-weight:bold;font-size:13px'
        bar.innerHTML = '⬇️ Hay una actualización disponible. Se instalará automáticamente al cerrar la app.'
        document.body.prepend(bar)
      `)
    }
  })

  autoUpdater.on('update-downloaded', () => {
    if (printerWin) {
      printerWin.webContents.executeJavaScript(`
        const bar = document.getElementById('update-bar')
        if (bar) bar.innerHTML = '✅ Actualización descargada. Se instalará al cerrar la app. <button onclick="window.__installNow()" style="margin-left:12px;padding:2px 10px;cursor:pointer;border:none;border-radius:4px;background:#000;color:#f7c604;font-weight:bold">Instalar ahora</button>'
      `)
      printerWin.webContents.executeJavaScript(`
        window.__installNow = () => { require('electron').ipcRenderer.send('install-update') }
      `).catch(() => {})
    }
  })

  autoUpdater.on('error', (err) => {
    console.error('[Updater] Error:', err.message)
  })

  ipcMain.on('install-update', () => {
    autoUpdater.quitAndInstall()
  })
}

// ── SPLASH SCREEN ─────────────────────────────────────────────────────────────
function createSplash() {
  splashWin = new BrowserWindow({
    width: 420,
    height: 280,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    backgroundColor: '#00000000',
    webPreferences: { nodeIntegration: false, contextIsolation: true },
  })

  const logoPath = isDev
    ? path.join(__dirname, '../src/public/assets/MoscaPrintbox.png')
    : path.join(process.resourcesPath, 'assets/MoscaPrintbox.png')

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body {
    width:420px; height:280px;
    background: linear-gradient(135deg, #0a0a0f 0%, #1a1a2e 100%);
    border-radius: 16px;
    border: 1px solid rgba(247,198,4,0.3);
    display:flex; flex-direction:column;
    align-items:center; justify-content:center; gap:20px;
    font-family: system-ui, sans-serif;
    overflow:hidden;
  }
  img { width:80px; height:80px; object-fit:contain; border-radius:12px; }
  h1 { color:#f7c604; font-size:22px; font-weight:700; letter-spacing:1px; }
  p  { color:#888; font-size:13px; }
  .bar-wrap { width:240px; height:4px; background:#222; border-radius:4px; overflow:hidden; }
  .bar { height:4px; background:#f7c604; border-radius:4px; animation: load 2.5s ease-in-out forwards; }
  @keyframes load { from{width:0%} to{width:100%} }
</style>
</head>
<body>
  <img src="file://${logoPath.replace(/\\/g,'/')}" alt="logo" onerror="this.style.display='none'">
  <h1>PrintboxAdventures</h1>
  <p>Iniciando sistema...</p>
  <div class="bar-wrap"><div class="bar"></div></div>
</body>
</html>`

  splashWin.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))
}

// ── CREAR VENTANAS PRINCIPALES ────────────────────────────────────────────────
function createWindows() {
  // Viewer en modo quiosco
  viewerWin = new BrowserWindow({
    title: 'PrintboxAdventures — Visor de Evento',
    backgroundColor: '#0a0a0f',
    fullscreen: true,
    kiosk: true,
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  })

  printerWin = new BrowserWindow({
    width: 1200,
    height: 750,
    title: 'PrintboxAdventures — Panel de Control',
    backgroundColor: '#0a0a0f',
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  })

  const base = isDev ? 'http://localhost:3000' : 'http://localhost:4000'
  viewerWin.loadURL(`${base}/#/viewer`)
  printerWin.loadURL(`${base}/#/printer`)

  // Minimizar a bandeja en vez de cerrar
  printerWin.on('close', (e) => {
    if (!app.isQuitting) {
      e.preventDefault()
      printerWin.hide()
      tray?.displayBalloon?.({
        title: 'PrintboxAdventures',
        content: 'La app sigue corriendo en la bandeja del sistema.',
        iconType: 'info',
      })
    }
  })

  // Salir del quiosco con F11 o Escape
  viewerWin.webContents.on('before-input-event', (e, input) => {
    if (input.key === 'F11' || (input.key === 'Escape' && viewerWin.isKiosk())) {
      viewerWin.setKiosk(false)
      viewerWin.setFullScreen(false)
    }
  })

  if (splashWin) {
    splashWin.close()
    splashWin = null
  }

  // Comprobar actualizaciones después de que las ventanas carguen
  if (!isDev) {
    setTimeout(() => autoUpdater.checkForUpdatesAndNotify(), 5000)
  }
}

// ── BANDEJA DEL SISTEMA ───────────────────────────────────────────────────────
function createTray() {
  const iconPath = isDev
    ? path.join(__dirname, '../src/public/assets/MoscaPrintbox.png')
    : path.join(process.resourcesPath, 'assets/MoscaPrintbox.png')

  const icon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 })
  tray = new Tray(icon)
  tray.setToolTip('PrintboxAdventures')

  const menu = Menu.buildFromTemplate([
    { label: 'Mostrar Panel de Control', click: () => { printerWin?.show(); printerWin?.focus() } },
    { label: 'Mostrar Visor', click: () => { viewerWin?.show(); viewerWin?.focus() } },
    { type: 'separator' },
    { label: 'Salir', click: () => { app.isQuitting = true; app.quit() } },
  ])

  tray.setContextMenu(menu)
  tray.on('double-click', () => { printerWin?.show(); printerWin?.focus() })
}

// ── ARRANQUE ──────────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  createTray()

  if (isDev) {
    createWindows()
  } else {
    createSplash()
    setTimeout(createWindows, 2500)
  }
})

app.on('window-all-closed', () => {
  // No salir — siguen en bandeja
})

app.on('before-quit', () => {
  app.isQuitting = true
})

// Ctrl+Q para salir desde cualquier ventana
app.on('web-contents-created', (_, wc) => {
  wc.on('before-input-event', (e, input) => {
    if (input.control && input.key === 'q') {
      app.isQuitting = true
      app.quit()
    }
  })
})