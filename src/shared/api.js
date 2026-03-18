// Todas las llamadas a gestion.printboxweb.com van a través del backend local
// para evitar problemas de CORS desde navegador/Electron renderer

const BACKEND_URL =
  typeof window !== 'undefined' && window.electronAPI?.backendUrl
    ? window.electronAPI.backendUrl
    : 'http://localhost:4000'

// ─── API Printbox (proxiada por el backend) ──────────────────────────────────

/** Busca un evento por código y devuelve su UUID. Ej: "ev-1234" */
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

/** Galería paginada del evento (thumbnails para el Viewer) */
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

/** Fotos nuevas a imprimir con campo 'times' (para el Printer) */
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

// ─── Backend local ────────────────────────────────────────────────────────────

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

/** Descarga imagen, la convierte a PDF y la envía a la impresora */
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
  const res = await fetch(`${BACKEND_URL}/config`)
  return res.json()
}

export async function saveConfig(config, textos) {
  const res = await fetch(`${BACKEND_URL}/config`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ config, textos }),
  })
  return res.json()
}

/** Sube una foto al evento (base64) con número de copias */
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