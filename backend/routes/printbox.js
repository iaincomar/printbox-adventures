const express = require('express')
const router = express.Router()
const fetch = require('node-fetch')
const tough = require('tough-cookie')
const fetchCookieModule = require('fetch-cookie')
const fetchCookie = fetchCookieModule.default || fetchCookieModule

const BASE = 'http://gestion.printboxweb.com'

// CookieJar compartido — mantiene la sesión y el token CSRF entre peticiones
const cookieJar = new tough.CookieJar()
const fetchWithCookies = fetchCookie(fetch, cookieJar)

// Obtiene el token CSRF haciendo un GET a la home de Laravel
// Laravel devuelve una cookie XSRF-TOKEN que hay que reenviar en cada POST
async function getCsrfToken() {
  await fetchWithCookies(`${BASE}/sanctum/csrf-cookie`, { method: 'GET' })
  const cookies = await cookieJar.getCookies(BASE)
  const xsrf = cookies.find(c => c.key === 'XSRF-TOKEN')
  if (xsrf) return decodeURIComponent(xsrf.value)

  // Fallback: intentar con la ruta raíz
  await fetchWithCookies(BASE, { method: 'GET' })
  const cookies2 = await cookieJar.getCookies(BASE)
  const xsrf2 = cookies2.find(c => c.key === 'XSRF-TOKEN')
  return xsrf2 ? decodeURIComponent(xsrf2.value) : null
}

// Wrapper que hace POST con CSRF token y cookies de sesión
async function postWithCsrf(url, body) {
  const csrfToken = await getCsrfToken()

  const headers = {
    'Content-Type': 'application/json',
    'X-Requested-With': 'XMLHttpRequest',
    'Accept': 'application/json',
  }
  if (csrfToken) {
    headers['X-XSRF-TOKEN'] = csrfToken
  }

  return fetchWithCookies(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })
}

// POST /printbox/find-event  →  POST /api/v1/events/find
router.post('/find-event', async (req, res) => {
  try {
    const { code } = req.body
    const r = await postWithCsrf(`${BASE}/api/v1/events/find`, { code })
    const data = await r.json()
    console.log(`[printbox] find-event ${code} → ${r.status}`, JSON.stringify(data).slice(0, 200))
    if (!r.ok) return res.status(r.status).json({ error: data })
    res.json({ uuid: data?.data?.uuid })
  } catch (err) {
    console.error('[printbox] find-event error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

// POST /printbox/photos?page=N  →  POST /api/v1/events/photos?page=N
router.post('/photos', async (req, res) => {
  try {
    const page = req.query.page || 1
    const { event } = req.body
    const r = await postWithCsrf(`${BASE}/api/v1/events/photos?page=${page}`, { event })
    const data = await r.json()
    console.log(`[printbox] photos page=${page} → ${r.status}`)
    if (!r.ok) return res.status(r.status).json({ error: data })
    res.json(data)
  } catch (err) {
    console.error('[printbox] photos error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

// POST /printbox/photos-to-print  →  POST /api/v1/events/photos_two
router.post('/photos-to-print', async (req, res) => {
  try {
    const { event } = req.body
    const r = await postWithCsrf(`${BASE}/api/v1/events/photos_two`, { event })
    const data = await r.json()
    console.log(`[printbox] photos-to-print → ${r.status}`)
    if (!r.ok) return res.status(r.status).json({ error: data })
    res.json(data)
  } catch (err) {
    console.error('[printbox] photos-to-print error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

module.exports = router

// POST /printbox/photo-send  →  POST /api/v1/events/photo/send
router.post('/photo-send', async (req, res) => {
  try {
    const { event, image, times } = req.body
    const r = await fetch(`${BASE}/api/v1/events/photo/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event, image, times }),
    })
    const data = await r.json()
    if (!r.ok) return res.status(r.status).json({ error: data })
    res.json(data)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})