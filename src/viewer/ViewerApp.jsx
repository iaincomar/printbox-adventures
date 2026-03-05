import React, { useState, useEffect, useCallback, useRef } from 'react'
import { findEvent, getEventPhotos, printJob, saveConfig } from '../shared/api'
import { useInterval } from '../shared/hooks/useInterval'
import './Viewer.css'

export default function ViewerApp() {
  const [config, setConfig] = useState(null)
  const [textos, setTextos] = useState(null)
  const [uuid, setUuid] = useState(null)
  const [photos, setPhotos] = useState([])
  const [currentPage, setCurrentPage] = useState(1)
  const [lastPage, setLastPage] = useState(1)
  const [printCount, setPrintCount] = useState(0)
  const [preview, setPreview] = useState(null)
  const [printing, setPrinting] = useState(null)
  const [error, setError] = useState(null)
  const [showModal, setShowModal] = useState(false)
  const [eventInput, setEventInput] = useState('')
  const [eventError, setEventError] = useState('')
  const inputRef = useRef(null)
  const BACKEND = window.electronAPI?.backendUrl || 'http://localhost:4000'

  useEffect(() => {
    Promise.all([
      fetch(`${BACKEND}/config`).then(r => r.json()),
      fetch(`${BACKEND}/print/count`).then(r => r.json()).catch(() => ({ count: 0 })),
    ]).then(([d, c]) => {
      if (d.config) setConfig(d.config)
      if (d.textos) setTextos(d.textos)
      setPrintCount(c.count || 0)
      setShowModal(true)
    }).catch(() => setShowModal(true))
  }, [BACKEND])

  useEffect(() => { if (showModal) setTimeout(() => inputRef.current?.focus(), 50) }, [showModal])

  async function handleEventConfirm() {
    const code = eventInput.trim()
    if (!code) { setEventError('Introduce el número del evento'); return }
    const fullCode = `ev-${code}`
    setEventError('')
    setShowModal(false)
    const newConfig = { ...config, evento: fullCode }
    setConfig(newConfig)
    await saveConfig(newConfig, textos).catch(() => {})
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter') handleEventConfirm()
    if (e.key === 'Escape') setShowModal(false)
  }

  useEffect(() => {
    if (!config?.evento) return
    findEvent(config.evento).then(setUuid).catch(e => setError(`No se pudo conectar: ${e.message}`))
  }, [config?.evento])

  const loadPhotos = useCallback(async () => {
    if (!uuid) return
    try {
      const { photos: p, lastPage: lp } = await getEventPhotos(uuid, currentPage)
      setPhotos(p); setLastPage(lp); setError(null)
    } catch (e) { setError(`Error al cargar fotos: ${e.message}`) }
  }, [uuid, currentPage])

  useEffect(() => { loadPhotos() }, [loadPhotos])
  useInterval(loadPhotos, uuid ? (config?.timer || 5) * 1000 : null)

  async function handlePrint(photo) {
    if (!photo || printing) return
    const imageUrl = photo.uri?.replace('thumbs_', 'gallery_') || photo.uri_full
    const imageName = imageUrl.split('/').pop()
    if (!imageName) return
    setPrinting(imageName)
    try {
      const result = await printJob({ imageUrl, imageName, printer: config?.impresora, delay: config?.delay || 5 })
      setPrintCount(result.count)
    } catch (e) { console.error(e) }
    finally { setPrinting(null) }
  }

  function handlePreview(e, photo) {
    e.preventDefault()
    setPreview(photo.uri || photo.uri_full)
  }

  const row1 = photos.slice(0, 5)
  const row2 = photos.slice(5, 10)

  return (
    <div className="viewer-app d-flex flex-column vh-100 bg-dark text-light overflow-hidden">

      {/* MODAL EVENTO */}
      {showModal && (
        <div className="modal d-block" tabIndex="-1" style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)' }}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content bg-dark border border-secondary">
              <div className="modal-body text-center p-5">
                <img src="/assets/MoscaPrintbox.png" alt="Logo" className="rounded-3 mb-3" style={{ width: 96 }} />
                <h4 className="fw-bold mb-1">¿Cuál es el evento?</h4>
                <p className="text-secondary font-mono small mb-4">Introduce el número del evento a mostrar</p>
                <div className="input-group mb-2">
                  <span className="input-group-text bg-black border-secondary text-warning fw-bold font-mono fs-5">ev-</span>
                  <input
                    ref={inputRef}
                    type="text"
                    className={`form-control bg-black border-secondary text-light font-mono fw-bold ${eventError ? 'is-invalid' : ''}`}
                    style={{ fontSize: 28, letterSpacing: 4 }}
                    value={eventInput}
                    onChange={e => setEventInput(e.target.value.replace(/\D/g, ''))}
                    onKeyDown={handleKeyDown}
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

      {/* HEADER — banner superior */}
      <header className="viewer-header flex-shrink-0">
        <div className="viewer-header-banner position-relative">
          <img src="/assets/banners-AdventureSup.png" alt="" className="w-100 viewer-header-img" />
          <div className="position-absolute top-0 start-0 end-0 bottom-0 d-flex align-items-center px-4 gap-3">
            <div className="flex-grow-1 font-mono" style={{ fontSize: 12 }}>
              {textos?.text_es && <div className="text-white">{textos.text_es}</div>}
              {textos?.text_en && <div className="text-white">{textos.text_en}</div>}
            </div>
            <img src="/assets/qr-code.png" alt="QR" className="bg-white p-1 rounded-2" style={{ width: 68, height: 68 }} />
            <div className="flex-grow-1 font-mono text-end" style={{ fontSize: 12 }}>
              {textos?.text_fr && <div className="text-white">{textos.text_fr}</div>}
              {textos?.text_de && <div className="text-white">{textos.text_de}</div>}
            </div>
            <div className="text-end flex-shrink-0">
              <div className="text-warning fw-bold" style={{ fontSize: 32, lineHeight: 1 }}>{printCount}</div>
              <div className="text-white font-mono" style={{ fontSize: 10, opacity: 0.8, textTransform: 'uppercase', letterSpacing: 1 }}>impresiones</div>
              <button className="btn btn-link p-0 text-white-50 font-mono mt-1" style={{ fontSize: 10 }}
                onClick={() => { setEventInput(''); setEventError(''); setShowModal(true) }}>
                <i className="bi bi-pencil me-1" />cambiar evento
              </button>
            </div>
          </div>
        </div>
        {error && <div className="alert alert-danger py-1 px-3 mb-0 rounded-0 font-mono small">{error}</div>}
      </header>

      {/* GALERÍA */}
      <main className="flex-grow-1 d-flex flex-column justify-content-center px-4 py-2 overflow-hidden gap-3">
        {!uuid ? (
          <div className="text-center text-secondary">
            <i className="bi bi-camera" style={{ fontSize: 48 }} />
            <p className="font-mono mt-2">Introduce el evento para ver las fotos</p>
          </div>
        ) : photos.length === 0 ? (
          <div className="text-center text-secondary">
            <i className="bi bi-hourglass-split" style={{ fontSize: 48 }} />
            <p className="font-mono mt-2">Esperando fotos de <strong>{config?.evento}</strong>…</p>
          </div>
        ) : (
          <>
            <div className="d-flex justify-content-center gap-3">
              {row1.map(photo => <PhotoCard key={photo.id || photo.uri} photo={photo} printing={printing} onPrint={handlePrint} onPreview={handlePreview} />)}
            </div>
            <div className="d-flex justify-content-center gap-3">
              {row2.map(photo => <PhotoCard key={photo.id || photo.uri} photo={photo} printing={printing} onPrint={handlePrint} onPreview={handlePreview} />)}
            </div>
          </>
        )}
      </main>

      {/* PAGINADOR */}
      {lastPage > 1 && (
        <nav className="d-flex justify-content-center py-2 flex-shrink-0">
          <ul className="pagination pagination-sm mb-0">
            {Array.from({ length: lastPage }, (_, i) => i + 1).map(page => (
              <li key={page} className={`page-item ${page === currentPage ? 'active' : ''}`}>
                <button className="page-link bg-dark border-secondary text-light fw-bold" onClick={() => setCurrentPage(page)}>
                  {page}
                </button>
              </li>
            ))}
          </ul>
        </nav>
      )}

      {/* FOOTER — banner inferior */}
      <footer className="viewer-footer flex-shrink-0">
        <div className="viewer-footer-banner position-relative">
          <img src="/assets/banners-Adventure_inf.png" alt="" className="w-100 viewer-footer-img" />
          <div className="position-absolute top-0 start-0 end-0 bottom-0 d-flex align-items-center px-5 gap-4">
            {textos?.precio1 && <span className="text-white font-mono small">1 → <strong className="text-warning">{textos.precio1}€</strong></span>}
            {textos?.precio2 && <span className="text-white font-mono small">2 → <strong className="text-warning">{textos.precio2}€</strong></span>}
            {textos?.precio3 && <span className="text-white font-mono small">3 → <strong className="text-warning">{textos.precio3}€</strong></span>}
            {textos?.empresa && <span className="text-white fw-bold ms-auto small">{textos.empresa}</span>}
          </div>
        </div>
      </footer>

      {/* PREVISUALIZACIÓN */}
      {preview && (
        <div className="modal d-block" tabIndex="-1" onClick={() => setPreview(null)}
          style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(4px)' }}>
          <div className="modal-dialog modal-dialog-centered modal-lg" onClick={e => e.stopPropagation()}>
            <div className="modal-content bg-transparent border-0 position-relative">
              <img src={preview} alt="Preview" className="img-fluid rounded-3" />
              <button className="btn btn-warning position-absolute fw-bold rounded-circle d-flex align-items-center justify-content-center"
                style={{ width: 36, height: 36, top: -14, right: -14, fontSize: 16 }}
                onClick={() => setPreview(null)}>
                <i className="bi bi-x-lg" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function PhotoCard({ photo, printing, onPrint, onPreview }) {
  const thumb = photo.uri || photo.uri_full
  const name = thumb?.split('/').pop()
  const isPrinting = printing === name?.replace('thumbs_', 'gallery_')

  return (
    <button
      className={`viewer-photo btn p-0 border-2 rounded-3 overflow-hidden position-relative ${isPrinting ? 'border-warning' : 'border-secondary'}`}
      style={{ width: 230, height: 258, flexShrink: 0 }}
      onClick={() => onPrint(photo)}
      onContextMenu={e => onPreview(e, photo)}
      disabled={!!printing}
      title="Click izquierdo: imprimir · Click derecho: previsualizar"
    >
      <img src={thumb} alt="" className="w-100 h-100" style={{ objectFit: 'cover' }} draggable={false} />
      {isPrinting && (
        <div className="position-absolute top-0 start-0 end-0 bottom-0 d-flex flex-column align-items-center justify-content-center gap-2"
          style={{ background: 'rgba(10,10,15,0.75)' }}>
          <div className="spinner-border spinner-border-sm text-warning" />
          <span className="font-mono text-light" style={{ fontSize: 12 }}>Imprimiendo…</span>
        </div>
      )}
      <div className="viewer-photo-hint position-absolute bottom-0 start-0 end-0 text-center text-warning font-mono py-2"
        style={{ fontSize: 12, background: 'linear-gradient(transparent, rgba(0,0,0,0.8))' }}>
        <i className="bi bi-printer me-1" />Imprimir
      </div>
    </button>
  )
}