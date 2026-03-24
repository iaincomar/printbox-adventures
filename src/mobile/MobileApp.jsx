import React, { useState, useEffect, useRef, useCallback } from 'react'
import { findEvent, getEventPhotos, sendPhoto, getConfig } from '../shared/api'
import './Mobile.css'

// ============================================
// UTILIDADES
// ============================================

/**
 * Redimensiona una imagen en base64 a un tamaño máximo
 * @param {string} dataUrl - Imagen en formato base64
 * @param {number} maxSize - Tamaño máximo en píxeles
 * @returns {Promise<string>} - Imagen redimensionada en base64
 */
function resizeImageBase64(dataUrl, maxSize = 1200) {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      const ratio = Math.min(maxSize / img.width, maxSize / img.height, 1)
      canvas.width = img.width * ratio
      canvas.height = img.height * ratio
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
      resolve(canvas.toDataURL('image/jpeg', 0.85))
    }
    img.src = dataUrl
  })
}

// ============================================
// CONSTANTES DE PASOS
// ============================================
const STEP_EVENT = 'event'      // Paso 1: Ingresar código del evento
const STEP_GALLERY = 'gallery'  // Paso 2: Ver galería y seleccionar fotos
const STEP_CAMERA = 'camera'    // Paso 3: Tomar fotos con la cámara
const STEP_ORDER = 'order'      // Paso 4: Resumen del pedido
const STEP_SUCCESS = 'success'  // Paso 5: Confirmación de envío

// ============================================
// COMPONENTE PRINCIPAL
// ============================================
export default function MobileApp() {
  // --- Estados del flujo ---
  const [step, setStep] = useState(STEP_EVENT)           // Paso actual
  const [eventCode, setEventCode] = useState('')         // Código del evento (ej: "123456")
  const [eventError, setEventError] = useState('')       // Error al conectar evento
  const [uuid, setUuid] = useState(null)                 // UUID del evento (devuelto por API)
  const [textos, setTextos] = useState({})               // Textos y precios del evento
  const [loading, setLoading] = useState(false)          // Estado de carga

  // --- Estados de galería ---
  const [photos, setPhotos] = useState([])               // Lista de fotos del evento
  const [page, setPage] = useState(1)                    // Página actual (paginación)
  const [lastPage, setLastPage] = useState(1)            // Última página disponible
  const [loadingPhotos, setLoadingPhotos] = useState(false) // Cargando fotos
  const [loadingMore, setLoadingMore] = useState(false)  // Cargando más fotos (infinite scroll)
  const loaderRef = useRef(null)                         // Referencia para el observer de infinite scroll
  const uuidRef = useRef(null)                           // Referencia mutable del UUID

  // --- Estados de selección ---
  const [selected, setSelected] = useState([])           // Fotos seleccionadas de la galería [{uri, uri_full, copies}]

  // --- Estados de cámara ---
  const videoRef = useRef(null)                          // Referencia al elemento video
  const canvasRef = useRef(null)                         // Referencia al canvas para capturar
  const streamRef = useRef(null)                         // Referencia al stream de la cámara
  const [cameraOn, setCameraOn] = useState(false)        // Indicador si la cámara está activa
  const [facingMode, setFacingMode] = useState('environment') // Modo de cámara: 'user' (frontal) o 'environment' (trasera)
  const [capturedPhotos, setCapturedPhotos] = useState([])     // Fotos tomadas con la cámara [{dataUrl, copies, id}]

  // --- Estados de envío ---
  const [sending, setSending] = useState(false)          // Enviando pedido
  const [toast, setToast] = useState(null)               // Mensaje de toast

  // ============================================
  // EFECTOS DE INICIALIZACIÓN
  // ============================================

  /**
   * Forzar scroll en body para dispositivos móviles
   * Permite que la app móvil tenga scroll natural
   */
  useEffect(() => {
    document.documentElement.style.overflow = 'auto'
    document.documentElement.style.height = 'auto'
    document.body.style.overflow = 'auto'
    document.body.style.height = 'auto'
    const root = document.getElementById('root')
    if (root) {
      root.style.overflow = 'auto'
      root.style.height = 'auto'
    }
    return () => {
      // Limpiar estilos al desmontar
      document.documentElement.style.overflow = ''
      document.documentElement.style.height = ''
      document.body.style.overflow = ''
      document.body.style.height = ''
      if (root) {
        root.style.overflow = ''
        root.style.height = ''
      }
    }
  }, [])

  /**
   * Leer evento de la URL y cargar configuración
   * Ejemplo: #?evento=ev-123456
   */
  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.split('?')[1] || '')
    const ev = params.get('evento')
    if (ev) {
      setEventCode(ev.replace('ev-', ''))
    }
    getConfig().then(d => {
      if (d.textos) setTextos(d.textos)
    }).catch(() => {})
  }, [])

  // ============================================
  // FUNCIONES UTILITARIAS
  // ============================================

  /**
   * Muestra un mensaje temporal (toast)
   * @param {string} msg - Mensaje a mostrar
   * @param {number} duration - Duración en milisegundos
   */
  function showToast(msg, duration = 3000) {
    setToast(msg)
    setTimeout(() => setToast(null), duration)
  }

  // ============================================
  // PASO 1: CONECTAR EVENTO
  // ============================================

  /**
   * Conectar al evento con el código ingresado
   */
  async function handleConnectEvent() {
    const code = eventCode.trim()
    if (!code) {
      setEventError('Introduce el número del evento')
      return
    }
    setLoading(true)
    setEventError('')
    try {
      const id = await findEvent(`ev-${code}`)
      setUuid(id)
      uuidRef.current = id
      await loadPhotos(id, 1)
      setStep(STEP_GALLERY)
    } catch (e) {
      setEventError('Evento no encontrado. Verifica el código.')
    } finally {
      setLoading(false)
    }
  }

  // ============================================
  // PASO 2: GALERÍA - CARGAR FOTOS
  // ============================================

  /**
   * Cargar fotos del evento (carga todas las páginas de una vez)
   * @param {string} id - UUID del evento
   * @param {number} p - Página inicial
   */
  async function loadPhotos(id, p) {
    setLoadingPhotos(true)
    try {
      const { photos: data, lastPage: lp } = await getEventPhotos(id || uuid, p)
      setPhotos(data)
      setLastPage(lp)
      setPage(p)

      // Si hay más de una página, cargar todas las páginas restantes
      if (lp > 1) {
        const rest = []
        for (let i = 2; i <= lp; i++) {
          const { photos: more } = await getEventPhotos(id || uuid, i)
          rest.push(...more)
        }
        setPhotos(prev => [...prev, ...rest])
        setPage(lp)
      }
    } catch {
      showToast('Error cargando fotos')
    } finally {
      setLoadingPhotos(false)
    }
  }

  /**
   * Alternar selección de una foto en la galería
   * @param {Object} photo - Objeto de la foto
   */
  function toggleSelect(photo) {
    setSelected(prev => {
      const exists = prev.find(p => p.uri === photo.uri)
      if (exists) return prev.filter(p => p.uri !== photo.uri)
      return [...prev, { ...photo, copies: 1 }]
    })
  }

  /**
   * Verificar si una foto está seleccionada
   * @param {Object} photo - Objeto de la foto
   * @returns {boolean}
   */
  function isSelected(photo) {
    return selected.some(p => p.uri === photo.uri)
  }

  /**
   * Actualizar número de copias de una foto seleccionada
   * @param {string} uri - URI de la foto
   * @param {number} copies - Número de copias (1, 2 o 3)
   */
  function updateCopies(uri, copies) {
    setSelected(prev => prev.map(p => p.uri === uri ? { ...p, copies } : p))
  }

  // ============================================
  // PASO 3: CÁMARA
  // ============================================

  /**
   * Iniciar la cámara del dispositivo
   */
  async function startCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      })
      streamRef.current = stream
      if (videoRef.current) videoRef.current.srcObject = stream
      setCameraOn(true)
    } catch {
      showToast('No se puede acceder a la cámara')
    }
  }

  /**
   * Detener la cámara
   */
  function stopCamera() {
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
    setCameraOn(false)
  }

  /**
   * Capturar una foto desde la cámara
   */
  async function capturePhoto() {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas) return

    // Configurar canvas con las dimensiones del video
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    canvas.getContext('2d').drawImage(video, 0, 0)

    // Capturar y redimensionar la imagen
    const raw = canvas.toDataURL('image/jpeg', 0.92)
    const resized = await resizeImageBase64(raw, 1400)

    // Agregar a la lista de fotos capturadas
    setCapturedPhotos(prev => [...prev, { dataUrl: resized, copies: 1, id: Date.now() }])
    showToast('📷 Foto capturada')
  }

  /**
   * Cambiar entre cámara frontal y trasera
   */
  async function flipCamera() {
    stopCamera()
    const next = facingMode === 'environment' ? 'user' : 'environment'
    setFacingMode(next)
  }

  /**
   * Controlar inicio/parada de cámara según el paso actual
   */
  useEffect(() => {
    if (step === STEP_CAMERA) startCamera()
    else stopCamera()
    return () => stopCamera()
  }, [step, facingMode])

  /**
   * Actualizar número de copias de una foto capturada
   * @param {number} id - ID único de la foto capturada
   * @param {number} copies - Número de copias
   */
  function updateCapturedCopies(id, copies) {
    setCapturedPhotos(prev => prev.map(p => p.id === id ? { ...p, copies } : p))
  }

  /**
   * Eliminar una foto capturada
   * @param {number} id - ID único de la foto capturada
   */
  function removeCaptured(id) {
    setCapturedPhotos(prev => prev.filter(p => p.id !== id))
  }

  // ============================================
  // PASO 4: RESUMEN Y ENVÍO
  // ============================================

  /**
   * Calcular el total de copias (galería + cámara)
   */
  const totalCopies = [
    ...selected.map(p => p.copies),
    ...capturedPhotos.map(p => p.copies)
  ].reduce((a, b) => a + b, 0)

  /**
   * Calcular el precio por foto según el número de copias
   * @param {number} copies - Número de copias (1, 2 o 3)
   * @returns {number} - Precio en euros
   */
  const priceForPhoto = (copies) => {
    const c = Math.min(copies, 3)
    // Valores por defecto si textos no está cargado
    const p1 = parseFloat(textos.precio1) || 5
    const p2 = parseFloat(textos.precio2) || 9
    const p3 = parseFloat(textos.precio3) || 12
    const prices = [0, p1, p2, p3]
    return prices[c] || 0
  }

  /**
   * Obtener el precio formateado para una foto
   * @param {number} copies - Número de copias
   * @returns {string} - Precio formateado (ej: "5.00€")
   */
  const precio = (copies) => {
    const p = priceForPhoto(copies)
    return p ? `${p.toFixed(2)}€` : '—'
  }

  /**
   * Calcular el precio total del pedido
   * @returns {string} - Total formateado
   */
  const totalPrice = () => {
    const all = [
      ...selected.map(p => p.copies),
      ...capturedPhotos.map(p => p.copies),
    ]
    return all.reduce((sum, copies) => sum + priceForPhoto(copies), 0).toFixed(2)
  }

  /**
   * Enviar el pedido al servidor
   */
  async function handleSendOrder() {
    if (totalCopies === 0) {
      showToast('No has seleccionado ninguna foto')
      return
    }
    setSending(true)
    try {
      // Enviar fotos de la galería seleccionadas
      for (const photo of selected) {
        // Convertir URL de la foto a base64
        const resp = await fetch(photo.uri_full || photo.uri)
        const blob = await resp.blob()
        const base64 = await new Promise(res => {
          const reader = new FileReader()
          reader.onload = () => res(reader.result)
          reader.readAsDataURL(blob)
        })
        const resized = await resizeImageBase64(base64, 1400)
        await sendPhoto({ event: uuid, image: resized, times: photo.copies })
      }

      // Enviar fotos tomadas con la cámara
      for (const photo of capturedPhotos) {
        await sendPhoto({ event: uuid, image: photo.dataUrl, times: photo.copies })
      }

      setStep(STEP_SUCCESS)
    } catch (e) {
      showToast(`Error: ${e.message}`)
    } finally {
      setSending(false)
    }
  }

  // ============================================
  // COMPONENTES DE UI
  // ============================================

  /**
   * Indicador visual de progreso (puntos)
   */
  const StepDots = () => (
    <div className="d-flex justify-content-center gap-2 py-2">
      {[STEP_GALLERY, STEP_CAMERA, STEP_ORDER].map(s => (
        <div
          key={s}
          className={`step-dot ${
            step === s ? 'active' : (
              [STEP_ORDER, STEP_SUCCESS].includes(step) && s !== STEP_ORDER ? 'done' :
              step === STEP_ORDER && s === STEP_CAMERA ? 'done' : ''
            )
          }`}
        />
      ))}
    </div>
  )

  // ============================================
  // RENDER POR PASO
  // ============================================

  // --- PASO 1: EVENTO ---
  if (step === STEP_EVENT) {
    return (
      <div className="mobile-app event-container">
        <img src="/assets/MoscaPrintbox.png" alt="Logo" className="event-logo" />
        <h1 className="event-title">PrintboxAdventures</h1>
        <p className="event-subtitle">Introduce el código del evento</p>

        <div className="event-input-wrapper">
          <div className="input-group event-input-group">
            <span className="input-group-text event-input-prefix">ev-</span>
            <input
              type="number"
              inputMode="numeric"
              className={`form-control event-input ${eventError ? 'is-invalid' : ''}`}
              placeholder="000000"
              value={eventCode}
              onChange={e => { setEventCode(e.target.value); setEventError('') }}
              onKeyDown={e => e.key === 'Enter' && handleConnectEvent()}
            />
            {eventError && <div className="invalid-feedback text-center">{eventError}</div>}
          </div>
          <button
            className="btn btn-warning event-button"
            onClick={handleConnectEvent}
            disabled={loading}
          >
            {loading ? (
              <>
                <span className="spinner-border spinner-border-sm me-2" />
                Conectando...
              </>
            ) : (
              <>
                <i className="bi bi-arrow-right-circle me-2" />
                Entrar al evento
              </>
            )}
          </button>
        </div>
        {toast && <div className="mobile-toast">{toast}</div>}
      </div>
    )
  }

  // --- PASO 2: GALERÍA ---
  if (step === STEP_GALLERY) {
    return (
      <div className="mobile-app">
        {/* Header */}
        <div className="mobile-header d-flex align-items-center gap-2">
          <img src="/assets/MoscaPrintbox.png" alt="" className="mobile-header-logo" />
          <div className="flex-grow-1">
            <div className="mobile-header-title">Elige tus fotos</div>
            <div className="mobile-header-subtitle">Toca para seleccionar • ev-{eventCode}</div>
          </div>
          <button
            className="btn btn-sm btn-outline-warning mobile-header-edit"
            onClick={() => {
              setStep(STEP_EVENT)
              setPhotos([])
              setSelected([])
              setCapturedPhotos([])
            }}
          >
            <i className="bi bi-pencil" />
          </button>
        </div>

        <StepDots />

        {/* Botón para abrir cámara */}
        <div className="camera-button">
          <button
            className="btn btn-outline-warning w-100 fw-semibold"
            onClick={() => setStep(STEP_CAMERA)}
          >
            <i className="bi bi-camera me-2" />
            Hacer una foto nueva
          </button>
        </div>

        {/* Grid de fotos */}
        {loadingPhotos ? (
          <div className="gallery-loader">
            <span className="spinner-border text-warning" />
          </div>
        ) : (
          <div className="gallery-grid">
            {photos.map((photo, i) => (
              <div
                key={i}
                className={`mobile-photo-card ${isSelected(photo) ? 'selected' : ''}`}
                onClick={() => toggleSelect(photo)}
              >
                <img src={photo.uri} alt="" loading="lazy" />
                {isSelected(photo) && (
                  <div className="selected-badge">
                    <i className="bi bi-check" />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Indicador de fin de carga */}
        <div ref={loaderRef} className="infinite-loader">
          {loadingMore && <span className="spinner-border spinner-border-sm text-warning" />}
          {!loadingMore && page >= lastPage && photos.length > 0 && (
            <span className="all-loaded-text">
              <i className="bi bi-check-circle me-1 text-success" />
              Todas las fotos cargadas
            </span>
          )}
        </div>

        {/* Barra flotante de pedido */}
        {(selected.length > 0 || capturedPhotos.length > 0) && (
          <div className="order-float-button">
            <button
              className="btn btn-warning w-100 fw-bold shadow-lg"
              onClick={() => setStep(STEP_ORDER)}
            >
              <i className="bi bi-bag-check me-2" />
              Ver pedido ({selected.length + capturedPhotos.length} foto
              {selected.length + capturedPhotos.length > 1 ? 's' : ''})
            </button>
          </div>
        )}

        {toast && <div className="mobile-toast">{toast}</div>}
      </div>
    )
  }

  // --- PASO 3: CÁMARA ---
  if (step === STEP_CAMERA) {
    return (
      <div className="mobile-app d-flex flex-column" style={{ minHeight: '100dvh' }}>
        {/* Header */}
        <div className="mobile-header d-flex align-items-center gap-2">
          <button className="btn btn-sm btn-outline-secondary" onClick={() => setStep(STEP_GALLERY)}>
            <i className="bi bi-arrow-left" />
          </button>
          <span className="fw-bold" style={{ color: '#f7c604' }}>Hacer foto</span>
          <button className="btn btn-sm btn-outline-secondary ms-auto" onClick={flipCamera}>
            <i className="bi bi-arrow-repeat" />
          </button>
        </div>

        <StepDots />

        <div className="camera-container">
          {/* Preview de cámara */}
          <video ref={videoRef} autoPlay playsInline muted className="camera-preview" />
          <canvas ref={canvasRef} style={{ display: 'none' }} />

          {/* Botón disparador */}
          <div className="camera-shutter">
            <button className="shutter-btn" onClick={capturePhoto} />
          </div>

          {/* Miniaturas de fotos capturadas */}
          {capturedPhotos.length > 0 && (
            <div className="captured-section">
              <p className="captured-title">Fotos tomadas ({capturedPhotos.length})</p>
              <div className="captured-thumbnails">
                {capturedPhotos.map(p => (
                  <div key={p.id} className="captured-thumb-wrapper">
                    <img src={p.dataUrl} alt="" className="captured-thumb" />
                    <button
                      className="btn btn-sm btn-danger captured-remove-btn"
                      onClick={() => removeCaptured(p.id)}
                    >
                      <i className="bi bi-x" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Botón para continuar */}
          {capturedPhotos.length > 0 && (
            <button
              className="btn btn-warning fw-bold w-100 continue-button"
              onClick={() => setStep(STEP_ORDER)}
            >
              <i className="bi bi-bag-check me-2" />
              Continuar con {capturedPhotos.length} foto{capturedPhotos.length > 1 ? 's' : ''}
            </button>
          )}
        </div>

        {toast && <div className="mobile-toast">{toast}</div>}
      </div>
    )
  }

  // --- PASO 4: RESUMEN DEL PEDIDO ---
  if (step === STEP_ORDER) {
    return (
      <div className="mobile-app d-flex flex-column" style={{ minHeight: '100dvh' }}>
        {/* Header */}
        <div className="mobile-header d-flex align-items-center gap-2">
          <button className="btn btn-sm btn-outline-secondary" onClick={() => setStep(STEP_GALLERY)}>
            <i className="bi bi-arrow-left" />
          </button>
          <span className="fw-bold" style={{ color: '#f7c604' }}>Tu pedido</span>
        </div>

        <StepDots />

        <div className="order-summary-container">
          {/* Fotos de galería */}
          {selected.map((photo, i) => (
            <div key={i} className="order-photo-item">
              <img src={photo.uri} alt="" className="order-photo-thumb" />
              <div className="order-photo-info">
                <div className="order-photo-label">Foto del evento</div>
                <div className="order-copies-selector">
                  <span className="order-copies-label">Copias:</span>
                  {[1, 2, 3].map(n => (
                    <button
                      key={n}
                      className={`btn btn-sm order-copies-btn ${
                        photo.copies === n ? 'order-copies-btn-active' : 'order-copies-btn-inactive'
                      }`}
                      onClick={() => updateCopies(photo.uri, n)}
                    >
                      {n}
                    </button>
                  ))}
                  <span className="order-price">{precio(photo.copies)}</span>
                </div>
              </div>
              <button
                className="btn btn-sm btn-outline-danger order-delete-btn"
                onClick={() => toggleSelect(photo)}
              >
                <i className="bi bi-trash" />
              </button>
            </div>
          ))}

          {/* Fotos de cámara */}
          {capturedPhotos.map((photo) => (
            <div key={photo.id} className="order-photo-item">
              <img src={photo.dataUrl} alt="" className="order-photo-thumb" />
              <div className="order-photo-info">
                <div className="order-photo-label">Foto tomada</div>
                <div className="order-copies-selector">
                  <span className="order-copies-label">Copias:</span>
                  {[1, 2, 3].map(n => (
                    <button
                      key={n}
                      className={`btn btn-sm order-copies-btn ${
                        photo.copies === n ? 'order-copies-btn-active' : 'order-copies-btn-inactive'
                      }`}
                      onClick={() => updateCapturedCopies(photo.id, n)}
                    >
                      {n}
                    </button>
                  ))}
                  <span className="order-price">{precio(photo.copies)}</span>
                </div>
              </div>
              <button
                className="btn btn-sm btn-outline-danger order-delete-btn"
                onClick={() => removeCaptured(photo.id)}
              >
                <i className="bi bi-trash" />
              </button>
            </div>
          ))}

          {/* Total del pedido */}
          <div className="order-total-box">
            <span className="order-total-label">Total</span>
            <span className="order-total-amount">{totalPrice()}€</span>
          </div>

          {/* Nota de pago */}
          <div className="alert alert-secondary order-payment-note">
            <i className="bi bi-credit-card text-warning" />
            El operador se acercará con el datáfono para cobrar
          </div>
        </div>

        {/* Footer con botón de confirmación */}
        <div className="order-footer">
          <button
            className="btn btn-warning order-confirm-btn"
            onClick={handleSendOrder}
            disabled={sending || totalCopies === 0}
          >
            {sending ? (
              <>
                <span className="spinner-border spinner-border-sm me-2" />
                Enviando...
              </>
            ) : (
              <>
                <i className="bi bi-send me-2" />
                Confirmar pedido • {totalPrice()}€
              </>
            )}
          </button>
        </div>

        {toast && <div className="mobile-toast">{toast}</div>}
      </div>
    )
  }

  // --- PASO 5: ÉXITO ---
  if (step === STEP_SUCCESS) {
    return (
      <div className="mobile-app success-container">
        <div className="success-icon">🎉</div>
        <h2 className="success-title">¡Pedido enviado!</h2>
        <p className="success-text">
          El operador recibirá tu pedido y se acercará con el datáfono para cobrar.
        </p>
        <p className="success-small-text">Tus fotos se imprimirán en breve.</p>

        <button
          className="btn btn-outline-warning back-button"
          onClick={() => {
            setSelected([])
            setCapturedPhotos([])
            setStep(STEP_GALLERY)
          }}
        >
          <i className="bi bi-arrow-left me-2" />
          Volver a la galería
        </button>

        {textos?.empresa && (
          <p className="company-footer">
            <i className="bi bi-camera me-1" />
            {textos.empresa}
          </p>
        )}
      </div>
    )
  }

  return null
}