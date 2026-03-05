import React, { useState, useEffect, useCallback, useRef } from 'react'
import { findEvent, getEventPhotos, printJob, saveConfig } from '../shared/api'
import { useInterval } from '../shared/hooks/useInterval'
import './Viewer.css'

const BACKEND = window.electronAPI?.backendUrl || 'http://localhost:4000'

export default function ViewerApp() {
  const [config, setConfig]       = useState(null)
  const [textos, setTextos]       = useState(null)
  const [uuid, setUuid]           = useState(null)
  const [photos, setPhotos]       = useState([])
  const [currentPage, setCurrentPage] = useState(1)
  const [lastPage, setLastPage]   = useState(1)
  const [printCount, setPrintCount] = useState(0)
  const [error, setError]         = useState(null)

  // Modal: introducir evento
  const [showEventModal, setShowEventModal] = useState(false)
  const [eventInput, setEventInput] = useState('')
  const [eventError, setEventError] = useState('')
  const inputRef = useRef(null)

  // Modal: selección de copias + imprimir
  const [selectedPhoto, setSelectedPhoto] = useState(null) // foto seleccionada
  const [copies, setCopies]       = useState(1)
  const [printing, setPrinting]   = useState(false)
  const [printDone, setPrintDone] = useState(false)

  // ── Carga inicial ─────────────────────────────────────────────────────────
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

  useEffect(() => { if (showEventModal) setTimeout(() => inputRef.current?.focus(), 50) }, [showEventModal])

  // ── Modal evento ──────────────────────────────────────────────────────────
  async function handleEventConfirm() {
    const code = eventInput.trim()
    if (!code) { setEventError('Introduce el número del evento'); return }
    const fullCode = `ev-${code}`
    setEventError('')
    setShowEventModal(false)
    const newConfig = { ...config, evento: fullCode }
    setConfig(newConfig)
    await saveConfig(newConfig, textos).catch(() => {})
  }

  // ── Conectar al evento ────────────────────────────────────────────────────
  useEffect(() => {
    if (!config?.evento) return
    findEvent(config.evento).then(setUuid).catch(e => setError(`No se pudo conectar: ${e.message}`))
  }, [config?.evento])

  // ── Cargar fotos ──────────────────────────────────────────────────────────
  const loadPhotos = useCallback(async () => {
    if (!uuid) return
    try {
      const { photos: p, lastPage: lp } = await getEventPhotos(uuid, currentPage)
      setPhotos(p); setLastPage(lp); setError(null)
    } catch (e) { setError(`Error al cargar fotos: ${e.message}`) }
  }, [uuid, currentPage])

  useEffect(() => { loadPhotos() }, [loadPhotos])
  useInterval(loadPhotos, uuid ? (config?.timer || 5) * 1000 : null)

  // ── Seleccionar foto → abrir modal de impresión ───────────────────────────
  function handleSelectPhoto(photo) {
    setSelectedPhoto(photo)
    setCopies(1)
    setPrintDone(false)
  }

  // ── Imprimir ──────────────────────────────────────────────────────────────
  async function handlePrint() {
    if (!selectedPhoto || printing) return
    const imageUrl = selectedPhoto.uri?.replace('thumbs_', 'gallery_') || selectedPhoto.uri_full
    const imageName = imageUrl.split('/').pop()
    setPrinting(true)
    try {
      for (let i = 0; i < copies; i++) {
        await printJob({
          imageUrl,
          imageName: `copy_${i+1}_${imageName}`,
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

  // ── Precio según copias ───────────────────────────────────────────────────
  function getPrecio(n) {
    if (!textos) return null
    if (n === 1) return textos.precio1
    if (n === 2) return textos.precio2
    if (n >= 3) return textos.precio3
  }

  return (
    <div className="viewer-app d-flex flex-column min-vh-100 bg-dark text-light">

      {/* ── MODAL EVENTO ── */}
      {showEventModal && (
        <div className="modal d-block" tabIndex="-1"
          style={{ background: 'rgba(0,0,0,0.9)', backdropFilter: 'blur(8px)' }}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content bg-dark border border-secondary">
              <div className="modal-body text-center p-4 p-md-5">
                <img src="/assets/MoscaPrintbox.png" alt="Logo" className="rounded-3 mb-3" style={{ width: 90 }} />
                <h4 className="fw-bold mb-1">¿Cuál es el evento?</h4>
                <p className="text-secondary font-mono small mb-4">Introduce el número del evento</p>
                <div className="input-group mb-2">
                  <span className="input-group-text bg-black border-secondary text-warning fw-bold font-mono fs-5">ev-</span>
                  <input ref={inputRef} type="text" inputMode="numeric"
                    className={`form-control bg-black border-secondary text-light font-mono fw-bold fs-3 ${eventError ? 'is-invalid' : ''}`}
                    style={{ letterSpacing: 4 }}
                    value={eventInput}
                    onChange={e => setEventInput(e.target.value.replace(/\D/g, ''))}
                    onKeyDown={e => { if (e.key === 'Enter') handleEventConfirm() }}
                  />
                  {eventError && <div className="invalid-feedback text-start">{eventError}</div>}
                </div>
                <button className="btn btn-warning text-dark fw-bold w-100 mt-3 py-2" onClick={handleEventConfirm}>
                  <i className="bi bi-arrow-right-circle me-2" />Cargar evento
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL IMPRESIÓN ── */}
      {selectedPhoto && (
        <div className="modal d-block" tabIndex="-1"
          style={{ background: 'rgba(0,0,0,0.88)', backdropFilter: 'blur(6px)' }}
          onClick={() => !printing && setSelectedPhoto(null)}>
          <div className="modal-dialog modal-dialog-centered modal-xl modal-fullscreen-sm-down"
            onClick={e => e.stopPropagation()}>
            <div className="modal-content bg-dark border border-secondary">

              {/* Cabecera con copias seleccionadas */}
              <div className="modal-header border-secondary justify-content-center py-2">
                {printDone ? (
                  <span className="text-success fw-bold font-mono">
                    <i className="bi bi-check-circle-fill me-2" />¡Impresión enviada!
                  </span>
                ) : (
                  <span className="text-light fw-bold font-mono">
                    <i className="bi bi-printer me-2 text-warning" />
                    {copies === 1 ? '1 copia seleccionada' : `${copies} copias seleccionadas`}
                    {getPrecio(copies) && (
                      <span className="badge text-dark">{getPrecio(copies)}€</span>
                    )}
                  </span>
                )}
                <button className="btn-close btn-close-white position-absolute end-0 me-3"
                  onClick={() => setSelectedPhoto(null)} />
              </div>

              <div className="modal-body p-0">
                <div className="row g-0">

                  {/* FOTO */}
                  <div className="col-md-7">
                    <img
                      src={selectedPhoto.uri || selectedPhoto.uri_full}
                      alt="Foto seleccionada"
                      className="w-100 rounded-start-3"
                      style={{ width: '100%', maxHeight: '70vh', objectFit: 'contain', display: 'block', background: '#000' }}
                    />
                  </div>

                  {/* PANEL DERECHO: copias + imprimir */}
                  <div className="col-md-5 d-flex flex-column justify-content-between p-3 p-md-4 gap-3">

                    {/* Selector de copias */}
                    <div>
                      <p className="text-secondary font-mono mb-3" style={{ fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase' }}>
                        <i className="bi bi-stack me-1" />Número de copias
                      </p>
                      <div className="d-flex flex-column gap-2">
                        {[1, 2, 3].map(n => (
                          <button key={n}
                            className={`btn fw-bold d-flex justify-content-between align-items-center px-3 py-2 ${copies === n ? 'btn-warning text-dark' : 'btn-outline-secondary text-light'}`}
                            onClick={() => setCopies(n)}>
                            <span>
                              {copies === n
                                ? <i className="bi bi-check-circle-fill me-2" />
                                : <i className="bi bi-circle me-2" />
                              }
                              {n} {n === 1 ? 'copia' : 'copias'}
                            </span>
                            {textos?.[`precio${n}`] && (
                              <span className={`badge ${copies === n ? 'bg-dark text-warning' : 'bg-secondary'}`}>
                                {textos[`precio${n}`]}€
                              </span>
                            )}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Botón imprimir */}
                    <div className="d-flex flex-column gap-2">
                      {printDone ? (
                        <>
                          <div className="alert alert-success py-2 text-center font-mono small mb-0">
                            <i className="bi bi-check-circle-fill me-1" />
                            {copies} {copies === 1 ? 'copia enviada' : 'copias enviadas'} a imprimir
                          </div>
                          <button className="btn btn-outline-secondary" onClick={() => setSelectedPhoto(null)}>
                            <i className="bi bi-arrow-left me-1" />Volver a la galería
                          </button>
                        </>
                      ) : (
                        <>
                          <button className="btn btn-warning text-dark fw-bold py-3 fs-5"
                            onClick={handlePrint} disabled={printing}>
                            {printing
                              ? <><span className="spinner-border spinner-border-sm me-2" />Imprimiendo…</>
                              : <><i className="bi bi-printer-fill me-2" />Imprimir</>
                            }
                          </button>
                          <button className="btn btn-outline-secondary btn-sm" onClick={() => setSelectedPhoto(null)}>
                            <i className="bi bi-x me-1" />Cancelar
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

      {/* ── HEADER ── */}
      <header className="viewer-header flex-shrink-0">
        <div className="position-relative">
          <img src="/assets/banners-AdventureSup.png" alt="" className="w-100 viewer-header-img" />
          <div className="position-absolute top-0 start-0 end-0 bottom-0" style={{ pointerEvents: 'none' }}>
            {/* Textos ES/EN — junto a la mascota, empieza en ~17% */}
            <div className="position-absolute font-mono d-none d-md-block"
              style={{ left: '17%', top: '50%', transform: 'translateY(-50%)', fontSize: 11, pointerEvents: 'none' }}>
              {textos?.text_es && <div className="text-white fw-semibold">{textos.text_es}</div>}
              {textos?.text_en && <div className="text-white fw-semibold">{textos.text_en}</div>}
            </div>
            {/* QR — centrado */}
            <div className="position-absolute d-none d-sm-block"
              style={{ left: '50%', top: '50%', transform: 'translate(-50%,-50%)', pointerEvents: 'auto' }}>
              <img src="/assets/qr-code.png" alt="QR" className="bg-white p-1 rounded-2" style={{ width: 58, height: 58 }} />
            </div>
            {/* Textos FR/DE — junto a banderas FR/DE ~65% */}
            <div className="position-absolute font-mono d-none d-md-block"
              style={{ left: '65%', top: '50%', transform: 'translateY(-50%)', fontSize: 11, pointerEvents: 'none' }}>
              {textos?.text_fr && <div className="text-white fw-semibold">{textos.text_fr}</div>}
              {textos?.text_de && <div className="text-white fw-semibold">{textos.text_de}</div>}
            </div>
            {/* Contador + cambiar evento — antes del logo PrintboxAdventure (~83%) */}
            <div className="position-absolute text-end"
              style={{ left: '80%', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'auto' }}>
              <div className="text-warning fw-bold lh-1" style={{ fontSize: 24 }}>{printCount}</div>
              <div className="text-white font-mono" style={{ fontSize: 9, opacity: 0.85, textTransform: 'uppercase', letterSpacing: 1 }}>impresiones</div>
              <button className="btn btn-link p-0 text-white-50 font-mono d-block"
                style={{ fontSize: 9, pointerEvents: 'auto' }}
                onClick={() => { setEventInput(''); setEventError(''); setShowEventModal(true) }}>
                <i className="bi bi-pencil me-1" />cambiar
              </button>
            </div>
          </div>
        </div>
        {error && <div className="alert alert-danger py-1 px-3 mb-0 rounded-0 font-mono small border-0">{error}</div>}
      </header>

      {/* ── GALERÍA ── */}
      <main className="flex-grow-1 overflow-auto py-3 px-2 px-md-4">
        {!uuid ? (
          <div className="text-center text-secondary py-5">
            <i className="bi bi-camera" style={{ fontSize: 56 }} />
            <p className="font-mono mt-3">Introduce el evento para ver las fotos</p>
          </div>
        ) : photos.length === 0 ? (
          <div className="text-center text-secondary py-5">
            <i className="bi bi-hourglass-split" style={{ fontSize: 56 }} />
            <p className="font-mono mt-3">Esperando fotos de <strong>{config?.evento}</strong>…</p>
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

      {/* ── PAGINADOR ── */}
      {lastPage > 1 && (
        <nav className="d-flex justify-content-center py-2 flex-shrink-0">
          <ul className="pagination pagination-sm mb-0">
            <li className={`page-item ${currentPage === 1 ? 'disabled' : ''}`}>
              <button className="page-link bg-dark border-secondary text-light"
                onClick={() => setCurrentPage(p => p - 1)}>
                <i className="bi bi-chevron-left" />
              </button>
            </li>
            {Array.from({ length: lastPage }, (_, i) => i + 1).map(page => (
              <li key={page} className={`page-item ${page === currentPage ? 'active' : ''}`}>
                <button className="page-link bg-dark border-secondary text-light fw-bold"
                  onClick={() => setCurrentPage(page)}>{page}</button>
              </li>
            ))}
            <li className={`page-item ${currentPage === lastPage ? 'disabled' : ''}`}>
              <button className="page-link bg-dark border-secondary text-light"
                onClick={() => setCurrentPage(p => p + 1)}>
                <i className="bi bi-chevron-right" />
              </button>
            </li>
          </ul>
        </nav>
      )}

      {/* ── FOOTER ── */}
      <footer className="viewer-footer flex-shrink-0">
        <div className="position-relative">
          <img src="/assets/banners-Adventure_inf.png" alt="" className="w-100 viewer-footer-img" />
          <div className="position-absolute top-0 start-0 end-0 bottom-0" style={{ pointerEvents: 'none' }}>
            {/* Precio 1 — junto al primer círculo ~13% */}
            {textos?.precio1 && (
              <div className="position-absolute font-mono fw-bold"
                style={{ left: '13%', top: '50%', transform: 'translateY(-50%)', fontSize: 13 }}>
                <span className="">{textos.precio1}€</span>
              </div>
            )}
            {/* Precio 2 — junto al segundo círculo ~42% */}
            {textos?.precio2 && (
              <div className="position-absolute font-mono fw-bold"
                style={{ left: '42%', top: '50%', transform: 'translateY(-50%)', fontSize: 13 }}>
                <span className="">{textos.precio2}€</span>
              </div>
            )}
            {/* Precio 3 — junto al tercer círculo ~63% */}
            {textos?.precio3 && (
              <div className="position-absolute font-mono fw-bold"
                style={{ left: '63%', top: '50%', transform: 'translateY(-50%)', fontSize: 13 }}>
                <span className="">{textos.precio3}€</span>
              </div>
            )}
            {/* Empresa — derecha */}
            {textos?.empresa && (
              <div className="position-absolute font-mono fw-bold text-white d-none d-sm-block"
                style={{ right: '3%', top: '50%', transform: 'translateY(-50%)', fontSize: 12 }}>
                {textos.empresa}
              </div>
            )}
          </div>
        </div>
      </footer>

    </div>
  )
}

function PhotoCard({ photo, onSelect }) {
  const thumb = photo.uri || photo.uri_full
  return (
    <button className="viewer-photo-card btn p-0 w-100 border-2 border-secondary rounded-3 overflow-hidden position-relative"
      onClick={() => onSelect(photo)}
      style={{ aspectRatio: '3/4' }}>
      <img src={thumb} alt="" className="w-100 h-100" style={{ objectFit: 'cover' }} draggable={false} />
      <div className="viewer-photo-hint position-absolute bottom-0 start-0 end-0 text-center text-warning font-mono py-2"
        style={{ fontSize: 12, background: 'linear-gradient(transparent, rgba(0,0,0,0.8))' }}>
        <i className="bi bi-printer me-1" />Imprimir
      </div>
    </button>
  )
}