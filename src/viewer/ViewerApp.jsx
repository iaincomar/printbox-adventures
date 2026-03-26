import React, { useState, useEffect, useCallback, useRef } from 'react'
import { findEvent, getEventPhotos, printJob, saveConfig } from '../shared/api'
import { useInterval } from '../shared/hooks/useInterval'
import './Viewer.css'

// URL del backend (desde Electron o localhost)
const BACKEND = window.electronAPI?.backendUrl || 'https://printbox.incomar.net'

// ============================================
// COMPONENTE PRINCIPAL - VISOR DE FOTOS
// ============================================
export default function ViewerApp() {
  // --- Estados de configuración ---
  const [config, setConfig] = useState(null)
  const [textos, setTextos] = useState(null)
  const [uuid, setUuid] = useState(null)
  const [photos, setPhotos] = useState([])
  const [currentPage, setCurrentPage] = useState(1)
  const [lastPage, setLastPage] = useState(1)
  const [printCount, setPrintCount] = useState(0)
  const [error, setError] = useState(null)

  // --- Estados de modales ---
  const [showEventModal, setShowEventModal] = useState(false)
  const [eventInput, setEventInput] = useState('')
  const [eventError, setEventError] = useState('')
  const inputRef = useRef(null)

  // --- Estados de impresión ---
  const [selectedPhoto, setSelectedPhoto] = useState(null)
  const [copies, setCopies] = useState(1)
  const [printing, setPrinting] = useState(false)
  const [printDone, setPrintDone] = useState(false)

  // ============================================
  // EFECTOS DE INICIALIZACIÓN
  // ============================================

  useEffect(() => {
    Promise.all([
      fetch(`${BACKEND}/config`).then(r => r.json()),
      fetch(`${BACKEND}/print/count`).then(r => r.json()).catch(() => ({ count: 0 })),
    ]).then(([d, c]) => {
      if (d.config) setConfig(d.config)
      if (d.textos) setTextos(d.textos)
      setPrintCount(c.count || 0)
      setShowEventModal(true)
    }).catch(() => setShowEventModal(true))
  }, [])

  useEffect(() => {
    if (showEventModal) {
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [showEventModal])

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
  // CONEXIÓN AL EVENTO
  // ============================================

  useEffect(() => {
    if (!config?.evento) return
    findEvent(config.evento)
      .then(setUuid)
      .catch(e => setError(`No se pudo conectar: ${e.message}`))
  }, [config?.evento])

  // ============================================
  // CARGA DE FOTOS
  // ============================================

  const loadPhotos = useCallback(async () => {
    if (!uuid) return
    try {
      const { photos: p, lastPage: lp } = await getEventPhotos(uuid, currentPage)
      setPhotos(p)
      setLastPage(lp)
      setError(null)
    } catch (e) {
      setError(`Error al cargar fotos: ${e.message}`)
    }
  }, [uuid, currentPage])

  useEffect(() => {
    loadPhotos()
  }, [loadPhotos])

  useInterval(loadPhotos, uuid ? (config?.timer || 5) * 1000 : null)

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

    const imageUrl = selectedPhoto.uri?.replace('thumbs_', 'gallery_') || selectedPhoto.uri_full
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

  // ============================================
  // RENDER
  // ============================================

  return (
    <div className="viewer-app d-flex flex-column bg-dark text-light" style={{ height: "100vh", overflow: "hidden" }}>
      {/* MODAL EVENTO (igual que antes) */}
      {showEventModal && (
        <div className="modal d-block event-modal-overlay" tabIndex="-1">
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content bg-dark border border-secondary event-modal">
              <div className="modal-body text-center p-4 p-md-5">
                <img src="/assets/MoscaPrintbox.png" alt="Logo" className="event-modal-logo" />
                <h4 className="event-modal-title">¿Cuál es el evento?</h4>
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

      {/* MODAL IMPRESIÓN (con imagen proxy) */}
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
                    {copies === 1 ? '1 copia seleccionada' : `${copies} copias seleccionadas`}
                    {getPrecio(copies) && (
                      <span className="badge bg-warning text-dark ms-2">{getPrecio(copies)}€</span>
                    )}
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
                      src={(selectedPhoto.uri || selectedPhoto.uri_full).replace('https://gestion.printboxweb.com', '/proxy-image')}
                      alt="Foto seleccionada"
                      className="print-image"
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
                      ) : (
                        <>
                          <button className="btn btn-warning text-dark fw-bold print-button" onClick={handlePrint} disabled={printing}>
                            {printing ? (
                              <><span className="spinner-border spinner-border-sm me-2" /> Imprimiendo…</>
                            ) : (
                              <><i className="bi bi-printer-fill me-2" /> Imprimir</>
                            )}
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

      <main className="viewer-gallery">
        {!uuid ? (
          <div className="viewer-gallery-empty">
            <i className="bi bi-camera empty-icon" />
            <p className="empty-text">Introduce el evento para ver las fotos</p>
          </div>
        ) : photos.length === 0 ? (
          <div className="viewer-gallery-empty">
            <i className="bi bi-hourglass-split empty-icon" />
            <p className="empty-text">Esperando fotos de <strong>{config?.evento}</strong>…</p>
          </div>
        ) : (
          <div className="row g-2 g-md-3 justify-content-center">
            {photos.map(photo => (
              <div key={photo.id || photo.uri} className="col-6 col-sm-4 col-md-3 col-lg-2">
                <PhotoCard photo={photo} onSelect={handleSelectPhoto} />
              </div>
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
          <button className="btn btn-warning change-event-btn" onClick={() => { setEventInput(''); setEventError(''); setShowEventModal(true) }}>
            <i className="bi bi-pencil me-1" /> Cambiar evento
          </button>
        </div>
      </footer>
    </div>
  )
}

// ============================================
// COMPONENTE DE TARJETA DE FOTO (con imagen proxy)
// ============================================
function PhotoCard({ photo, onSelect }) {
  const thumb = (photo.uri || photo.uri_full).replace('https://gestion.printboxweb.com', '/proxy-image')

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
      />
      <div className="viewer-photo-hint">
        <i className="bi bi-printer me-1" /> Imprimir
      </div>
    </button>
  )
}