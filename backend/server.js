const express = require('express')
const cors = require('cors')
const path = require('path')
const fs = require('fs-extra')
const os = require('os')
const fetch = require('node-fetch')

const printRoutes = require('./routes/print')
const configRoutes = require('./routes/config')
const printboxRoutes = require('./routes/printbox')
const { getAdminPasswordHash, bcrypt } = require('./lib/auth')

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
const defaultConfig = path.join(__dirname, '../config')
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
const assetsPath = (isPackaged && process.resourcesPath)
  ? path.join(process.resourcesPath, 'assets')
  : path.join(__dirname, '../src/public/assets')
app.use('/assets', express.static(assetsPath))

app.use('/descargas', express.static(path.join(DATA_DIR, 'descargas')))

app.get('/health', (_req, res) => res.json({ ok: true }))

const baseConfigDir = path.join(DATA_DIR, 'config')

// Verifica la contraseña de Admin sin crear sesión (solo feedback en el modal de
// acceso). La protección real está en que cada escritura exige la MISMA contraseña
// otra vez en la cabecera X-Admin-Password (ver backend/lib/auth.js).
app.post('/auth/check', (req, res) => {
  const hash = getAdminPasswordHash(baseConfigDir)
  const password = String(req.body?.password || '')
  if (!hash || !password || !bcrypt.compareSync(password, hash)) {
    return res.status(401).json({ ok: false, error: 'Contraseña incorrecta' })
  }
  res.json({ ok: true })
})

// Credenciales de Square: variable de entorno si existen, si no config/square.json
// (fuera de git). Nunca hardcodeadas en el código.
function getSquareCredentials() {
  let accessToken = process.env.SQUARE_ACCESS_TOKEN || ''
  let locationId = process.env.SQUARE_LOCATION_ID || ''
  if (!accessToken || !locationId) {
    try {
      const f = path.join(baseConfigDir, 'square.json')
      if (fs.existsSync(f)) {
        const parsed = JSON.parse(fs.readFileSync(f, 'utf8'))
        if (!accessToken) accessToken = parsed.accessToken || ''
        if (!locationId) locationId = parsed.locationId || ''
      }
    } catch {}
  }
  return { accessToken, locationId }
}

// Recalcula el importe esperado a partir de las copias reales del pedido y los
// precios configurados — el importe que mande el cliente DEBE coincidir. Nunca
// confiar en el importe que llega del cliente.
function checkAmountCents(order, amountCents) {
  if (!order || !Array.isArray(order.copies)) return 'Falta el detalle del pedido (order.copies)'
  const textosFile = path.join(baseConfigDir, 'textos.txt')
  const prices = { precio1: 5, precio2: 9, precio3: 12 }
  if (fs.existsSync(textosFile)) {
    fs.readFileSync(textosFile, 'utf8').split('\n').forEach((line) => {
      const [key, val] = line.trim().split(':')
      if (['precio1', 'precio2', 'precio3'].includes(key)) prices[key] = parseFloat(val) || 0
    })
  }
  const table = [0, prices.precio1, prices.precio2, prices.precio3]
  const total = order.copies.reduce((sum, c) => {
    const n = Math.min(Math.max(parseInt(c) || 0, 0), 3)
    return sum + (n > 0 ? table[n] : 0)
  }, 0)
  const expected = Math.round(total * 100)
  if (amountCents !== expected) return 'El importe no coincide con el pedido'
  return null
}

// Square payment endpoint (local backend)
app.post('/process-payment', async (req, res) => {
  try {
    const { token, amount, currency = 'EUR', order } = req.body

    if (!token || !amount) {
      return res.status(400).json({ error: 'Token y amount son requeridos' })
    }

    const amountCents = Math.round(parseFloat(amount) * 100)
    const amountError = checkAmountCents(order, amountCents)
    if (amountError) return res.status(400).json({ error: amountError })

    const { accessToken: SQUARE_ACCESS_TOKEN, locationId: SQUARE_LOCATION_ID } = getSquareCredentials()
    if (!SQUARE_ACCESS_TOKEN) {
      return res.status(500).json({ error: 'Square no configurado en el servidor' })
    }

    const payload = {
      source_id: token,
      idempotency_key: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      amount_money: {
        amount: amountCents,
        currency,
      },
      location_id: SQUARE_LOCATION_ID, // siempre del servidor, nunca del cliente
    }

    const squareRes = await fetch('https://connect.squareupsandbox.com/v2/payments', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${SQUARE_ACCESS_TOKEN}`,
      },
      body: JSON.stringify(payload),
    })

    const data = await squareRes.json()
    if (!squareRes.ok) {
      return res.status(squareRes.status).json(data)
    }

    res.json(data)
  } catch (error) {
    console.error('process-payment error:', error)
    res.status(500).json({ error: error.message || 'Error al procesar el pago' })
  }
})

app.use('/printbox', printboxRoutes)
app.use('/print', printRoutes)
app.use('/config', configRoutes)

// Proxy de imágenes (para evitar CORS)
app.get('/proxy-image/*', async (req, res) => {
  try {
    const imagePath = '/' + req.params[0]
    const imageUrl = 'http://gestion.printboxweb.com' + imagePath

    console.log(`[proxy-image] Fetching: ${imageUrl}`)

    const response = await fetch(imageUrl, {
      timeout: 15000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    })

    if (!response.ok) {
      console.error(`[proxy-image] Error ${response.status}: ${imageUrl}`)
      return res.status(response.status).json({ error: 'Imagen no encontrada' })
    }

    const contentType = response.headers.get('content-type')
    if (contentType) res.set('Content-Type', contentType)

    res.set('Cache-Control', 'public, max-age=86400')
    const buffer = await response.buffer()
    res.send(buffer)
  } catch (err) {
    console.error('[proxy-image] Error:', err.message)
    res.status(500).json({ error: 'Error al obtener imagen' })
  }
})

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