import React, { useState, useEffect, useCallback, useRef } from 'react'


import { findEvent, getPhotosToPrint, getConfig, saveConfig, getPrinters, getPrintCount } from '../shared/api'
import { useInterval } from '../shared/hooks/useInterval'
import './Printer.css'
const APP_VERSION = '1.0.5'

const BACKEND = window.electronAPI?.backendUrl || 'http://localhost:4000'

export default function PrinterApp() {
  const [config, setConfig] = useState({ servidor: 'http://gestion.printboxweb.com', evento: '', timer: 5, delay: 5, impresora: '' })
  const [textos, setTextos] = useState({ text_es: '', text_en: '', text_fr: '', text_de: '', precio1: '', precio2: '', precio3: '', empresa: '' })
  const [printers, setPrinters] = useState([])
  const [editing, setEditing] = useState(false)
  const [showEventModal, setShowEventModal] = useState(false)
  const [eventInput, setEventInput] = useState('')
  const [eventError, setEventError] = useState('')
  const eventInputRef = useRef(null)
  const [running, setRunning] = useState(false)
  const [uuid, setUuid] = useState(null)
  const [printedImages, setPrintedImages] = useState([])
  const [lastPhoto, setLastPhoto] = useState(null)
  const [printCount, setPrintCount] = useState(0)
  const [logs, setLogs] = useState([])
  const [elapsed, setElapsed] = useState(0)
  const [printerStatus, setPrinterStatus] = useState('ok')   // 'ok' | 'offline'
  const [apiStatus, setApiStatus]         = useState('ok')   // 'ok' | 'error'
  const [reconnecting, setReconnecting]   = useState(false)
  const reconnectAttemptsRef              = useRef(0)
  const logsRef = useRef(null)

  // ── CHECK IMPRESORA ─────────────────────────────────────────────────────────
  async function checkPrinterStatus(printerName) {
    try {
      const list = await getPrinters()
      setPrinters(list)
      if (!printerName) { setPrinterStatus('ok'); return }
      const found = list.some(p => p === printerName || p.includes(printerName))
      setPrinterStatus(found ? 'ok' : 'offline')
    } catch { setPrinterStatus('offline') }
  }

  useEffect(() => {
    getConfig().then(d => {
      if (d.config) { setConfig(d.config); checkPrinterStatus(d.config.impresora) }
      if (d.textos) setTextos(d.textos)
    }).catch(() => {})
    getPrintCount().then(setPrintCount).catch(() => {})
  }, [])

  // Verificar impresora cada 30s
  useInterval(() => checkPrinterStatus(config.impresora), 30000)

  useEffect(() => { if (logsRef.current) logsRef.current.scrollTop = logsRef.current.scrollHeight }, [logs])
  useEffect(() => { if (showEventModal) setTimeout(() => eventInputRef.current?.focus(), 50) }, [showEventModal])

  function addLog(msg, type = 'info') {
    const time = new Date().toTimeString().slice(0, 8)
    setLogs(prev => [...prev.slice(-200), { time, msg, type, id: Date.now() + Math.random() }])
  }

  useInterval(() => setElapsed(e => e + 1), running ? 1000 : null)

  function formatElapsed(s) {
    return [Math.floor(s/3600), Math.floor((s%3600)/60), s%60].map(n => String(n).padStart(2,'0')).join(':')
  }

  function handleStartClick() {
    setEventInput(config.evento?.replace('ev-', '') || '')
    setEventError('')
    setShowEventModal(true)
  }

  async function handleEventConfirm() {
    const code = eventInput.trim()
    if (!code) { setEventError('Introduce el número del evento'); return }
    const fullCode = `ev-${code}`
    setEventError('')
    setShowEventModal(false)
    const newConfig = { ...config, evento: fullCode }
    setConfig(newConfig)
    await saveConfig(newConfig, textos)
    addLog(`✓ Evento configurado: ${fullCode}`, 'success')
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter') handleEventConfirm()
    if (e.key === 'Escape') setShowEventModal(false)
  }

  async function handleStart() {
    if (!config.evento) { handleStartClick(); return }
    addLog(`Conectando con evento ${config.evento}...`)
    try {
      const eventUuid = await findEvent(config.evento)
      setUuid(eventUuid); setRunning(true); setElapsed(0); setPrintedImages([])
      addLog(`✓ Conectado. UUID: ${eventUuid}`, 'success')
      addLog(`Buscando fotos cada ${config.timer}s con ${config.delay}s de delay...`)
    } catch (e) { addLog(`✗ Error al conectar: ${e.message}`, 'error') }
  }

  function handleStop() {
    setRunning(false); setUuid(null)
    addLog('— Programa detenido.', 'warn')
  }

  // ── 2. RECONEXIÓN AUTOMÁTICA ─────────────────────────────────────────────────
  async function tryReconnect() {
    if (reconnecting || !config.evento) return
    setReconnecting(true)
    reconnectAttemptsRef.current += 1
    const attempt = reconnectAttemptsRef.current
    addLog(`↻ Intentando reconectar... (intento ${attempt})`, 'warn')
    try {
      const newUuid = await findEvent(config.evento)
      setUuid(newUuid)
      setApiStatus('ok')
      setReconnecting(false)
      reconnectAttemptsRef.current = 0
      addLog(`✓ Reconectado al evento ${config.evento}`, 'success')
    } catch {
      setReconnecting(false)
      const delay = Math.min(30, attempt * 5)
      addLog(`✗ Reconexión fallida. Próximo intento en ${delay}s...`, 'error')
      setTimeout(tryReconnect, delay * 1000)
    }
  }

  const checkAndPrint = useCallback(async () => {
    if (!uuid) return
    try {
      const photos = await getPhotosToPrint(uuid)
      setApiStatus('ok')
      reconnectAttemptsRef.current = 0
      if (!photos?.length) return
      for (const photo of photos) {
        const baseUrl = photo.uri_full
        const baseName = baseUrl.split('/').pop()
        for (let t = 1; t <= (photo.times || 1); t++) {
          const imageName = baseName.replace('gallery_', `print_${t}_`)
          if (printedImages.includes(imageName)) continue
          addLog(`↓ Descargando ${imageName}...`)
          try {
            const result = await fetch(`${BACKEND}/print/job`, {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ imageUrl: baseUrl, imageName, printer: config.impresora, delay: config.delay }),
            }).then(r => r.json())
            if (result.error) throw new Error(result.error)
            setPrintedImages(prev => [...prev, imageName])
            setLastPhoto(baseUrl); setPrintCount(result.count)
            addLog(`✓ Impreso: ${imageName} (total: ${result.count})`, 'success')
          } catch (err) { addLog(`✗ Error impresión: ${err.message}`, 'error') }
        }
      }
      addLog('... Esperando más imágenes.')
    } catch (e) {
      setApiStatus('error')
      addLog(`✗ Error API: ${e.message} — iniciando reconexión...`, 'error')
      setUuid(null)
      tryReconnect()
    }
  }, [uuid, printedImages, config.impresora, config.delay, config.evento])

  useInterval(checkAndPrint, running ? config.timer * 1000 : null)

  async function handleSave() {
    await saveConfig(config, textos)
    setEditing(false)
    addLog('✓ Configuración guardada.', 'success')
  }

  const logTypeClass = { info: 'text-light', success: 'text-success', warn: 'text-warning', error: 'text-danger' }

  return (
    <div className="printer-app d-flex flex-column vh-100 bg-dark text-light">

      {/* ── 3. ALERTA IMPRESORA OFFLINE ──────────────────────────────────────── */}
      {printerStatus === 'offline' && config.impresora && (
        <div className="alert alert-danger rounded-0 mb-0 py-2 px-4 d-flex align-items-center gap-2 border-0 flex-shrink-0" role="alert">
          <i className="bi bi-printer-fill fs-5" />
          <strong>Impresora no encontrada:</strong>
          <span className="font-mono">"{config.impresora}"</span>
          <span className="ms-1">— Verifica que está encendida y conectada.</span>
          <button className="btn btn-sm btn-outline-light ms-auto font-mono" onClick={() => checkPrinterStatus(config.impresora)}>
            <i className="bi bi-arrow-clockwise me-1" />Reintentar
          </button>
        </div>
      )}

      {/* ── 2. ALERTA RECONECTANDO ───────────────────────────────────────────── */}
      {apiStatus === 'error' && (
        <div className="alert alert-warning rounded-0 mb-0 py-2 px-4 d-flex align-items-center gap-2 border-0 flex-shrink-0" role="alert">
          <div className="spinner-border spinner-border-sm text-warning" role="status" />
          <strong>Sin conexión con la API.</strong>
          <span>Intentando reconectar automáticamente...</span>
        </div>
      )}

      {/* MODAL EVENTO — Bootstrap modal */}
      {showEventModal && (
        <div className="modal d-block" tabIndex="-1" style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)' }}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content bg-dark border border-secondary">
              <div className="modal-body text-center p-4">
                <img src="/assets/MoscaPrintbox.png" alt="Logo" className="rounded-3 mb-3" style={{ width: 80 }} />
                <h5 className="fw-bold mb-1">¿Cuál es el evento?</h5>
                <p className="text-secondary small font-mono mb-3">Introduce el número del evento a conectar</p>
                <div className="input-group mb-2">
                  <span className="input-group-text bg-black border-secondary text-warning fw-bold font-mono">ev-</span>
                  <input
                    ref={eventInputRef}
                    type="text"
                    className={`form-control bg-black border-secondary text-light font-mono fs-4 fw-bold ${eventError ? 'is-invalid' : ''}`}
                    style={{ letterSpacing: 3 }}
                    value={eventInput}
                    onChange={e => setEventInput(e.target.value.replace(/\D/g, ''))}
                    onKeyDown={handleKeyDown}
                  />
                  {eventError && <div className="invalid-feedback text-start">{eventError}</div>}
                </div>
              </div>
              <div className="modal-footer border-secondary justify-content-between">
                <button className="btn btn-outline-secondary" onClick={() => setShowEventModal(false)}>
                  <i className="bi bi-x-lg me-1" /> Cancelar
                </button>
                <button className="btn btn-warning text-dark fw-bold" onClick={handleEventConfirm}>
                  <i className="bi bi-check-lg me-1" /> Guardar evento
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* HEADER */}
      <nav className="navbar bg-black border-bottom border-warning px-4 flex-shrink-0" style={{ borderBottomWidth: 2 }}>
        <div className="d-flex align-items-center gap-3">
          <img src="/assets/MoscaPrintbox.png" alt="Logo" className="rounded-2" style={{ width: 38, height: 38 }} />
          <div>
            <div className="fw-bold" style={{ fontFamily: 'Syne', fontSize: 16 }}>PrintboxAdventures</div>
            <div className="text-secondary font-mono d-flex align-items-center gap-2" style={{ fontSize: 10, letterSpacing: 1.5, textTransform: 'uppercase' }}>
              Panel de Control
              <span className="badge border border-secondary text-secondary fw-normal" style={{ fontSize: 9, letterSpacing: 0 }}>v{APP_VERSION}</span>
            </div>
          </div>
        </div>
        <div className="d-flex align-items-center gap-3 ms-auto">
          {config.evento && (
            <span className="badge border border-warning text-warning font-mono d-flex align-items-center gap-2" style={{ fontSize: 12 }}>
              <i className="bi bi-calendar-event" />
              {config.evento}
              <button className="btn btn-link p-0 text-warning" style={{ fontSize: 11, opacity: 0.7 }}
                onClick={handleStartClick} disabled={running} title="Cambiar evento">
                <i className="bi bi-pencil" />
              </button>
            </span>
          )}
          <span className="text-secondary font-mono" style={{ fontSize: 11 }}>
            <i className="bi bi-envelope me-1" />eventos@printboxweb.com · 623 040 445
          </span>
        </div>
      </nav>

      {/* BODY */}
      <div className="flex-grow-1 overflow-auto p-3">
        <div className="row g-3">

          {/* CONFIG */}
          <div className="col-12">
            <div className="card bg-black border-secondary">
              <div className="card-body">
                <div className="d-flex align-items-center gap-3 mb-3">
                  <span className="text-secondary font-mono fw-bold" style={{ fontSize: 11, letterSpacing: 2, textTransform: 'uppercase' }}>Configuración</span>
                  <span className="badge bg-secondary font-mono fw-normal">API · {config.servidor}</span>
                </div>
                <div className="row g-3">
                  <div className="col-md-3">
                    <label className="form-label text-secondary small fw-bold">Delay (seg)</label>
                    <div className="form-text text-secondary mb-1" style={{ fontSize: 10 }}>Espera antes de imprimir</div>
                    <input type="number" min="1" className="form-control bg-dark border-secondary text-light font-mono"
                      value={config.delay} disabled={!editing || running}
                      onChange={e => setConfig(p => ({ ...p, delay: parseInt(e.target.value) || 5 }))} />
                  </div>
                  <div className="col-md-3">
                    <label className="form-label text-secondary small fw-bold">Timer (seg)</label>
                    <div className="form-text text-secondary mb-1" style={{ fontSize: 10 }}>Frecuencia de consulta</div>
                    <input type="number" min="5" className="form-control bg-dark border-secondary text-light font-mono"
                      value={config.timer} disabled={!editing || running}
                      onChange={e => setConfig(p => ({ ...p, timer: parseInt(e.target.value) || 5 }))} />
                  </div>
                  <div className="col-md-6">
                    <label className="form-label text-secondary small fw-bold">Impresora</label>
                    <div className="form-text text-secondary mb-1" style={{ fontSize: 10 }}>&nbsp;</div>
                    <select className="form-select bg-dark border-secondary text-light"
                      value={config.impresora} disabled={!editing || running}
                      onChange={e => setConfig(p => ({ ...p, impresora: e.target.value }))}>
                      <option value="">— Predeterminada del sistema —</option>
                      {printers.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </div>
                </div>

                {editing && (
                  <div className="mt-4">
                    <p className="text-secondary font-mono fw-bold mb-3" style={{ fontSize: 11, letterSpacing: 2, textTransform: 'uppercase' }}>Textos del Visor</p>
                    <div className="row g-2">
                      {[['text_es','Español'],['text_en','English'],['text_fr','Français'],['text_de','Deutsch'],
                        ['precio1','1 foto (€)'],['precio2','2 fotos (€)'],['precio3','3 fotos (€)'],['empresa','Empresa']
                      ].map(([key, label]) => (
                        <div className="col-md-3" key={key}>
                          <label className="form-label text-secondary small fw-bold">{label}</label>
                          <input className="form-control form-control-sm bg-dark border-secondary text-light font-mono"
                            value={textos[key] || ''} onChange={e => setTextos(p => ({ ...p, [key]: e.target.value }))} />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="d-flex justify-content-end gap-2 mt-3">
                  {!editing ? (
                    <button className="btn btn-outline-secondary btn-sm" onClick={() => setEditing(true)} disabled={running}>
                      <i className="bi bi-pencil me-1" />Editar
                    </button>
                  ) : (
                    <>
                      <button className="btn btn-outline-secondary btn-sm" onClick={() => setEditing(false)}>
                        <i className="bi bi-x me-1" />Cancelar
                      </button>
                      <button className="btn btn-warning btn-sm text-dark fw-bold" onClick={handleSave}>
                        <i className="bi bi-floppy me-1" />Guardar
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* CONTROLES */}
          <div className="col-12">
            <div className="card bg-black border-secondary">
              <div className="card-body d-flex align-items-center justify-content-center gap-5 py-3">
                <button className="btn btn-success btn-lg px-5 fw-bold" onClick={handleStart} disabled={running}>
                  <i className="bi bi-play-fill me-2" />Encender
                </button>
                <div className="text-center">
                  <div className={`printer-state-dot mx-auto mb-2 ${running ? 'on' : 'off'}`} />
                  <small className="text-secondary font-mono" style={{ letterSpacing: 2, fontSize: 10 }}>
                    {running ? 'EN EJECUCIÓN' : 'DETENIDO'}
                  </small>
                </div>
                <button className="btn btn-danger btn-lg px-5 fw-bold" onClick={handleStop} disabled={!running}>
                  <i className="bi bi-stop-fill me-2" />Apagar
                </button>
              </div>
            </div>
          </div>

          {/* STATS */}
          <div className="col-md-3">
            <div className="card bg-black border-secondary h-100 text-center">
              <div className="card-body d-flex flex-column align-items-center justify-content-center">
                <div className="text-warning fw-bold" style={{ fontSize: 36 }}>{printCount}</div>
                <div className="text-secondary font-mono" style={{ fontSize: 10, letterSpacing: 1, textTransform: 'uppercase' }}>Fotos impresas</div>
              </div>
            </div>
          </div>
          <div className="col-md-3">
            <div className="card bg-black border-secondary h-100 text-center">
              <div className="card-body d-flex flex-column align-items-center justify-content-center">
                <div className="text-warning fw-bold font-mono" style={{ fontSize: 32 }}>{formatElapsed(elapsed)}</div>
                <div className="text-secondary font-mono" style={{ fontSize: 10, letterSpacing: 1, textTransform: 'uppercase' }}>Tiempo en ejecución</div>
              </div>
            </div>
          </div>
          <div className="col-md-6">
            <div className="card bg-black border-secondary h-100">
              <div className="card-body d-flex flex-column align-items-center">
                <div className="text-secondary font-mono mb-2" style={{ fontSize: 10, letterSpacing: 1, textTransform: 'uppercase' }}>
                  <i className="bi bi-image me-1" />Última foto impresa
                </div>
                {lastPhoto
                  ? <img src={lastPhoto} alt="Última foto" className="rounded-2 img-fluid" style={{ maxHeight: 110, objectFit: 'contain' }} />
                  : <div className="text-secondary font-mono mt-3" style={{ fontSize: 24 }}>—</div>}
              </div>
            </div>
          </div>

          {/* LOG */}
          <div className="col-12">
            <div className="card bg-black border-secondary">
              <div className="card-body">
                <p className="text-secondary font-mono fw-bold mb-2" style={{ fontSize: 11, letterSpacing: 2, textTransform: 'uppercase' }}>
                  <i className="bi bi-terminal me-2" />Log
                </p>
                <div ref={logsRef} className="printer-log font-mono rounded-2 p-2 bg-darker" style={{ height: 160, overflowY: 'auto', fontSize: 12 }}>
                  {logs.length === 0
                    ? <span className="text-secondary fst-italic">El log aparecerá aquí al encender el programa.</span>
                    : logs.map(entry => (
                      <div key={entry.id} className={`d-flex gap-3 ${logTypeClass[entry.type] || 'text-light'}`}>
                        <span className="text-secondary opacity-50 flex-shrink-0">{entry.time}</span>
                        <span>{entry.msg}</span>
                      </div>
                    ))
                  }
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}