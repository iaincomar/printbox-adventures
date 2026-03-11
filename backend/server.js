const express = require('express')
const cors = require('cors')
const path = require('path')
const fs = require('fs-extra')
const os = require('os')

const printRoutes = require('./routes/print')
const configRoutes = require('./routes/config')
const printboxRoutes = require('./routes/printbox')

const app = express()
const PORT = 4000

const isPackaged = app.isPackaged !== undefined
  ? app.isPackaged
  : !process.defaultApp

const DATA_DIR = isPackaged
  ? path.join(os.homedir(), 'AppData', 'Local', 'PrintboxAdventures')
  : process.cwd()

app.locals.dataDir = DATA_DIR

;['descargas', 'pdf', 'config'].forEach(d =>
  fs.ensureDirSync(path.join(DATA_DIR, d))
)

// Copiar config por defecto si no existe
const defaultConfig = path.join(process.cwd(), 'config')
const userConfig = path.join(DATA_DIR, 'config')
if (fs.existsSync(defaultConfig)) {
  ;['servidor_api.txt', 'textos.txt'].forEach(f => {
    const dest = path.join(userConfig, f)
    const src = path.join(defaultConfig, f)
    if (!fs.existsSync(dest) && fs.existsSync(src)) fs.copySync(src, dest)
  })
}

const LOG_PATH = path.join(DATA_DIR, 'PBAcount.txt')
if (!fs.existsSync(LOG_PATH)) fs.writeFileSync(LOG_PATH, '0')
app.locals.logPath = LOG_PATH

app.use(cors())
app.use(express.json())

// Servir el frontend (dist) desde Express en producción
const distPath = path.join(__dirname, '../dist')
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath))
}

// Servir assets (banners, logos, qr) desde extraResources
const assetsPath = isPackaged
  ? path.join(process.resourcesPath, 'assets')
  : path.join(__dirname, '../src/public/assets')
app.use('/assets', express.static(assetsPath))

app.use('/descargas', express.static(path.join(DATA_DIR, 'descargas')))

app.get('/health', (_req, res) => res.json({ ok: true }))

app.use('/printbox', printboxRoutes)
app.use('/print', printRoutes)
app.use('/config', configRoutes)

// Fallback para React Router
app.get('*', (_req, res) => {
  const indexPath = path.join(distPath, 'index.html')
  if (fs.existsSync(indexPath)) res.sendFile(indexPath)
  else res.status(404).send('Not found')
})

app.listen(PORT, () =>
  console.log(`[Backend] PrintboxAdventures escuchando en :${PORT}`)
)

console.log(`[Backend] Directorio de datos: ${DATA_DIR}`)
console.log(`[Backend] Assets: ${assetsPath}`)

module.exports = app