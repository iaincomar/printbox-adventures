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

// En producción (Electron instalado) usar AppData, en dev usar el directorio actual
const isPackaged = process.mainModule?.filename?.includes('app.asar') ||
                   process.resourcesPath !== undefined

const DATA_DIR = isPackaged
  ? path.join(os.homedir(), 'AppData', 'Local', 'PrintboxAdventures')
  : process.cwd()

// Exportar DATA_DIR para que las rutas lo usen
app.locals.dataDir = DATA_DIR

// Asegurar carpetas necesarias en ubicación con permisos
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
    if (!fs.existsSync(dest) && fs.existsSync(src)) {
      fs.copySync(src, dest)
    }
  })
}

// Contador de impresiones en AppData
const LOG_PATH = path.join(DATA_DIR, 'PBAcount.txt')
if (!fs.existsSync(LOG_PATH)) fs.writeFileSync(LOG_PATH, '0')
app.locals.logPath = LOG_PATH

app.use(cors())
app.use(express.json())

// Sirve las imágenes descargadas
app.use('/descargas', express.static(path.join(DATA_DIR, 'descargas')))

app.get('/health', (_req, res) => res.json({ ok: true }))

app.use('/printbox', printboxRoutes)
app.use('/print', printRoutes)
app.use('/config', configRoutes)

app.listen(PORT, () =>
  console.log(`[Backend] PrintboxAdventures escuchando en :${PORT}`)
)

console.log(`[Backend] Directorio de datos: ${DATA_DIR}`)

module.exports = app