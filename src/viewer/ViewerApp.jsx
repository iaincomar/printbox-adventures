import React, { useState, useEffect, useCallback, useRef } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { findEvent, getEventPhotos, printJob, saveConfig } from '../shared/api'
import { useInterval } from '../shared/hooks/useInterval'
import './Viewer.css'

// URL del backend (desde Electron o localhost)
const BACKEND = window.electronAPI?.backendUrl || 'https://printbox.incomar.net'

// Contenido de privacidad por defecto (fallback)
const defaultPrivacyContent = `
<div style="text-align:center;">
    <h4><b> Condiciones y políticas de uso </b></h4><br>
</div>
<div style="text-align:justify;">
    <p> La Aplicación Printbox Adventure está desarrollada, diseñada y publicada por Jorge Marí Grimalt y
        domicilio C/Patricio Ferrandiz 3 Bjo C Incomar en Dénia, Alicante. Las condiciones de
        servicio y uso (las "Condiciones de Uso") rigen el acceso a la aplicación móvil PrintBox Adventure así
        como el uso del Sitio y de los servicios que usted (el "Usuario") realice. </p>
    <p> Para consultar nuestras políticas de privacidad, acceda en el siguiente enlace: </p>
</div>
`

// ============================================
// FUNCIÓN PARA CORREGIR URLs DE IMÁGENES
// ============================================
function fixImageUrl(url) {
  if (!url) return ''

  // Siempre usar proxy en ambos entornos
  if (url.includes('/proxy-image')) {
    return url
  }

  try {
    const parsed = new URL(url)
    // Extraer pathname de la URL y construir ruta proxy
    return '/proxy-image' + parsed.pathname
  } catch {
    // Si no es una URL válida, intentar asumir que es una ruta
    if (url.startsWith('/')) {
      return '/proxy-image' + url
    }
    return url
  }
}

// ============================================
// COMPONENTE PRINCIPAL - VISOR DE FOTOS
// ============================================
export default function ViewerApp() {
  // --- Estados de configuración ---
  const [config, setConfig] = useState(null)
  const [textos, setTextos] = useState(null)
  const [uuid, setUuid] = useState(null)
  const [photos, setPhotos] = useState([])         // Ya no se usa directamente, lo mantenemos por compatibilidad
  const [allPhotos, setAllPhotos] = useState([])   // Almacena todas las fotos cargadas
  const [currentPage, setCurrentPage] = useState(1)
  const [lastPage, setLastPage] = useState(1)
  const [printCount, setPrintCount] = useState(0)
  const [error, setError] = useState(null)
  const [showQR, setShowQR] = useState(false)
  const [autoplay, setAutoplay] = useState(false)
  const [loading, setLoading] = useState(false)

  // --- Estados de modales ---
  const [showEventModal, setShowEventModal] = useState(false)
  const [eventInput, setEventInput] = useState('')
  const [eventError, setEventError] = useState('')
  const inputRef = useRef(null)

  // --- Estados de admin ---
  const [showAdminModal, setShowAdminModal] = useState(false)
  const [adminPassword, setAdminPassword] = useState('')
  const [adminError, setAdminError] = useState('')
  const [adminEventCode, setAdminEventCode] = useState('')
  const [adminPrinterEventCode, setAdminPrinterEventCode] = useState('')
  const [adminPrice1, setAdminPrice1] = useState('')
  const [adminPrice2, setAdminPrice2] = useState('')
  const [adminPrice3, setAdminPrice3] = useState('')

  // --- Estados de privacidad ---
  const [showPrivacyModal, setShowPrivacyModal] = useState(false)
  const [privacyContent, setPrivacyContent] = useState('')
  const [showAdminConfig, setShowAdminConfig] = useState(false)

  // --- Estados de pago ---
  const [showPayment, setShowPayment] = useState(false)
  const [paymentMethod, setPaymentMethod] = useState('')
  const [couponCode, setCouponCode] = useState('')
  const [couponError, setCouponError] = useState('')

  // --- Estados del carrito ---
  const [cart, setCart] = useState([])
  const [showCart, setShowCart] = useState(false)

  // --- Estados de impresión ---
  const [selectedPhoto, setSelectedPhoto] = useState(null)
  const [copies, setCopies] = useState(1)
  const [printing, setPrinting] = useState(false)
  const [printDone, setPrintDone] = useState(false)

  // ============================================
  // LOCALSTORAGE
  // ============================================

  const saveViewerState = () => {
    try {
      const data = {
        config,
        textos,
        currentPage,
        lastPage,
        printCount,
      }
      localStorage.setItem('printbox_viewer_state', JSON.stringify(data))
    } catch (e) {
      console.error('Error guardando en localStorage:', e)
    }
  }

  const loadViewerState = () => {
    try {
      const saved = localStorage.getItem('printbox_viewer_state')
      if (!saved) return null
      const parsed = JSON.parse(saved)

      if (parsed.config) setConfig(parsed.config)
      if (parsed.textos) setTextos(parsed.textos)
      if (parsed.currentPage) setCurrentPage(parsed.currentPage)
      if (parsed.lastPage) setLastPage(parsed.lastPage)
      if (parsed.printCount) setPrintCount(parsed.printCount)

      if (parsed.config?.evento) {
        setShowEventModal(false)
      }

      return parsed
    } catch (e) {
      console.error('Error cargando de localStorage:', e)
      return null
    }
  }

  // ============================================
  // EFECTOS DE INICIALIZACIÓN
  // ============================================

  useEffect(() => {
    const saved = loadViewerState()

    Promise.all([
      fetch(`${BACKEND}/config`).then(r => r.json()),
      fetch(`${BACKEND}/print/count`).then(r => r.json()).catch(() => ({ count: 0 })),
    ]).then(([d, c]) => {
      const mergedConfig = { ...(d.config || {}), ...(saved?.config || {}) }
      const mergedTextos = { ...(d.textos || {}), ...(saved?.textos || {}) }

      setConfig(mergedConfig)
      setTextos(mergedTextos)
      setPrintCount(c.count || 0)

      if (!mergedConfig.evento) {
        setShowEventModal(true)
      } else {
        setShowEventModal(false)
      }
    }).catch(() => {
      if (!saved?.config?.evento) setShowEventModal(true)
    })
  }, [])

  useEffect(() => {
    if (showEventModal) {
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [showEventModal])

  // Cargar contenido de privacidad al montar
  useEffect(() => {
    fetch('/assets/terms_and_conditions_2.html')
      .then(response => response.text())
      .then(html => setPrivacyContent(html))
      .catch(error => {
        console.error('Error cargando términos:', error)
        setPrivacyContent(defaultPrivacyContent)
      })
  }, [])

  useEffect(() => {
    saveViewerState()
  }, [config, textos, currentPage, lastPage, printCount])

  // ============================================
  // MANEJO DEL EVENTO
  // ============================================

  async function handleEventConfirm() {
    const code = eventInput.trim()
    if (!code) {
      setEventError('Introduce el número del evento')
      return
    }
    const fullCode = `ev-${code}`
    setEventError('')
    setShowEventModal(false)

    const newConfig = { ...config, evento: fullCode }
    setConfig(newConfig)
    await saveConfig(newConfig, textos).catch(() => {})
  }

  // ============================================
  // MANEJO DEL ADMIN
  // ============================================

  async function handleAdminLogin() {
    // Simple password check - in production, this should be more secure
    if (adminPassword !== 'admin123') {
      setAdminError('Contraseña incorrecta')
      return
    }
    setAdminError('')
    setAdminPassword('')
    setShowAdminModal(false)
    setShowAdminConfig(true)
    
    // Load current values
    setAdminEventCode(config?.evento?.replace('ev-', '') || '')
    setAdminPrinterEventCode(config?.evento_printer?.replace('ev-', '') || '')
    setAdminPrice1(textos?.precio1 || '')
    setAdminPrice2(textos?.precio2 || '')
    setAdminPrice3(textos?.precio3 || '')
  }

  async function handleSaveAdminConfig() {
    const newConfig = { ...config, evento: `ev-${adminEventCode}`, evento_printer: `ev-${adminPrinterEventCode}` }
    const newTextos = { 
      ...textos, 
      precio1: adminPrice1, 
      precio2: adminPrice2, 
      precio3: adminPrice3 
    }
    
    setConfig(newConfig)
    setTextos(newTextos)
    await saveConfig(newConfig, newTextos).catch(() => {})
    
    // Reload event if changed
    if (config?.evento !== newConfig.evento) {
      findEvent(newConfig.evento)
        .then(setUuid)
        .catch(e => setError(`No se pudo conectar: ${e.message}`))
    }
    
    setShowAdminConfig(false)
    // Clear admin values
    setAdminEventCode('')
    setAdminPrinterEventCode('')
    setAdminPrice1('')
    setAdminPrice2('')
    setAdminPrice3('')
  }

  // ============================================
  // CONEXIÓN AL EVENTO
  // ============================================

  useEffect(() => {
    if (!config?.evento) return
    findEvent(config.evento)
      .then(setUuid)
      .catch(e => setError(`No se pudo conectar: ${e.message}`))
  }, [config?.evento])

  // ============================================
  // CARGA DE FOTOS (UNA SOLA VEZ)
  // ============================================

  const loadAllPhotos = useCallback(async () => {
    if (!uuid) return
    try {
      setLoading(true)
      const allPhotosArray = []
      let page = 1
      let lastPageNumber = 1

      // Cargar primera página para saber el total
      const { photos: p1, lastPage: lp1 } = await getEventPhotos(uuid, page)
      allPhotosArray.push(...p1)
      lastPageNumber = lp1

      // Si hay más páginas, cargarlas con un pequeño delay para evitar rate limiting
      for (let p = 2; p <= lastPageNumber; p++) {
        await new Promise(resolve => setTimeout(resolve, 300)) // 300ms entre páginas
        const { photos: more } = await getEventPhotos(uuid, p)
        allPhotosArray.push(...more)
      }

      setAllPhotos(allPhotosArray)
      setLastPage(Math.ceil(allPhotosArray.length / 10)) // 10 fotos por página (5x2)
      setError(null)
    } catch (e) {
      setError(`Error al cargar fotos: ${e.message}`)
    } finally {
      setLoading(false)
    }
  }, [uuid])

  // Cargar fotos cuando se conecta el evento
  useEffect(() => {
    loadAllPhotos()
  }, [loadAllPhotos])

  // ============================================
  // PAGINACIÓN
  // ============================================

  // Calcular fotos para la página actual (10 por página)
  const currentPhotos = allPhotos.slice((currentPage - 1) * 10, currentPage * 10)

  // Autoplay: cambiar página automáticamente cada 5 segundos si está activado
  useInterval(
    () => {
      setCurrentPage(p => (p < lastPage ? p + 1 : 1))
    },
    autoplay ? 5000 : null
  )

  // ============================================
  // MANEJO DE IMPRESIÓN
  // ============================================

  function handleSelectPhoto(photo) {
    setSelectedPhoto(photo)
    setCopies(1)
    setPrintDone(false)
  }

  async function handlePrint() {
    if (!selectedPhoto || printing) return

    // Usar la URL correcta que el backend puede acceder
    const originalUrl = selectedPhoto.uri?.replace('thumbs_', 'gallery_') || selectedPhoto.uri_full
    const proxyPath = fixImageUrl(originalUrl)
    const imageUrl = `${BACKEND}${proxyPath}`  // URL absoluta para el backend
    const imageName = imageUrl.split('/').pop()

    setPrinting(true)

    try {
      for (let i = 0; i < copies; i++) {
        await printJob({
          imageUrl,
          imageName: `copy_${i + 1}_${imageName}`,
          printer: config?.impresora,
          delay: config?.delay || 5,
        })
      }

      const res = await fetch(`${BACKEND}/print/count`).then(r => r.json())
      setPrintCount(res.count || 0)
      setPrintDone(true)
    } catch (e) {
      console.error('Error al imprimir:', e)
    } finally {
      setPrinting(false)
    }
  }

  function getPrecio(n) {
    if (!textos) return null
    if (n === 1) return textos.precio1
    if (n === 2) return textos.precio2
    if (n >= 3) return textos.precio3
  }

  async function handlePrint() {
    // This is now handlePayment
  }

  async function handlePayment() {
    if (!selectedPhoto || printing || !paymentMethod) return

    // Validate coupon if selected
    if (paymentMethod === 'coupon') {
      if (!validateCoupon(couponCode)) {
        setCouponError('Cupón inválido o ya utilizado')
        return
      }
    }

    setPrinting(true)

    try {
      // Process payment (for now, just simulate)
      if (paymentMethod === 'paypal') {
        // TODO: Integrate PayPal
        alert('Pago con PayPal - Integración pendiente')
      } else if (paymentMethod === 'square') {
        // TODO: Integrate Square
        alert('Pago con Square - Integración pendiente')
      } else if (paymentMethod === 'coupon') {
        // Mark coupon as used
        markCouponUsed(couponCode)
      }

      // Send photo to printer event
      if (config?.evento_printer) {
        const proxyUrl = fixImageUrl(selectedPhoto.uri_full || selectedPhoto.uri)
        const resp = await fetch(proxyUrl)
        const blob = await resp.blob()
        const base64 = await new Promise(res => {
          const reader = new FileReader()
          reader.onload = () => res(reader.result)
          reader.readAsDataURL(blob)
        })
        
        await sendPhoto({ event: config.evento_printer, image: base64, times: copies })
        
        setPrintDone(true)
      }
    } catch (e) {
      console.error('Error al procesar pago:', e)
    } finally {
      setPrinting(false)
    }
  }

  // Simple coupon validation (for demo)
  function validateCoupon(code) {
    // Simple check: code should be 8 characters, alphanumeric
    return code.length === 8 && /^[A-Z0-9]+$/.test(code)
  }

  function markCouponUsed(code) {
    // TODO: Store used coupons
    console.log('Cupón usado:', code)
  }

  // ============================================
  // RENDER
  // ============================================

  return (
    <div className="viewer-app d-flex flex-column bg-dark text-light" style={{ height: "100vh", overflow: "hidden" }}>
      {/* MODAL EVENTO */}
      {showEventModal && (
        <div className="modal d-block event-modal-overlay" tabIndex="-1">
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content bg-dark border border-secondary event-modal">
              <div className="modal-body text-center p-4 p-md-5">
                <img src="/assets/ic_launcher.png" alt="Logo" className="event-modal-logo" />
                <h4 className="event-modal-title">Introduce el código de evento</h4>
                <p className="event-modal-subtitle">Introduce el número del evento</p>

                <div className="input-group mb-2 event-modal-input-group">
                  <span className="input-group-text bg-black border-secondary text-warning fw-bold font-mono fs-5">ev-</span>
                  <input
                    ref={inputRef}
                    type="text"
                    inputMode="numeric"
                    className={`form-control bg-black border-secondary text-light font-mono fw-bold event-modal-input ${
                      eventError ? 'is-invalid' : ''
                    }`}
                    value={eventInput}
                    onChange={e => setEventInput(e.target.value.replace(/\D/g, ''))}
                    onKeyDown={e => { if (e.key === 'Enter') handleEventConfirm() }}
                  />
                  {eventError && <div className="invalid-feedback text-start">{eventError}</div>}
                </div>

                <button
                  className="btn btn-warning text-dark fw-bold w-100 mt-3 event-modal-button"
                  onClick={handleEventConfirm}
                >
                  <i className="bi bi-arrow-right-circle me-2" /> Cargar evento
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL ADMIN */}
      {showAdminModal && (
        <div className="modal d-block event-modal-overlay" tabIndex="-1">
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content bg-dark border border-secondary event-modal">
              <div className="modal-body text-center p-4 p-md-5">
                <img src="/assets/ic_launcher.png" alt="Logo" className="event-modal-logo" />
                <h4 className="event-modal-title">Panel de Administración</h4>
                <p className="event-modal-subtitle">Introduce la contraseña</p>

                <div className="input-group mb-2 event-modal-input-group">
                  <span className="input-group-text bg-black border-secondary text-warning fw-bold font-mono fs-5"><i className="bi bi-lock"></i></span>
                  <input
                    type="password"
                    className={`form-control bg-black border-secondary text-light font-mono fw-bold event-modal-input ${
                      adminError ? 'is-invalid' : ''
                    }`}
                    placeholder="Contraseña"
                    value={adminPassword}
                    onChange={e => { setAdminPassword(e.target.value); setAdminError('') }}
                    onKeyDown={e => { if (e.key === 'Enter') handleAdminLogin() }}
                  />
                  {adminError && <div className="invalid-feedback text-start">{adminError}</div>}
                </div>

                <button
                  className="btn btn-warning text-dark fw-bold w-100 mt-3 event-modal-button"
                  onClick={handleAdminLogin}
                >
                  <i className="bi bi-arrow-right-circle me-2" /> Acceder
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL CONFIG ADMIN */}
      {showAdminConfig && (
        <div className="modal d-block event-modal-overlay" tabIndex="-1">
          <div className="modal-dialog modal-dialog-centered modal-lg">
            <div className="modal-content bg-dark border border-secondary event-modal">
              <div className="modal-header border-secondary">
                <h5 className="modal-title text-light">Configuración del Evento</h5>
                <button type="button" className="btn-close btn-close-white" onClick={() => setShowAdminConfig(false)}></button>
              </div>
              <div className="modal-body p-4">
                <div className="row g-3">
                  <div className="col-md-6">
                    <label className="form-label text-light">Código del Evento (Monitor)</label>
                    <div className="input-group">
                      <span className="input-group-text bg-black border-secondary text-warning fw-bold font-mono">ev-</span>
                      <input
                        type="text"
                        inputMode="numeric"
                        className="form-control bg-black border-secondary text-light font-mono"
                        value={adminEventCode}
                        onChange={e => setAdminEventCode(e.target.value.replace(/\D/g, ''))}
                      />
                    </div>
                  </div>
                  <div className="col-md-6">
                    <label className="form-label text-light">Código del Evento (Impresora)</label>
                    <div className="input-group">
                      <span className="input-group-text bg-black border-secondary text-warning fw-bold font-mono">ev-</span>
                      <input
                        type="text"
                        inputMode="numeric"
                        className="form-control bg-black border-secondary text-light font-mono"
                        value={adminPrinterEventCode}
                        onChange={e => setAdminPrinterEventCode(e.target.value.replace(/\D/g, ''))}
                      />
                    </div>
                  </div>
                  <div className="col-md-4">
                    <label className="form-label text-light">Precio 1 Foto (€)</label>
                    <input
                      type="number"
                      step="0.01"
                      className="form-control bg-black border-secondary text-light"
                      value={adminPrice1}
                      onChange={e => setAdminPrice1(e.target.value)}
                    />
                  </div>
                  <div className="col-md-4">
                    <label className="form-label text-light">Precio 2 Fotos (€)</label>
                    <input
                      type="number"
                      step="0.01"
                      className="form-control bg-black border-secondary text-light"
                      value={adminPrice2}
                      onChange={e => setAdminPrice2(e.target.value)}
                    />
                  </div>
                  <div className="col-md-4">
                    <label className="form-label text-light">Precio 3+ Fotos (€)</label>
                    <input
                      type="number"
                      step="0.01"
                      className="form-control bg-black border-secondary text-light"
                      value={adminPrice3}
                      onChange={e => setAdminPrice3(e.target.value)}
                    />
                  </div>
                </div>
              </div>
              <div className="modal-footer border-secondary">
                <button type="button" className="btn btn-secondary" onClick={() => setShowAdminConfig(false)}>Cancelar</button>
                <button type="button" className="btn btn-warning text-dark" onClick={handleSaveAdminConfig}>Guardar</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL PRIVACIDAD */}
      {showPrivacyModal && (
        <div className="modal d-block" style={{ backgroundColor: 'rgba(0,0,0,0.8)' }} tabIndex="-1">
          <div className="modal-dialog modal-dialog-centered modal-lg">
            <div className="modal-content bg-dark border border-secondary">
              <div className="modal-header border-secondary">
                <h5 className="modal-title text-light">Política de Privacidad</h5>
                <button type="button" className="btn-close btn-close-white" onClick={() => setShowPrivacyModal(false)}></button>
              </div>
              <div className="modal-body p-4" style={{ maxHeight: '60vh', overflowY: 'auto' }}>
                <div dangerouslySetInnerHTML={{ __html: privacyContent }} />
              </div>
              <div className="modal-footer border-secondary">
                <button type="button" className="btn btn-secondary" onClick={() => setShowPrivacyModal(false)}>Cerrar</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL IMPRESIÓN */}
      {selectedPhoto && (
        <div
          className="modal d-block print-modal-overlay"
          tabIndex="-1"
          onClick={() => !printing && setSelectedPhoto(null)}
        >
          <div
            className="modal-dialog modal-dialog-centered modal-xl modal-fullscreen-sm-down"
            onClick={e => e.stopPropagation()}
          >
            <div className="modal-content bg-dark border border-secondary print-modal">
              <div className="print-modal-header">
                {printDone ? (
                  <span className="text-success fw-bold font-mono">
                    <i className="bi bi-check-circle-fill me-2" />¡Impresión enviada!
                  </span>
                ) : (
                  <span className="text-light fw-bold font-mono">
                    <i className="bi bi-printer me-2 text-warning" />
                    Total {copies} {copies === 1 ? 'foto' : 'fotos'} {getPrecio(copies) ? `${getPrecio(copies)}€` : ''}
                  </span>
                )}
                <button
                  className="btn-close btn-close-white print-modal-close"
                  onClick={() => setSelectedPhoto(null)}
                />
              </div>

              <div className="print-modal-body">
                <div className="row g-0">
                  <div className="col-md-7 print-image-container">
                    <img
                      src={fixImageUrl(selectedPhoto.uri || selectedPhoto.uri_full)}
                      alt="Foto seleccionada"
                      className="print-image"
                      draggable={false}
                      onContextMenu={(e) => e.preventDefault()}
                      onDragStart={(e) => e.preventDefault()}
                    />
                  </div>

                  <div className="col-md-5 print-panel">
                    <div>
                      <p className="copies-title"><i className="bi bi-stack me-1" />Número de copias</p>
                      <div className="copies-buttons">
                        {[1, 2, 3].map(n => (
                          <button
                            key={n}
                            className={`btn fw-bold copy-btn ${copies === n ? 'copy-btn-active' : 'copy-btn-inactive'}`}
                            onClick={() => setCopies(n)}
                          >
                            <span>
                              {copies === n ? <i className="bi bi-check-circle-fill copy-icon" /> : <i className="bi bi-circle copy-icon" />}
                              {n} {n === 1 ? 'copia' : 'copias'}
                            </span>
                            {textos?.[`precio${n}`] && (
                              <span className={`badge ${copies === n ? 'copy-price-badge-active' : 'copy-price-badge-inactive'}`}>
                                {textos[`precio${n}`]}€
                              </span>
                            )}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="print-actions">
                      {printDone ? (
                        <>
                          <div className="alert alert-success print-success-alert">
                            <i className="bi bi-check-circle-fill me-1" />{copies} {copies === 1 ? 'copia enviada' : 'copias enviadas'} a imprimir
                          </div>
                          <button className="btn btn-outline-secondary cancel-button" onClick={() => setSelectedPhoto(null)}>
                            <i className="bi bi-arrow-left me-1" /> Volver a la galería
                          </button>
                        </>
                      ) : showPayment ? (
                        <>
                          <div className="mb-3">
                            <p className="text-light mb-2">Método de pago:</p>
                            <div className="d-flex gap-2 flex-wrap">
                              <button
                                className={`btn ${paymentMethod === 'paypal' ? 'btn-warning text-dark' : 'btn-outline-light'}`}
                                onClick={() => setPaymentMethod('paypal')}
                              >
                                <i className="bi bi-paypal me-1" /> PayPal
                              </button>
                              <button
                                className={`btn ${paymentMethod === 'square' ? 'btn-warning text-dark' : 'btn-outline-light'}`}
                                onClick={() => setPaymentMethod('square')}
                              >
                                <i className="bi bi-credit-card me-1" /> Square
                              </button>
                              <button
                                className={`btn ${paymentMethod === 'coupon' ? 'btn-warning text-dark' : 'btn-outline-light'}`}
                                onClick={() => setPaymentMethod('coupon')}
                              >
                                <i className="bi bi-ticket me-1" /> Cupón
                              </button>
                            </div>
                            {paymentMethod === 'coupon' && (
                              <div className="mt-2">
                                <input
                                  type="text"
                                  className={`form-control bg-black border-secondary text-light ${couponError ? 'is-invalid' : ''}`}
                                  placeholder="Código del cupón"
                                  value={couponCode}
                                  onChange={e => { setCouponCode(e.target.value); setCouponError('') }}
                                />
                                {couponError && <div className="invalid-feedback">{couponError}</div>}
                              </div>
                            )}
                          </div>
                          <button className="btn btn-success text-dark fw-bold print-button" onClick={handlePayment} disabled={printing || !paymentMethod}>
                            {printing ? (
                              <><span className="spinner-border spinner-border-sm me-2" /> Procesando…</>
                            ) : (
                              <><i className="bi bi-check-circle-fill me-2" /> Pagar y Imprimir</>
                            )}
                          </button>
                          <button className="btn btn-outline-secondary cancel-button" onClick={() => setShowPayment(false)}>
                            <i className="bi bi-arrow-left me-1" /> Volver
                          </button>
                        </>
                      ) : (
                        <>
                          <button className="btn btn-warning text-dark fw-bold print-button" onClick={() => setShowPayment(true)}>
                            <i className="bi bi-credit-card me-2" /> Pagar
                          </button>
                          <button className="btn btn-outline-secondary cancel-button" onClick={() => setSelectedPhoto(null)}>
                            <i className="bi bi-x me-1" /> Cancelar
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <header className="viewer-header">
        {error && <div className="alert alert-danger viewer-error-alert">{error}</div>}
      </header>

      {/* Botones de control */}
      {uuid && (
        <div style={{
          display: 'flex',
          gap: '10px',
          justifyContent: 'center',
          padding: '10px',
          flexWrap: 'wrap'
        }}>
          <button
            className={`btn btn-sm ${autoplay ? 'btn-success' : 'btn-outline-success'} bg-dark border-success`}
            onClick={() => setAutoplay(!autoplay)}
            title={autoplay ? 'Detener autoplay' : 'Iniciar autoplay (5s por página)'}
          >
            <i className={`bi ${autoplay ? 'bi-pause-circle-fill' : 'bi-play-circle-fill'} me-1`} />
            {autoplay ? 'Autoplay ON' : 'Autoplay OFF'}
          </button>
          
          <button
            className="btn btn-sm btn-outline-info bg-dark border-info"
            onClick={() => setShowQR(!showQR)}
            title="Mostrar QR del evento"
          >
            <i className="bi bi-qr-code me-1" />
            {showQR ? 'Ocultar QR' : 'Mostrar QR'}
          </button>

          {/* Botón de privacidad */}
          <button
            className="btn btn-sm btn-outline-light bg-dark border-light"
            onClick={() => setShowPrivacyModal(true)}
            title="Política de privacidad"
          >
            <i className="bi bi-info-circle me-1" />
            Privacidad
          </button>

          {/* Botón de admin */}
          <button
            className="btn btn-sm btn-outline-warning bg-dark border-warning"
            onClick={() => setShowAdminModal(true)}
            title="Panel de administración"
          >
            <i className="bi bi-gear me-1" />
            Admin
          </button>

          {/* Botón de actualización manual */}
          <button
            className="btn btn-sm btn-outline-primary bg-dark border-primary"
            onClick={() => loadAllPhotos()}
            disabled={loading}
            title="Actualizar fotos (traer nuevas)"
          >
            <i className={`bi ${loading ? 'bi-hourglass-split spin' : 'bi-arrow-repeat'} me-1`} />
            {loading ? 'Cargando...' : 'Actualizar'}
          </button>
        </div>
      )}

      {/* Modal QR */}
      {showQR && uuid && (
        <div className="modal d-block" style={{ backgroundColor: 'rgba(0,0,0,0.7)' }} tabIndex="-1">
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content bg-dark border border-secondary">
              <div className="modal-body text-center p-5">
                <h5 className="text-light mb-4">Escanea para acceder al evento</h5>
                <div style={{
                  display: 'flex',
                  justifyContent: 'center',
                  backgroundColor: 'white',
                  padding: '15px',
                  borderRadius: '8px'
                }}>
                  <QRCodeSVG
                    value={`${window.location.origin}/mobile?evento=${config?.evento || 'ev-' + uuid}`}
                    size={300}
                    level="H"
                    includeMargin={true}
                  />
                </div>
                <p className="text-warning mt-3 mb-0"><small>Escanea el código QR para comprar tus fotos</small></p>
                <button
                  className="btn btn-secondary mt-3"
                  onClick={() => setShowQR(false)}
                >
                  <i className="bi bi-x me-1" /> Cerrar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <main className="viewer-gallery">
        {!uuid ? (
          <div className="viewer-gallery-empty">
            <img src="/assets/logo-adventure.png" alt="Printbox Adventure" className="empty-logo" />
            <h2 className="empty-title">Printbox Adventure</h2>
            <p className="empty-text">Introduce el evento para ver las fotos</p>
          </div>
        ) : loading ? (
          <div className="viewer-gallery-empty">
            <img src="/assets/logo-adventure.png" alt="Printbox Adventure" className="empty-logo" />
            <h2 className="empty-title">Printbox Adventure</h2>
            <p className="empty-text">Cargando fotos…</p>
          </div>
        ) : currentPhotos.length === 0 ? (
          <div className="viewer-gallery-empty">
            <img src="/assets/logo-adventure.png" alt="Printbox Adventure" className="empty-logo" />
            <h2 className="empty-title">Printbox Adventure</h2>
            <p className="empty-text">Esperando fotos…</p>
          </div>
        ) : (
          <div className="viewer-gallery-grid">
            {currentPhotos.map(photo => (
              <PhotoCard key={photo.id || photo.uri} photo={photo} onSelect={handleSelectPhoto} />
            ))}
          </div>
        )}
      </main>

      {lastPage > 1 && (
        <nav className="viewer-pagination">
          <ul className="pagination pagination-sm mb-0">
            <li className={`page-item ${currentPage === 1 ? 'disabled' : ''}`}>
              <button className="page-link pagination-btn" onClick={() => setCurrentPage(p => p - 1)}>
                <i className="bi bi-chevron-left" />
              </button>
            </li>
            {Array.from({ length: lastPage }, (_, i) => i + 1).map(page => (
              <li key={page} className={`page-item ${page === currentPage ? 'active pagination-active' : ''}`}>
                <button className="page-link pagination-btn" onClick={() => setCurrentPage(page)}>{page}</button>
              </li>
            ))}
            <li className={`page-item ${currentPage === lastPage ? 'disabled' : ''}`}>
              <button className="page-link pagination-btn" onClick={() => setCurrentPage(p => p + 1)}>
                <i className="bi bi-chevron-right" />
              </button>
            </li>
          </ul>
        </nav>
      )}

      <footer className="viewer-footer">
        <div className="viewer-footer-content">
          {textos?.precio1 && (
            <span className="price-badge"><span className="text-secondary me-1">1 foto</span><span className="badge bg-warning text-dark fw-bold fs-6">{textos.precio1}€</span></span>
          )}
          {textos?.precio2 && (
            <span className="price-badge"><span className="text-secondary me-1">2 fotos</span><span className="badge bg-warning text-dark fw-bold fs-6">{textos.precio2}€</span></span>
          )}
          {textos?.precio3 && (
            <span className="price-badge"><span className="text-secondary me-1">3 fotos</span><span className="badge bg-warning text-dark fw-bold fs-6">{textos.precio3}€</span></span>
          )}
          {textos?.empresa && (
            <span className="company-name"><i className="bi bi-camera me-1" />{textos.empresa}</span>
          )}
          <span className="print-count"><i className="bi bi-printer me-1" /><span className="print-count-number">{printCount}</span> impresiones</span>
        </div>
      </footer>
    </div>
  )
}

// ============================================
// COMPONENTE DE TARJETA DE FOTO
// ============================================
function PhotoCard({ photo, onSelect }) {
  const thumb = fixImageUrl(photo.uri || photo.uri_full)
  return (
    <button
      className="viewer-photo-card btn p-0 w-100 border-2 rounded-3 overflow-hidden position-relative"
      onClick={() => onSelect(photo)}
      style={{ aspectRatio: '3/4' }}
    >
      <img
        src={thumb}
        alt=""
        className="w-100 h-100"
        style={{ objectFit: 'cover' }}
        draggable={false}
        onContextMenu={(e) => e.preventDefault()}
        onDragStart={(e) => e.preventDefault()}
      />
      <div className="viewer-photo-hint">
        <i className="bi bi-printer me-1" /> Imprimir
      </div>
    </button>
  )
}