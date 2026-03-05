const express = require('express')
const router = express.Router()
const path = require('path')
const fs = require('fs-extra')
const fetch = require('node-fetch')
const PDFDocument = require('pdfkit')
const { print, getPrinters } = require('pdf-to-printer')

const DESCARGAS = path.join(process.cwd(), 'descargas')
const PDF_DIR = path.join(process.cwd(), 'pdf')
const LOG_PATH = 'C:/log/PBAcount.txt'

// GET /print/printers — lista las impresoras del sistema
router.get('/printers', async (_req, res) => {
  try {
    const printers = await getPrinters()
    res.json({ printers: printers.map(p => p.name) })
  } catch (err) {
    // En Linux/dev devolvemos lista vacía
    res.json({ printers: [] })
  }
})

// GET /print/count — devuelve el total de impresiones
router.get('/count', (_req, res) => {
  try {
    const count = parseInt(fs.readFileSync(LOG_PATH, 'utf8').trim()) || 0
    res.json({ count })
  } catch {
    res.json({ count: 0 })
  }
})

// POST /print/job — descarga imagen, convierte a PDF e imprime
// Body: { imageUrl: string, imageName: string, printer: string, delay: number }
router.post('/job', async (req, res) => {
  const { imageUrl, imageName, printer, delay = 5 } = req.body

  if (!imageUrl || !imageName) {
    return res.status(400).json({ error: 'imageUrl e imageName son obligatorios' })
  }

  try {
    // 1. Descargar imagen
    const response = await fetch(imageUrl)
    if (!response.ok) throw new Error(`No se pudo descargar: ${response.status}`)
    const buffer = await response.buffer()

    const imgPath = path.join(DESCARGAS, imageName)
    await fs.writeFile(imgPath, buffer)

    // 2. Convertir a PDF con PDFKit (respeta orientación)
    const pdfPath = path.join(PDF_DIR, `${imageName}.pdf`)
    await convertImageToPdf(imgPath, pdfPath)

    // 3. Delay configurable antes de imprimir (asegura que la imagen esté completa)
    await new Promise(r => setTimeout(r, delay * 1000))

    // 4. Imprimir
    if (printer) {
      await print(pdfPath, { printer })
    } else {
      await print(pdfPath)
    }

    // 5. Incrementar contador
    let count = 0
    try {
      count = parseInt(fs.readFileSync(LOG_PATH, 'utf8').trim()) || 0
    } catch {}
    count++
    fs.writeFileSync(LOG_PATH, String(count))

    res.json({ ok: true, count, imageName })
  } catch (err) {
    console.error('[print/job]', err)
    res.status(500).json({ error: err.message })
  }
})

// Convierte una imagen a PDF manteniendo proporciones
function convertImageToPdf(imgPath, pdfPath) {
  return new Promise((resolve, reject) => {
    try {
      const sharp = require('sharp')
      sharp(imgPath).metadata().then(meta => {
        const { width, height } = meta
        const doc = new PDFDocument({
          size: [width, height],
          margin: 0,
          autoFirstPage: true,
        })
        const stream = fs.createWriteStream(pdfPath)
        doc.pipe(stream)
        doc.image(imgPath, 0, 0, { width, height })
        doc.end()
        stream.on('finish', resolve)
        stream.on('error', reject)
      })
    } catch (err) {
      reject(err)
    }
  })
}

module.exports = router
