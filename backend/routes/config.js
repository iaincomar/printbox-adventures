const express = require('express')
const router = express.Router()
const path = require('path')
const fs = require('fs-extra')

const CONFIG_DIR = path.join(process.cwd(), 'config')

// GET /config — lee toda la configuración
router.get('/', (_req, res) => {
  try {
    const apiFile = path.join(CONFIG_DIR, 'servidor_api.txt')
    const textosFile = path.join(CONFIG_DIR, 'textos.txt')

    const config = {
      servidor: 'http://gestion.printboxweb.com',
      evento: '',
      timer: 5,
      impresora: '',
      delay: 5,
    }

    const textos = {
      text_es: '',
      text_en: '',
      text_fr: '',
      text_de: '',
      precio1: '',
      precio2: '',
      precio3: '',
      empresa: '',
    }

    if (fs.existsSync(apiFile)) {
      const lines = fs.readFileSync(apiFile, 'utf8').split('\n')
      lines.forEach((line, i) => {
        const val = line.includes(';') ? line.split(';')[1]?.trim() : line.trim()
        if (i === 0 && val) config.servidor = val
        if (i === 1 && val) config.evento = val
        if (i === 2 && val) config.timer = parseInt(val) || 5
        if (i === 3 && val) config.impresora = val
        if (i === 4 && val) config.delay = parseInt(val) || 5
      })
    }

    if (fs.existsSync(textosFile)) {
      const lines = fs.readFileSync(textosFile, 'utf8').split('\n')
      const keys = ['text_es','text_en','text_fr','text_de','precio1','precio2','precio3','empresa']
      lines.forEach((line, i) => {
        const val = line.includes(':') ? line.split(':').slice(1).join(':').trim() : line.trim()
        if (keys[i] !== undefined) textos[keys[i]] = val
      })
    }

    res.json({ config, textos })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST /config — guarda la configuración
router.post('/', (req, res) => {
  try {
    const { config, textos } = req.body
    fs.ensureDirSync(CONFIG_DIR)

    if (config) {
      const lines = [
        `servidor;${config.servidor || 'http://gestion.printboxweb.com'}`,
        `evento;${config.evento || ''}`,
        `timer;${config.timer || 5}`,
        `impresora;${config.impresora || ''}`,
        `delay;${config.delay || 5}`,
      ]
      fs.writeFileSync(path.join(CONFIG_DIR, 'servidor_api.txt'), lines.join('\n'))
    }

    if (textos) {
      const lines = [
        `es:${textos.text_es || ''}`,
        `en:${textos.text_en || ''}`,
        `fr:${textos.text_fr || ''}`,
        `de:${textos.text_de || ''}`,
        `precio1:${textos.precio1 || ''}`,
        `precio2:${textos.precio2 || ''}`,
        `precio3:${textos.precio3 || ''}`,
        `empresa:${textos.empresa || ''}`,
      ]
      fs.writeFileSync(path.join(CONFIG_DIR, 'textos.txt'), lines.join('\n'))
    }

    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
