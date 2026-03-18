import React, { useState, useEffect, useRef, useCallback } from 'react'
import { findEvent, getEventPhotos, sendPhoto, getConfig } from '../shared/api'
import './Mobile.css'

// ── UTILIDADES ────────────────────────────────────────────────────────────────

function resizeImageBase64(dataUrl, maxSize = 1200) {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      const ratio = Math.min(maxSize / img.width, maxSize / img.height, 1)
      canvas.width  = img.width  * ratio
      canvas.height = img.height * ratio
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
      resolve(canvas.toDataURL('image/jpeg', 0.85))
    }
    img.src = dataUrl
  })
}

// ── PASOS ─────────────────────────────────────────────────────────────────────
const STEP_EVENT    = 'event'
const STEP_GALLERY  = 'gallery'
const STEP_CAMERA   = 'camera'
const STEP_ORDER    = 'order'
const STEP_SUCCESS  = 'success'

// ── COMPONENTE PRINCIPAL ──────────────────────────────────────────────────────
export default function MobileApp() {
  const [step, setStep]           = useState(STEP_EVENT)
  const [eventCode, setEventCode] = useState('')
  const [eventError, setEventError] = useState('')
  const [uuid, setUuid]           = useState(null)
  const [textos, setTextos]       = useState({})
  const [loading, setLoading]     = useState(false)

  // Galería
  const [photos, setPhotos]         = useState([])
  const [page, setPage]             = useState(1)
  const [lastPage, setLastPage]     = useState(1)
  const [loadingPhotos, setLoadingPhotos] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const loaderRef = useRef(null)
  const uuidRef    = useRef(null)

  // Selección
  const [selected, setSelected]   = useState([]) // [{uri, uri_full, copies}]

  // Cámara
  const videoRef    = useRef(null)
  const canvasRef   = useRef(null)
  const streamRef   = useRef(null)
  const [cameraOn, setCameraOn]   = useState(false)
  const [facingMode, setFacingMode] = useState('environment')
  const [capturedPhotos, setCapturedPhotos] = useState([]) // fotos tomadas con cámara

  // Envío
  const [sending, setSending]     = useState(false)
  const [toast, setToast]         = useState(null)

  // Leer evento de la URL (?evento=ev-XXXX)
  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.split('?')[1] || '')
    const ev = params.get('evento')
    if (ev) {
      setEventCode(ev.replace('ev-', ''))
    }
    getConfig().then(d => { if (d.textos) setTextos(d.textos) }).catch(() => {})
  }, [])

  // ── TOAST ──────────────────────────────────────────────────────────────────
  function showToast(msg, duration = 3000) {
    setToast(msg)
    setTimeout(() => setToast(null), duration)
  }

  // ── PASO 1: CONECTAR EVENTO ────────────────────────────────────────────────
  async function handleConnectEvent() {
    const code = eventCode.trim()
    if (!code) { setEventError('Introduce el número del evento'); return }
    setLoading(true); setEventError('')
    try {
      const id = await findEvent(`ev-${code}`)
      setUuid(id)
      uuidRef.current = id
      await loadPhotos(id, 1)
      setStep(STEP_GALLERY)
    } catch (e) {
      setEventError('Evento no encontrado. Verifica el código.')
    } finally { setLoading(false) }
  }

  // ── PASO 2: GALERÍA ────────────────────────────────────────────────────────
  async function loadPhotos(id, p) {
    setLoadingPhotos(true)
    try {
      const { photos: data, lastPage: lp } = await getEventPhotos(id || uuid, p)
      setPhotos(data)
      setLastPage(lp)
      setPage(p)
    } catch { showToast('Error cargando fotos') }
    finally { setLoadingPhotos(false) }
  }

  async function loadMore() {
    if (loadingMore || page >= lastPage) return
    const currentUuid = uuidRef.current || uuid
    if (!currentUuid) return
    setLoadingMore(true)
    try {
      const nextPage = page + 1
      const { photos: data, lastPage: lp } = await getEventPhotos(currentUuid, nextPage)
      setPhotos(prev => [...prev, ...data])
      setLastPage(lp)
      setPage(nextPage)
    } catch { showToast('Error cargando más fotos') }
    finally { setLoadingMore(false) }
  }

  // Intersection Observer para scroll infinito
  useEffect(() => {
    if (!loaderRef.current) return
    const el = loaderRef.current
    const observer = new IntersectionObserver(
      (entries) => { if (entries[0].isIntersecting) loadMore() },
      { threshold: 0.1 }
    )
    observer.observe(el)
    return () => observer.unobserve(el)
  }, [page, lastPage, loadingMore, uuid])

  function toggleSelect(photo) {
    setSelected(prev => {
      const exists = prev.find(p => p.uri === photo.uri)
      if (exists) return prev.filter(p => p.uri !== photo.uri)
      return [...prev, { ...photo, copies: 1 }]
    })
  }

  function isSelected(photo) {
    return selected.some(p => p.uri === photo.uri)
  }

  function updateCopies(uri, copies) {
    setSelected(prev => prev.map(p => p.uri === uri ? { ...p, copies } : p))
  }

  // ── PASO 3: CÁMARA ─────────────────────────────────────────────────────────
  async function startCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      })
      streamRef.current = stream
      if (videoRef.current) videoRef.current.srcObject = stream
      setCameraOn(true)
    } catch { showToast('No se puede acceder a la cámara') }
  }

  function stopCamera() {
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
    setCameraOn(false)
  }

  async function capturePhoto() {
    const video  = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas) return
    canvas.width  = video.videoWidth
    canvas.height = video.videoHeight
    canvas.getContext('2d').drawImage(video, 0, 0)
    const raw = canvas.toDataURL('image/jpeg', 0.92)
    const resized = await resizeImageBase64(raw, 1400)
    setCapturedPhotos(prev => [...prev, { dataUrl: resized, copies: 1, id: Date.now() }])
    showToast('📷 Foto capturada')
  }

  async function flipCamera() {
    stopCamera()
    const next = facingMode === 'environment' ? 'user' : 'environment'
    setFacingMode(next)
  }

  useEffect(() => {
    if (step === STEP_CAMERA) startCamera()
    else stopCamera()
    return () => stopCamera()
  }, [step, facingMode])

  function updateCapturedCopies(id, copies) {
    setCapturedPhotos(prev => prev.map(p => p.id === id ? { ...p, copies } : p))
  }

  function removeCaptured(id) {
    setCapturedPhotos(prev => prev.filter(p => p.id !== id))
  }

  // ── PASO 4: RESUMEN Y ENVÍO ────────────────────────────────────────────────
  const totalCopies = [
    ...selected.map(p => p.copies),
    ...capturedPhotos.map(p => p.copies)
  ].reduce((a, b) => a + b, 0)

  const precio = (copies) => {
    if (copies === 1) return textos.precio1 ? `${textos.precio1}€` : '—'
    if (copies === 2) return textos.precio2 ? `${textos.precio2}€` : '—'
    return textos.precio3 ? `${textos.precio3}€` : '—'
  }

  const totalPrice = () => {
    const all = [
      ...selected.map(p => ({ copies: p.copies })),
      ...capturedPhotos.map(p => ({ copies: p.copies })),
    ]
    return all.reduce((sum, p) => {
      const c = Math.min(p.copies, 3)
      const pr = [0, parseFloat(textos.precio1)||0, parseFloat(textos.precio2)||0, parseFloat(textos.precio3)||0]
      return sum + (pr[c] || 0)
    }, 0).toFixed(2)
  }

  async function handleSendOrder() {
    if (totalCopies === 0) { showToast('No has seleccionado ninguna foto'); return }
    setSending(true)
    try {
      // Enviar fotos de galería seleccionadas
      for (const photo of selected) {
        // Convertir thumbnail URL a base64
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
      // Enviar fotos tomadas con cámara
      for (const photo of capturedPhotos) {
        await sendPhoto({ event: uuid, image: photo.dataUrl, times: photo.copies })
      }
      setStep(STEP_SUCCESS)
    } catch (e) {
      showToast(`Error: ${e.message}`)
    } finally { setSending(false) }
  }

  // ── RENDERS POR PASO ───────────────────────────────────────────────────────

  const StepDots = () => (
    <div className="d-flex justify-content-center gap-2 py-2">
      {[STEP_GALLERY, STEP_CAMERA, STEP_ORDER].map(s => (
        <div key={s} className={`step-dot ${step === s ? 'active' : (
          [STEP_ORDER, STEP_SUCCESS].includes(step) && s !== STEP_ORDER ? 'done' :
          step === STEP_ORDER && s === STEP_CAMERA ? 'done' : ''
        )}`} />
      ))}
    </div>
  )

  // PASO 1 — EVENTO
  if (step === STEP_EVENT) return (
    <div className="mobile-app d-flex flex-column align-items-center justify-content-center px-4" style={{ minHeight: '100dvh' }}>
      <img src="/assets/MoscaPrintbox.png" alt="Logo" className="rounded-3 mb-4" style={{ width: 80 }} />
      <h1 className="fw-bold mb-1" style={{ fontSize: 22, color: '#f7c604' }}>PrintboxAdventures</h1>
      <p className="text-secondary mb-4" style={{ fontSize: 14 }}>Introduce el código del evento</p>

      <div className="w-100" style={{ maxWidth: 320 }}>
        <div className="input-group mb-2">
          <span className="input-group-text bg-black border-secondary text-warning fw-bold" style={{ fontFamily: 'monospace' }}>ev-</span>
          <input
            type="number"
            inputMode="numeric"
            className={`form-control bg-black border-secondary text-light text-center fw-bold ${eventError ? 'is-invalid' : ''}`}
            style={{ fontSize: 24, letterSpacing: 4, fontFamily: 'monospace' }}
            placeholder="000000"
            value={eventCode}
            onChange={e => { setEventCode(e.target.value); setEventError('') }}
            onKeyDown={e => e.key === 'Enter' && handleConnectEvent()}
          />
          {eventError && <div className="invalid-feedback text-center">{eventError}</div>}
        </div>
        <button
          className="btn btn-warning w-100 fw-bold"
          style={{ fontSize: 16 }}
          onClick={handleConnectEvent}
          disabled={loading}
        >
          {loading
            ? <><span className="spinner-border spinner-border-sm me-2" />Conectando...</>
            : <><i className="bi bi-arrow-right-circle me-2" />Entrar al evento</>
          }
        </button>
      </div>
      {toast && <div className="mobile-toast">{toast}</div>}
    </div>
  )

  // PASO 2 — GALERÍA
  if (step === STEP_GALLERY) return (
    <div className="mobile-app" style={{ overflowY: "auto" }}>
      <div className="mobile-header d-flex align-items-center gap-2">
        <img src="/assets/MoscaPrintbox.png" alt="" style={{ width: 32, borderRadius: 6 }} />
        <div className="flex-grow-1">
          <div className="fw-bold" style={{ fontSize: 14, color: '#f7c604' }}>Elige tus fotos</div>
          <div className="text-secondary" style={{ fontSize: 11 }}>Toca para seleccionar • ev-{eventCode}</div>
        </div>
        {selected.length > 0 && (
          <span className="badge bg-warning text-dark fw-bold">{selected.length} sel.</span>
        )}
      </div>

      <StepDots />

      {/* Botón cámara */}
      <div className="px-3 mb-3">
        <button className="btn btn-outline-warning w-100 fw-semibold"
          onClick={() => setStep(STEP_CAMERA)}>
          <i className="bi bi-camera me-2" />Hacer una foto nueva
        </button>
      </div>

      {/* Grid fotos */}
      {loadingPhotos
        ? <div className="text-center py-5"><span className="spinner-border text-warning" /></div>
        : (
          <div className="px-3 mobile-gallery-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
            {photos.map((photo, i) => (
              <div key={i} className={`mobile-photo-card ${isSelected(photo) ? 'selected' : ''}`}
                onClick={() => toggleSelect(photo)}>
                <img src={photo.uri} alt="" loading="lazy" />
                {isSelected(photo) && (
                  <div className="selected-badge">
                    <i className="bi bi-check" />
                  </div>
                )}
              </div>
            ))}
          </div>
        )
      }

      {/* Scroll infinito — loader al final */}
      <div ref={loaderRef} className="text-center py-3">
        {loadingMore && <span className="spinner-border spinner-border-sm text-warning" />}
        {!loadingMore && page >= lastPage && photos.length > 0 && (
          <span className="text-secondary" style={{ fontSize: 12 }}>
            <i className="bi bi-check-circle me-1 text-success" />Todas las fotos cargadas
          </span>
        )}
      </div>

      {/* Footer sticky */}
      <div className="px-3 pb-4 pt-2" style={{ position: 'sticky', bottom: 0, background: '#0a0a0f', borderTop: '1px solid #222', zIndex: 50 }}>
        <button
          className="btn btn-warning w-100 fw-bold"
          style={{ fontSize: 16 }}
          disabled={selected.length === 0 && capturedPhotos.length === 0}
          onClick={() => setStep(STEP_ORDER)}
        >
          <i className="bi bi-bag-check me-2" />
          Ver pedido ({selected.length + capturedPhotos.length} fotos)
        </button>
      </div>

      {toast && <div className="mobile-toast">{toast}</div>}
    </div>
  )

  // PASO 3 — CÁMARA
  if (step === STEP_CAMERA) return (
    <div className="mobile-app d-flex flex-column" style={{ minHeight: '100dvh' }}>
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

      <div className="px-3 flex-grow-1 d-flex flex-column gap-3">
        {/* Preview cámara */}
        <video ref={videoRef} autoPlay playsInline muted className="camera-preview" />
        <canvas ref={canvasRef} style={{ display: 'none' }} />

        {/* Disparador */}
        <div className="d-flex justify-content-center">
          <button className="shutter-btn" onClick={capturePhoto} />
        </div>

        {/* Miniaturas capturadas */}
        {capturedPhotos.length > 0 && (
          <div>
            <p className="text-secondary mb-2" style={{ fontSize: 12 }}>Fotos tomadas ({capturedPhotos.length})</p>
            <div className="d-flex gap-2 flex-wrap">
              {capturedPhotos.map(p => (
                <div key={p.id} className="position-relative">
                  <img src={p.dataUrl} alt="" style={{ width: 60, height: 80, objectFit: 'cover', borderRadius: 6, border: '2px solid #f7c604' }} />
                  <button className="btn btn-sm btn-danger position-absolute p-0"
                    style={{ top: -6, right: -6, width: 20, height: 20, fontSize: 10, borderRadius: '50%' }}
                    onClick={() => removeCaptured(p.id)}>
                    <i className="bi bi-x" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Ir al pedido */}
        {capturedPhotos.length > 0 && (
          <button className="btn btn-warning fw-bold w-100" onClick={() => setStep(STEP_ORDER)}>
            <i className="bi bi-bag-check me-2" />Continuar con {capturedPhotos.length} foto{capturedPhotos.length > 1 ? 's' : ''}
          </button>
        )}
      </div>

      {toast && <div className="mobile-toast">{toast}</div>}
    </div>
  )

  // PASO 4 — RESUMEN PEDIDO
  if (step === STEP_ORDER) return (
    <div className="mobile-app d-flex flex-column" style={{ minHeight: '100dvh' }}>
      <div className="mobile-header d-flex align-items-center gap-2">
        <button className="btn btn-sm btn-outline-secondary" onClick={() => setStep(STEP_GALLERY)}>
          <i className="bi bi-arrow-left" />
        </button>
        <span className="fw-bold" style={{ color: '#f7c604' }}>Tu pedido</span>
      </div>

      <StepDots />

      <div className="px-3 flex-grow-1 py-3 d-flex flex-column gap-3">

        {/* Fotos de galería */}
        {selected.map((photo, i) => (
          <div key={i} className="d-flex align-items-center gap-3 bg-black rounded-3 p-2">
            <img src={photo.uri} alt="" className="order-photo-thumb" />
            <div className="flex-grow-1">
              <div className="text-secondary" style={{ fontSize: 12 }}>Foto del evento</div>
              <div className="d-flex align-items-center gap-2 mt-1">
                <span className="text-secondary small">Copias:</span>
                {[1, 2, 3].map(n => (
                  <button key={n}
                    className={`btn btn-sm px-2 py-0 ${photo.copies === n ? 'btn-warning text-dark fw-bold' : 'btn-outline-secondary'}`}
                    onClick={() => updateCopies(photo.uri, n)}>
                    {n}
                  </button>
                ))}
                <span className="ms-auto text-warning fw-bold">{precio(photo.copies)}</span>
              </div>
            </div>
            <button className="btn btn-sm btn-outline-danger" onClick={() => toggleSelect(photo)}>
              <i className="bi bi-trash" />
            </button>
          </div>
        ))}

        {/* Fotos de cámara */}
        {capturedPhotos.map((photo) => (
          <div key={photo.id} className="d-flex align-items-center gap-3 bg-black rounded-3 p-2">
            <img src={photo.dataUrl} alt="" className="order-photo-thumb" />
            <div className="flex-grow-1">
              <div className="text-secondary" style={{ fontSize: 12 }}>Foto tomada</div>
              <div className="d-flex align-items-center gap-2 mt-1">
                <span className="text-secondary small">Copias:</span>
                {[1, 2, 3].map(n => (
                  <button key={n}
                    className={`btn btn-sm px-2 py-0 ${photo.copies === n ? 'btn-warning text-dark fw-bold' : 'btn-outline-secondary'}`}
                    onClick={() => updateCapturedCopies(photo.id, n)}>
                    {n}
                  </button>
                ))}
                <span className="ms-auto text-warning fw-bold">{precio(photo.copies)}</span>
              </div>
            </div>
            <button className="btn btn-sm btn-outline-danger" onClick={() => removeCaptured(photo.id)}>
              <i className="bi bi-trash" />
            </button>
          </div>
        ))}

        {/* Total */}
        <div className="d-flex justify-content-between align-items-center bg-black rounded-3 p-3 mt-2">
          <span className="fw-bold">Total</span>
          <span className="fw-bold text-warning" style={{ fontSize: 22 }}>{totalPrice()}€</span>
        </div>

        <div className="alert alert-secondary py-2 px-3 d-flex align-items-center gap-2 border-0" style={{ background: '#1a1a2e', fontSize: 13 }}>
          <i className="bi bi-credit-card text-warning" />
          El operador se acercará con el datáfono para cobrar
        </div>
      </div>

      <div className="px-3 pb-4 pt-2" style={{ borderTop: '1px solid #222' }}>
        <button
          className="btn btn-warning w-100 fw-bold"
          style={{ fontSize: 16 }}
          onClick={handleSendOrder}
          disabled={sending || totalCopies === 0}
        >
          {sending
            ? <><span className="spinner-border spinner-border-sm me-2" />Enviando...</>
            : <><i className="bi bi-send me-2" />Confirmar pedido • {totalPrice()}€</>
          }
        </button>
      </div>

      {toast && <div className="mobile-toast">{toast}</div>}
    </div>
  )

  // PASO 5 — ÉXITO
  if (step === STEP_SUCCESS) return (
    <div className="mobile-app d-flex flex-column align-items-center justify-content-center px-4 text-center" style={{ minHeight: '100dvh' }}>
      <div style={{ fontSize: 72 }}>🎉</div>
      <h2 className="fw-bold mt-3" style={{ color: '#f7c604' }}>¡Pedido enviado!</h2>
      <p className="text-secondary mt-2">El operador recibirá tu pedido y se acercará con el datáfono para cobrar.</p>
      <p className="text-secondary" style={{ fontSize: 13 }}>Tus fotos se imprimirán en breve.</p>

      <button className="btn btn-outline-warning mt-4"
        onClick={() => {
          setSelected([])
          setCapturedPhotos([])
          setStep(STEP_GALLERY)
        }}>
        <i className="bi bi-arrow-left me-2" />Volver a la galería
      </button>

      {textos?.empresa && (
        <p className="text-secondary mt-5" style={{ fontSize: 12 }}>
          <i className="bi bi-camera me-1" />{textos.empresa}
        </p>
      )}
    </div>
  )

  return null
}