// Detecta si estamos en local (Electron/dev) o en producción (IONOS)
// En Electron: siempre usar localhost:4000 para todo (viewer, mobile, printer)
// En localhost web: http://localhost:4000 para TODO (viewer, mobile) - mismo backend para sincronizar config
// En producción IONOS: rutas relativas para proxy.php (todos los apps)
const BACKEND_URL = 
  window.electronAPI ? 'http://localhost:4000' : 
  (window.location.hostname === 'localhost' ? 'http://localhost:4000' : 
    '' // Producción: usar rutas relativas para proxy.php
  )

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

export async function getConfig(eventCode = '') {
  // Si eventCode se proporciona, cargar config específica de ese evento
  // Si no, cargar config global (para compatibilidad)
  const queryParam = eventCode ? `?eventCode=${encodeURIComponent(eventCode)}` : ''
  const url = `${BACKEND_URL}/config/${queryParam}`
  try {
    const res = await fetch(url)
    if (!res.ok) {
      // Log the error but return defaults instead of throwing
      console.error(`GET /config returned ${res.status}, using defaults`)
      // Return default config structure
      return {
        config: {
          servidor: 'http://gestion.printboxweb.com',
          evento: '',
          timer: 5,
          impresora: '',
          delay: 5,
        },
        textos: {
          text_es: '¡Consigue tu foto del evento!',
          text_en: 'Get your event photo!',
          text_fr: 'Obtenez votre photo!',
          text_de: 'Hol dir dein Foto!',
          precio1: '5',
          precio2: '9',
          precio3: '12',
          empresa: 'Printbox Adventur',
        },
      }
    }
    const data = await res.json()
    return data
  } catch (error) {
    console.error('Error fetching config:', error)
    // Return defaults on network error
    return {
      config: {
        servidor: 'http://gestion.printboxweb.com',
        evento: '',
        timer: 5,
        impresora: '',
        delay: 5,
      },
      textos: {
        text_es: '¡Consigue tu foto del evento!',
        text_en: 'Get your event photo!',
        text_fr: 'Obtenez votre photo!',
        text_de: 'Hol dir dein Foto!',
        precio1: '5',
        precio2: '9',
        precio3: '12',
        empresa: 'Printbox Adventur',
      },
    }
  }
}

export async function saveConfig(config, textos, eventCode = '') {
  // Si eventCode se proporciona, guardar config específica de ese evento
  // Si no, guardar config global (para compatibilidad)
  // IMPORTANTE: usar /config/ con barra final para evitar redirect 301 de Apache.
  // Sin la barra, Apache redirige /config → /config/ y el redirect convierte POST en GET,
  // perdiendo el body (los precios llegan vacíos al servidor).
  const queryParam = eventCode ? `?eventCode=${encodeURIComponent(eventCode)}` : ''
  const url = `${BACKEND_URL}/config/${queryParam}`
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ config, textos }),
    })
    if (!res.ok) {
      console.error(`POST /config returned ${res.status}`)
      const errorText = await res.text()
      throw new Error(`HTTP ${res.status}: ${errorText.substring(0, 100)}`)
    }
    const data = await res.json()
    return data
  } catch (error) {
    console.error('Error saving config:', error)
    throw error
  }
}

export async function processPayment({ token, amount, currency = 'EUR', location_id }) {
  const url = `${BACKEND_URL || ''}/process-payment`
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, amount, currency, location_id }),
    })
    const data = await res.json()
    
    // Log completo para debuggear
    console.log('Square response:', { status: res.status, ok: res.ok, data })
    
    // Si hay errores en la respuesta de Square, lanzar excepción
    if (data?.errors) {
      const errMsg = data.errors.map(e => e.detail || e.message || JSON.stringify(e)).join(', ')
      throw new Error(`Square error: ${errMsg}`)
    }
    
    // Si HTTP error, lanzar excepción
    if (!res.ok) {
      throw new Error(data?.error || `HTTP ${res.status}: ${JSON.stringify(data)}`)
    }
    
    return data
  } catch (e) {
    console.error('processPayment error:', e)
    throw e
  }
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