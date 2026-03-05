const express = require('express')
const router = express.Router()
const fetch = require('node-fetch')

const BASE = 'http://gestion.printboxweb.com'

// POST /printbox/find-event  →  POST /api/v1/events/find
router.post('/find-event', async (req, res) => {
  try {
    const { code } = req.body
    const r = await fetch(`${BASE}/api/v1/events/find`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    })
    const data = await r.json()
    if (!r.ok) return res.status(r.status).json({ error: data })

    // Devolvemos solo el uuid para simplificar
    res.json({ uuid: data?.data?.uuid })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST /printbox/photos?page=N  →  POST /api/v1/events/photos?page=N
router.post('/photos', async (req, res) => {
  try {
    const page = req.query.page || 1
    const { event } = req.body
    const r = await fetch(`${BASE}/api/v1/events/photos?page=${page}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event }),
    })
    const data = await r.json()
    if (!r.ok) return res.status(r.status).json({ error: data })
    res.json(data)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST /printbox/photos-to-print  →  POST /api/v1/events/photos_two
router.post('/photos-to-print', async (req, res) => {
  try {
    const { event } = req.body
    const r = await fetch(`${BASE}/api/v1/events/photos_two`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event }),
    })
    const data = await r.json()
    if (!r.ok) return res.status(r.status).json({ error: data })
    res.json(data)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
