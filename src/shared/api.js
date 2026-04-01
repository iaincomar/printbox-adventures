// Detecta si estamos en local (Electron/dev) o en producción (IONOS)
// En desarrollo: http://localhost:4000 para mobile, https://printbox.incomar.net para viewer
// En producción: rutas relativas para proxy.php
const BACKEND_URL = window.location.hostname === 'localhost' ? (window.isViewer ? 'https://printbox.incomar.net' : 'http://localhost:4000') : ''

// ─── API Printbox ───────────────────────────────────────────────────────────

export async function findEvent(eventCode) {
  const res = await fetch(`${BACKEND_URL}/printbox/find-event`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: eventCode }),
  })
  if (!res.ok) throw new Error(`Error al buscar evento: ${res.status}`)
  const data = await res.json()
  return data.uuid
}

export async function getEventPhotos(uuid, page = 1) {
  const res = await fetch(`${BACKEND_URL}/printbox/photos?page=${page}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ event: uuid }),
  })
  if (!res.ok) throw new Error(`Error al obtener fotos: ${res.status}`)
  const data = await res.json()
  return { photos: data.data || [], lastPage: data.last_page || 1 }
}

export async function getPhotosToPrint(uuid) {
  const res = await fetch(`${BACKEND_URL}/printbox/photos-to-print`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ event: uuid }),
  })
  if (!res.ok) throw new Error(`Error al obtener fotos para imprimir: ${res.status}`)
  const data = await res.json()
  return data.values || []
}

// ─── Backend local ───────────────────────────────────────────────────────────

export async function getPrinters() {
  try {
    const res = await fetch(`${BACKEND_URL}/print/printers`)
    const data = await res.json()
    return data.printers || []
  } catch {
    return []
  }
}

export async function getPrintCount() {
  try {
    const res = await fetch(`${BACKEND_URL}/print/count`)
    const data = await res.json()
    return data.count || 0
  } catch {
    return 0
  }
}

export async function printJob({ imageUrl, imageName, printer, delay = 5 }) {
  const res = await fetch(`${BACKEND_URL}/print/job`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageUrl, imageName, printer, delay }),
  })
  if (!res.ok) {
    const err = await res.json()
    throw new Error(err.error || 'Error al imprimir')
  }
  return res.json()
}

export async function getConfig() {
  const url = `${BACKEND_URL}/config`
  const res = await fetch(url)
  const data = await res.json()
  return data
}

export async function saveConfig(config, textos) {
  const url = `${BACKEND_URL}/config`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ config, textos }),
  })
  const data = await res.json()
  return data
}

export async function processPayment({ token, amount, currency = 'EUR', location_id }) {
  const url = `${BACKEND_URL || ''}/process-payment`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, amount, currency, location_id }),
  })
  const data = await res.json()
  if (!res.ok) {
    throw new Error(data?.errors?.[0]?.detail || data?.error || JSON.stringify(data))
  }
  return data
}

export async function sendPhoto({ event, image, times = 1 }) {
  const res = await fetch(`${BACKEND_URL}/printbox/photo-send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ event, image, times }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data?.error?.message || data?.message || 'Error al enviar foto')
  return data
}

