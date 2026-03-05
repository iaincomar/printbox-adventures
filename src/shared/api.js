// Servicio que encapsula todas las llamadas a la API de Printbox
// Base URL: http://gestion.printboxweb.com

const BASE_URL = 'http://gestion.printboxweb.com'
const BACKEND_URL = window.electronAPI?.backendUrl || 'http://localhost:4000'

// ─── API Printbox ────────────────────────────────────────────────────────────

/**
 * Busca un evento por código y devuelve su UUID
 * @param {string} eventCode - Ej: "ev-1234"
 */
export async function findEvent(eventCode) {
  const res = await fetch(`${BASE_URL}/api/v1/events/find`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: eventCode }),
  })
  if (!res.ok) throw new Error(`Error al buscar evento: ${res.status}`)
  const data = await res.json()
  return data.data.uuid
}

/**
 * Obtiene la galería paginada de un evento (thumbnails para el Viewer)
 * @param {string} uuid
 * @param {number} page
 */
export async function getEventPhotos(uuid, page = 1) {
  const res = await fetch(`${BASE_URL}/api/v1/events/photos?page=${page}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ event: uuid }),
  })
  if (!res.ok) throw new Error(`Error al obtener fotos: ${res.status}`)
  const data = await res.json()
  // data.data = array de fotos, data.last_page = total páginas
  return {
    photos: data.data,
    lastPage: data.last_page,
  }
}

/**
 * Obtiene las fotos nuevas a imprimir (con campo 'times') para el Printer
 * @param {string} uuid
 */
export async function getPhotosToPrint(uuid) {
  const res = await fetch(`${BASE_URL}/api/v1/events/photos_two`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ event: uuid }),
  })
  if (!res.ok) throw new Error(`Error al obtener fotos para imprimir: ${res.status}`)
  const data = await res.json()
  // data.values = array de fotos con uri_full y times
  return data.values || []
}

// ─── Backend local (impresión) ───────────────────────────────────────────────

export async function getPrinters() {
  const res = await fetch(`${BACKEND_URL}/print/printers`)
  const data = await res.json()
  return data.printers || []
}

export async function getPrintCount() {
  const res = await fetch(`${BACKEND_URL}/print/count`)
  const data = await res.json()
  return data.count || 0
}

/**
 * Envía un trabajo de impresión al backend local
 * @param {string} imageUrl - URL completa de la imagen en alta resolución
 * @param {string} imageName - Nombre del archivo para guardar
 * @param {string} printer - Nombre de la impresora
 * @param {number} delay - Segundos de espera antes de imprimir
 */
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
