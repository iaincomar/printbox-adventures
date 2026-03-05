const express = require('express')
const cors = require('cors')
const path = require('path')
const fs = require('fs-extra')

const printRoutes = require('./routes/print')
const configRoutes = require('./routes/config')

const app = express()
const PORT = 4000

// Asegurar carpetas necesarias
;['descargas', 'pdf'].forEach(d =>
  fs.ensureDirSync(path.join(process.cwd(), d))
)

// Contador de impresiones persistente en C:/log/PBAcount.txt
const LOG_PATH = 'C:/log/PBAcount.txt'
if (process.platform === 'win32') {
  fs.ensureDirSync('C:/log')
  if (!fs.existsSync(LOG_PATH)) fs.writeFileSync(LOG_PATH, '0')
}

app.use(cors())
app.use(express.json())

// Sirve las imágenes descargadas para que React las muestre
app.use('/descargas', express.static(path.join(process.cwd(), 'descargas')))

app.get('/health', (_req, res) => res.json({ ok: true }))

app.use('/print', printRoutes)
app.use('/config', configRoutes)

app.listen(PORT, () =>
  console.log(`[Backend] PrintboxAdventures escuchando en :${PORT}`)
)

module.exports = app
