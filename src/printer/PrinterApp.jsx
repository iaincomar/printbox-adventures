import React, { useState, useEffect, useCallback, useRef } from 'react'
import { findEvent, getPhotosToPrint, getConfig, saveConfig, getPrinters, getPrintCount } from '../shared/api'
import { useInterval } from '../shared/hooks/useInterval'
import './Printer.css'

const BACKEND = window.electronAPI?.backendUrl || 'http://localhost:4000'

export default function PrinterApp() {
  // ── Configuración ────────────────────────────────────────────────────────
  const [config, setConfig] = useState({
    servidor: 'http://gestion.printboxweb.com',
    evento: '',
    timer: 5,
    delay: 5,
    impresora: '',
  })
  const [textos, setTextos] = useState({
    text_es: '', text_en: '', text_fr: '', text_de: '',
    precio1: '', precio2: '', precio3: '', empresa: '',
  })
  const [printers, setPrinters] = useState([])
  const [editing, setEditing] = useState(false)

  // ── Modal de evento ──────────────────────────────────────────────────────
  const [showEventModal, setShowEventModal] = useState(false)
  const [eventInput, setEventInput] = useState('')
  const [eventError, setEventError] = useState('')
  const eventInputRef = useRef(null)

  // ── Estado de ejecución ──────────────────────────────────────────────────
  const [running, setRunning] = useState(false)
  const [uuid, setUuid] = useState(null)
  const [printedImages, setPrintedImages] = useState([])
  const [lastPhoto, setLastPhoto] = useState(null)
  const [printCount, setPrintCount] = useState(0)
  const [logs, setLogs] = useState([])
  const [elapsed, setElapsed] = useState(0)

  const logsRef = useRef(null)

  // ── Carga inicial ────────────────────────────────────────────────────────
  useEffect(() => {
    getConfig().then(d => {
      if (d.config) setConfig(d.config)
      if (d.textos) setTextos(d.textos)
    }).catch(() => {})
    getPrinters().then(setPrinters).catch(() => {})
    getPrintCount().then(setPrintCount).catch(() => {})
  }, [])

  useEffect(() => {
    if (logsRef.current) logsRef.current.scrollTop = logsRef.current.scrollHeight
  }, [logs])

  // Focus automático en el input del modal
  useEffect(() => {
    if (showEventModal && eventInputRef.current) {
      setTimeout(() => eventInputRef.current?.focus(), 50)
    }
  }, [showEventModal])

  function addLog(msg, type = 'info') {
    const time = new Date().toTimeString().slice(0, 8)
    setLogs(prev => [...prev.slice(-200), { time, msg, type, id: Date.now() + Math.random() }])
  }

  useInterval(() => setElapsed(e => e + 1), running ? 1000 : null)

  function formatElapsed(s) {
    const h = Math.floor(s / 3600).toString().padStart(2, '0')
    const m = Math.floor((s % 3600) / 60).toString().padStart(2, '0')
    const sec = (s % 60).toString().padStart(2, '0')
    return `${h}:${m}:${sec}`
  }

  // ── Abrir modal al pulsar Encender ───────────────────────────────────────
  // Abre modal para cambiar evento
  function handleStartClick() {
    setEventInput(config.evento?.replace('ev-', '') || '')
    setEventError('')
    setShowEventModal(true)
  }

  // Encender: arranca con el evento ya configurado
  async function handleStart() {
    if (!config.evento) { handleStartClick(); return }
    addLog(`Conectando con evento ${config.evento}...`)
    try {
      const eventUuid = await findEvent(config.evento)
      setUuid(eventUuid)
      setRunning(true)
      setElapsed(0)
      setPrintedImages([])
      addLog(`Conectado. UUID: ${eventUuid}`, 'success')
      addLog(`Buscando fotos cada ${config.timer}s con ${config.delay}s de delay...`)
    } catch (e) {
      addLog(`Error al conectar: ${e.message}`, 'error')
    }
  }

  // ── Confirmar evento en el modal y arrancar ──────────────────────────────
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
    await saveConfig(newConfig, textos)
    addLog(`✓ Evento configurado: ${fullCode}`, 'success')
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter') handleEventConfirm()
    if (e.key === 'Escape') setShowEventModal(false)
  }

  // ── APAGAR ───────────────────────────────────────────────────────────────
  function handleStop() {
    setRunning(false)
    setUuid(null)
    addLog('— Programa detenido.', 'warn')
  }

  // ── POLLING ──────────────────────────────────────────────────────────────
  const checkAndPrint = useCallback(async () => {
    if (!uuid) return
    try {
      const photos = await getPhotosToPrint(uuid)
      if (!photos || photos.length === 0) return

      for (const photo of photos) {
        const baseUrl = photo.uri_full
        const baseName = baseUrl.split('/').pop()

        for (let t = 1; t <= (photo.times || 1); t++) {
          const imageName = baseName.replace('gallery_', `print_${t}_`)
          if (printedImages.includes(imageName)) continue

          addLog(`↓ Descargando ${imageName}…`)
          try {
            const result = await fetch(`${BACKEND}/print/job`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                imageUrl: baseUrl,
                imageName,
                printer: config.impresora,
                delay: config.delay,
              }),
            }).then(r => r.json())

            if (result.error) throw new Error(result.error)
            setPrintedImages(prev => [...prev, imageName])
            setLastPhoto(baseUrl)
            setPrintCount(result.count)
            addLog(`✓ Impreso: ${imageName} (total: ${result.count})`, 'success')
          } catch (err) {
            addLog(`✗ Error imprimiendo ${imageName}: ${err.message}`, 'error')
          }
        }
      }
      addLog('… Esperando más imágenes.')
    } catch (e) {
      addLog(`✗ Error al consultar API: ${e.message}`, 'error')
    }
  }, [uuid, printedImages, config.impresora, config.delay])

  useInterval(checkAndPrint, running ? config.timer * 1000 : null)

  async function handleSave() {
    await saveConfig(config, textos)
    setEditing(false)
    addLog('✓ Configuración guardada.', 'success')
  }

  return (
    <div className="printer">
      {/* MODAL EVENTO */}
      {showEventModal && (
        <div className="modal-overlay">
          <div className="modal-box">
            <div className="modal-logo">
              <img src="/assets/MoscaPrintbox.png" alt="Logo" className="modal-mascot" />
            </div>
            <h2 className="modal-title">¿Cuál es el evento?</h2>
            <p className="modal-subtitle">Introduce el número del evento a conectar</p>
            <div className="modal-input-wrap">
              <span className="modal-prefix">ev-</span>
              <input
                ref={eventInputRef}
                className="modal-input"
                type="text"
                placeholder=""
                value={eventInput}
                onChange={e => setEventInput(e.target.value.replace(/\D/g, ''))}
                onKeyDown={handleKeyDown}
              />
            </div>
            {eventError && <p className="modal-error">{eventError}</p>}
            <div className="modal-actions">
              <button className="btn btn--ghost" onClick={() => setShowEventModal(false)}>
                Cancelar
              </button>
              <button className="btn btn--accent" onClick={handleEventConfirm}>
                Cambiar Evento
              </button>
            </div>
          </div>
        </div>
      )}

      {/* HEADER */}
      <header className="printer__header">
        <div className="printer__logo">
          <img src="/assets/MoscaPrintbox.png" alt="Logo" className="printer__logo-mascot" />
          <div>
            <div className="printer__logo-title">PrintboxAdventures</div>
            <div className="printer__logo-sub">Panel de Control</div>
          </div>
        </div>
        <div className="printer__header-right">
          {config.evento && (
            <span className="printer__evento-badge">
              {config.evento}
              <button className="printer__evento-change" onClick={handleStartClick} disabled={running} title="Cambiar evento">
                ✏
              </button>
            </span>
          )}
          <span className="printer__contact">eventos@printboxweb.com · 623 040 445</span>
        </div>
      </header>

      <div className="printer__body">
        {/* CONFIGURACIÓN */}
        <section className="printer__config-section">
          <div className="printer__section-title">
            Configuración
            <div className="printer__mode-badge">API · {config.servidor}</div>
          </div>
          <div className="printer__config-grid">
            <Field label="Delay (seg)" mono hint="Espera antes de imprimir">
              <input type="number" min="1" value={config.delay}
                onChange={e => setConfig(p => ({ ...p, delay: parseInt(e.target.value) || 5 }))}
                disabled={!editing || running} />
            </Field>
            <Field label="Timer (seg)" mono hint="Frecuencia de consulta">
              <input type="number" min="5" value={config.timer}
                onChange={e => setConfig(p => ({ ...p, timer: parseInt(e.target.value) || 5 }))}
                disabled={!editing || running} />
            </Field>
            <Field label="Impresora">
              <select value={config.impresora}
                onChange={e => setConfig(p => ({ ...p, impresora: e.target.value }))}
                disabled={!editing || running}>
                <option value="">— Predeterminada del sistema —</option>
                {printers.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </Field>
          </div>
          <div className="printer__config-actions">
            {!editing ? (
              <button className="btn btn--ghost" onClick={() => setEditing(true)} disabled={running}>✏ Editar</button>
            ) : (
              <>
                <button className="btn btn--ghost" onClick={() => setEditing(false)}>Cancelar</button>
                <button className="btn btn--accent" onClick={handleSave}>💾 Guardar</button>
              </>
            )}
          </div>
        </section>

        {editing && (
          <section className="printer__textos-section">
            <div className="printer__section-title">Textos del Visor</div>
            <div className="printer__textos-grid">
              {[
                ['text_es','Español'],['text_en','English'],
                ['text_fr','Français'],['text_de','Deutsch'],
                ['precio1','1 foto (precio)'],['precio2','2 fotos (precio)'],
                ['precio3','3 fotos (precio)'],['empresa','Empresa'],
              ].map(([key, label]) => (
                <Field key={key} label={label} mono>
                  <input value={textos[key] || ''}
                    onChange={e => setTextos(p => ({ ...p, [key]: e.target.value }))} />
                </Field>
              ))}
            </div>
          </section>
        )}

        {/* CONTROLES */}
        <section className="printer__controls">
          <button
            className={`btn btn--big ${running ? 'btn--disabled' : 'btn--green'}`}
            onClick={handleStart} disabled={running}>
            ▶ Encender
          </button>
          <div className="printer__state-indicator">
            <div className={`printer__state-dot ${running ? 'on' : 'off'}`} />
            <span>{running ? 'EN EJECUCIÓN' : 'DETENIDO'}</span>
          </div>
          <button
            className={`btn btn--big ${!running ? 'btn--disabled' : 'btn--red'}`}
            onClick={handleStop} disabled={!running}>
            ■ Apagar
          </button>
        </section>

        {/* STATS */}
        <section className="printer__stats">
          <div className="printer__stat-card">
            <div className="printer__stat-num">{printCount}</div>
            <div className="printer__stat-label">Fotos impresas</div>
          </div>
          <div className="printer__stat-card">
            <div className="printer__stat-num">{formatElapsed(elapsed)}</div>
            <div className="printer__stat-label">Tiempo en ejecución</div>
          </div>
          <div className="printer__last-photo">
            <div className="printer__stat-label" style={{ marginBottom: 8 }}>Última foto impresa</div>
            {lastPhoto
              ? <img src={lastPhoto} alt="Última foto" className="printer__last-img" />
              : <div className="printer__last-empty">—</div>}
          </div>
        </section>

        {/* LOG */}
        <section className="printer__log-section">
          <div className="printer__section-title">Log</div>
          <div className="printer__log" ref={logsRef}>
            {logs.length === 0 && (
              <div className="printer__log-empty">El log aparecerá aquí al encender el programa.</div>
            )}
            {logs.map(entry => (
              <div key={entry.id} className={`printer__log-line printer__log-line--${entry.type}`}>
                <span className="printer__log-time">{entry.time}</span>
                <span>{entry.msg}</span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}

function Field({ label, hint, mono, children }) {
  return (
    <div className="printer__field">
      <label className="printer__field-label">{label}</label>
      {hint && <span className="printer__field-hint">{hint}</span>}
      <div className={mono ? 'printer__field-mono' : ''}>{children}</div>
    </div>
  )
}