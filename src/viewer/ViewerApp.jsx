import React, { useState, useEffect, useCallback, useRef } from 'react'
import { findEvent, getEventPhotos, printJob } from '../shared/api'
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
  const [preview, setPreview] = useState(null) // imagen en previsualización
  const [printing, setPrinting] = useState(null) // nombre imagen imprimiendo
  const [error, setError] = useState(null)
  const BACKEND = window.electronAPI?.backendUrl || 'http://localhost:4000'

  // Carga config inicial
  useEffect(() => {
    fetch(`${BACKEND}/config`)
      .then(r => r.json())
      .then(d => {
        setConfig(d.config)
        setTextos(d.textos)
      })
      .catch(() => {})

    fetch(`${BACKEND}/print/count`)
      .then(r => r.json())
      .then(d => setPrintCount(d.count || 0))
      .catch(() => {})
  }, [BACKEND])

  // Resuelve el UUID del evento una vez tengamos config
  useEffect(() => {
    if (!config?.evento) return
    findEvent(config.evento)
      .then(setUuid)
      .catch(e => setError(`No se pudo conectar al evento: ${e.message}`))
  }, [config?.evento])

  // Carga fotos de la página actual
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

  useEffect(() => { loadPhotos() }, [loadPhotos])

  // Polling según timer configurado
  const timerMs = config?.timer ? config.timer * 1000 : null
  useInterval(loadPhotos, uuid ? timerMs : null)

  // Click izquierdo = imprimir
  async function handlePrint(photo) {
    if (!photo || printing) return
    const imageUrl = photo.uri?.replace('thumbs_', 'gallery_') || photo.uri_full
    const imageName = imageUrl.split('/').pop()
    if (!imageName) return

    setPrinting(imageName)
    try {
      const result = await printJob({
        imageUrl,
        imageName,
        printer: config?.impresora,
        delay: config?.delay || 5,
      })
      setPrintCount(result.count)
    } catch (e) {
      console.error('Error al imprimir:', e)
    } finally {
      setPrinting(null)
    }
  }

  // Click derecho = previsualizar
  function handlePreview(e, photo) {
    e.preventDefault()
    setPreview(photo.uri || photo.uri_full)
  }

  if (!config) {
    return (
      <div className="viewer-loading">
        <div className="viewer-loading__spinner" />
        <span>Cargando configuración…</span>
      </div>
    )
  }

  // Filas de fotos: 5 por fila, 2 filas = 10 por página
  const row1 = photos.slice(0, 5)
  const row2 = photos.slice(5, 10)

  return (
    <div className="viewer">
      {/* HEADER */}
      <header className="viewer__header">
        <div className="viewer__header-bar">
          <div className="viewer__texts">
            {textos?.text_es && <span>{textos.text_es}</span>}
            {textos?.text_en && <span>{textos.text_en}</span>}
            {textos?.text_fr && <span>{textos.text_fr}</span>}
            {textos?.text_de && <span>{textos.text_de}</span>}
          </div>
          <div className="viewer__qr">
            <div className="viewer__qr-placeholder">QR</div>
          </div>
          <div className="viewer__counter">
            <span className="viewer__counter-num">{printCount}</span>
            <span className="viewer__counter-label">impresiones</span>
          </div>
        </div>
        {error && <div className="viewer__error">{error}</div>}
      </header>

      {/* GALERÍA */}
      <main className="viewer__gallery">
        {photos.length === 0 ? (
          <div className="viewer__empty">
            <div className="viewer__empty-icon">📷</div>
            <p>Esperando fotos del evento <strong>{config.evento}</strong>…</p>
          </div>
        ) : (
          <>
            <div className="viewer__row">
              {row1.map(photo => (
                <PhotoCard
                  key={photo.id || photo.uri}
                  photo={photo}
                  printing={printing}
                  onPrint={handlePrint}
                  onPreview={handlePreview}
                />
              ))}
            </div>
            <div className="viewer__row">
              {row2.map(photo => (
                <PhotoCard
                  key={photo.id || photo.uri}
                  photo={photo}
                  printing={printing}
                  onPrint={handlePrint}
                  onPreview={handlePreview}
                />
              ))}
            </div>
          </>
        )}
      </main>

      {/* PAGINADOR */}
      {lastPage > 1 && (
        <nav className="viewer__pagination">
          {Array.from({ length: lastPage }, (_, i) => i + 1).map(page => (
            <button
              key={page}
              className={`viewer__page-btn ${page === currentPage ? 'active' : ''}`}
              onClick={() => setCurrentPage(page)}
            >
              {page}
            </button>
          ))}
        </nav>
      )}

      {/* FOOTER */}
      <footer className="viewer__footer">
        {textos?.precio1 && <span className="viewer__precio">1 foto — <strong>{textos.precio1}€</strong></span>}
        {textos?.precio2 && <span className="viewer__precio">2 fotos — <strong>{textos.precio2}€</strong></span>}
        {textos?.precio3 && <span className="viewer__precio">3 fotos — <strong>{textos.precio3}€</strong></span>}
        {textos?.empresa && <span className="viewer__empresa">{textos.empresa}</span>}
      </footer>

      {/* MODAL PREVISUALIZACIÓN */}
      {preview && (
        <div className="viewer__modal" onClick={() => setPreview(null)}>
          <div className="viewer__modal-inner" onClick={e => e.stopPropagation()}>
            <img src={preview} alt="Preview" className="viewer__modal-img" />
            <button className="viewer__modal-close" onClick={() => setPreview(null)}>✕</button>
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
      className={`viewer__photo ${isPrinting ? 'printing' : ''}`}
      onClick={() => onPrint(photo)}
      onContextMenu={e => onPreview(e, photo)}
      disabled={!!printing}
      title="Click izquierdo: imprimir · Click derecho: previsualizar"
    >
      <img src={thumb} alt="" draggable={false} />
      {isPrinting && (
        <div className="viewer__photo-overlay">
          <div className="viewer__photo-spinner" />
          <span>Imprimiendo…</span>
        </div>
      )}
      <div className="viewer__photo-hint">
        <span>🖨 Imprimir</span>
      </div>
    </button>
  )
}
