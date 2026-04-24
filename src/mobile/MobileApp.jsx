import React, { useState, useEffect, useRef, useCallback } from 'react'
import { findEvent, getEventPhotos, sendPhoto, getConfig, processPayment, getPayPalConfig, createPayPalOrder, capturePayPalOrder } from '../shared/api'
import { useInterval } from '../shared/hooks/useInterval'
import './Mobile.css'

window.isMobile = true

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
const STEP_CAMERA = 'camera'    // Paso 4: Tomar fotos con la cámara
const STEP_ORDER = 'order'      // Paso 5: Resumen del pedido
const STEP_PAYMENT = 'payment'  // Paso 6: Pasarela de pago (Square)
const STEP_SUCCESS = 'success'  // Paso 7: Confirmación de envío

// ============================================
// CONSTANTES DE SQUARE (Production)
// ============================================
const SQUARE_APP_ID = 'sq0idp-OV9y595m1kR_UU3QRest7Q'
const SQUARE_LOCATION_ID = 'LHB32XGQK68GX'

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

  const normalizeEventCode = (code = '') => {
    return String(code).trim().replace(/^ev[-_]?/i, '')
  }
  const [loadingFromQR, setLoadingFromQR] = useState(false) // Cargando desde QR
  const [showTermsModal, setShowTermsModal] = useState(false)

  // --- Estados de galería ---
  const [photos, setPhotos] = useState([])               // Lista de fotos del evento
  const [page, setPage] = useState(1)                    // Página actual (paginación)
  const [lastPage, setLastPage] = useState(1)            // Última página disponible
  const [loadingPhotos, setLoadingPhotos] = useState(false) // Cargando fotos
  const [loadingMore, setLoadingMore] = useState(false)  // Cargando más fotos (infinite scroll)
  const loaderRef = useRef(null)                         // Referencia para el observer de infinite scroll
  const uuidRef = useRef(null)                           // Referencia mutable del UUID
  const [printerUuid, setPrinterUuid] = useState(null)   // UUID del evento de impresión
  const lastPrinterCodeRef = useRef(null)
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
  const [squareCard, setSquareCard] = useState(null)     // Objeto Square card
  const [squareError, setSquareError] = useState('')     // Error de Square
  const [squareLoading, setSquareLoading] = useState(false) // Pago Square en progreso
  const [paypalClientId, setPaypalClientId] = useState('') // PayPal client ID devuelto por backend
  const [paypalReady, setPaypalReady] = useState(false)  // PayPal SDK y botones listos
  const [paypalError, setPaypalError] = useState('')    // Error de PayPal
  const [paypalLoading, setPaypalLoading] = useState(false) // Pago PayPal en progreso
  const paypalButtonsRef = useRef(null)                  // Referencia a PayPal Buttons

  const applyTextos = (incoming) => {
    if (!incoming) return
    setTextos(prev => ({
      precio1: (incoming.precio1 && incoming.precio1.trim()) || (prev?.precio1 && prev.precio1.trim()) || '5',
      precio2: (incoming.precio2 && incoming.precio2.trim()) || (prev?.precio2 && prev.precio2.trim()) || '9',
      precio3: (incoming.precio3 && incoming.precio3.trim()) || (prev?.precio3 && prev.precio3.trim()) || '12',
      text_es: incoming.text_es || prev?.text_es || '',
      text_en: incoming.text_en || prev?.text_en || '',
      text_fr: incoming.text_fr || prev?.text_fr || '',
      text_de: incoming.text_de || prev?.text_de || '',
      empresa: incoming.empresa || prev?.empresa || ''
    }))
  }

  const loadPrinterEvent = useCallback(async (eventCodePrinter) => {
    if (!eventCodePrinter || eventCodePrinter.trim() === '') {
      setPrinterUuid(null)
      return
    }
    try {
      // findEvent espera formato "ev-XXXX"
      const printerUuidResult = await findEvent(`ev-${eventCodePrinter}`)
      setPrinterUuid(printerUuidResult)
      console.log(`Evento impresora cargado: ${eventCodePrinter} -> ${printerUuidResult}`)
    } catch (e) {
      console.error('Error cargando evento impresora:', e)
      setPrinterUuid(null)
    }
  }, [])

  // ============================================
  // FUNCIÓN PARA OBTENER URL DE IMAGEN CON PROXY
  // ============================================
  const getImageUrl = (url) => {
    if (!url) return ''

    // Siempre usar proxy en ambos entornos
    // IMPORTANTE: Si la URL ya contiene /proxy-image, no duplicarlo
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
  // FUNCIONES DE LOCALSTORAGE
  // ============================================

  const saveToLocalStorage = () => {
    const data = {
      eventCode,
      step,
      selected,
      capturedPhotos,
      uuid,
      page,
      lastPage,
      photos, // Guardar también las fotos de la galería
      textos,
    }
    localStorage.setItem('printbox_mobile_state', JSON.stringify(data))
  }

  const loadFromLocalStorage = () => {
    const data = localStorage.getItem('printbox_mobile_state')
    if (data) {
      try {
        const parsed = JSON.parse(data)
        setEventCode(parsed.eventCode || '')
        setStep(parsed.step || STEP_EVENT)
        setSelected(parsed.selected || [])
        setCapturedPhotos(parsed.capturedPhotos || [])
        setUuid(parsed.uuid || null)
        setPage(parsed.page || 1)
        setLastPage(parsed.lastPage || 1)
        setPhotos(parsed.photos || [])  // Restaurar fotos de la galería
        if (parsed.textos) {
          setTextos(parsed.textos)
        }
        return parsed
      } catch (e) {
        console.error('Error loading from localStorage:', e)
      }
    }
    return null
  }

  // ============================================

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
   * Cargar estado desde localStorage y procesar URL
   */
  useEffect(() => {
    // Leer evento de la URL PRIMERO (ahora con BrowserRouter es window.location.search)
    const params = new URLSearchParams(window.location.search)
    const ev = params.get('evento')

    if (ev) {
      // QR: NO cargar del localStorage, empezar limpio
      const code = ev.replace('ev-', '')
      setEventCode(code)
      setLoadingFromQR(true)
      // Auto-conectar si viene de QR
      setTimeout(() => handleConnectEvent(code), 100)
    } else {
      // No viene de QR: cargar desde localStorage
      const saved = loadFromLocalStorage()

      if (saved && saved.eventCode && saved.step !== STEP_EVENT) {
        if (saved.photos && saved.photos.length > 0) {
          // Ya tenemos fotos en localStorage, no forzar recarga inmediata
          const normalizedStep = saved.step === 'otp' ? STEP_GALLERY : saved.step
          setStep(normalizedStep || STEP_GALLERY)
          setUuid(saved.uuid || null)
          setLoadingFromQR(false)
        } else {
          // Si no hay fotos guardadas, reconectar para cargar
          setTimeout(() => handleConnectEvent(saved.eventCode), 100)
        }
      }
    }

    // Cargar config global al iniciar solo si no hay eventCode guardado
    // (para mostrar textos por defecto mientras el usuario ingresa el código)
    const saved = loadFromLocalStorage()
    if (!saved || !saved.eventCode) {
      getConfig().then(d => {
        if (d.textos) applyTextos(d.textos)
      }).catch(() => { })
    }
  }, [])

  // Refrescar precios del config cada 5 segundos (sincronización con admin)
  // Si hay eventCode, cargar precios específicos de ese evento
  // Si no, cargar config global
  useEffect(() => {
    const interval = setInterval(() => {
      getConfig(eventCode || undefined).then(d => {
        if (d.textos) applyTextos(d.textos)
        // Cargar evento_printer solo si el código cambió
        if (d.config?.evento_printer) {
          const printerCode = d.config.evento_printer.replace(/^ev[-_]?/i, '')
          if (printerCode && printerCode !== lastPrinterCodeRef.current) {
            lastPrinterCodeRef.current = printerCode
            loadPrinterEvent(printerCode)
          }
        } else {
          if (lastPrinterCodeRef.current !== null) {
            lastPrinterCodeRef.current = null
            setPrinterUuid(null)
          }
        }
      }).catch(() => { })
    }, 5000)
    return () => clearInterval(interval)
  }, [eventCode, loadPrinterEvent])

  // Inicializar pasarela de pago en el paso de pedido
  useEffect(() => {
    if (step !== STEP_ORDER) return

    const initSquare = async () => {
      if (!window.Square) {
        setSquareError('Pasarela de pago no cargada')
        return
      }

      try {
        const payments = window.Square.payments(SQUARE_APP_ID, SQUARE_LOCATION_ID)

        // Inicializar tarjeta (siempre)
        try {
          const card = await payments.card()
          await card.attach('#card-container')
          setSquareCard(card)
          console.log('Tarjeta inicializada')
        } catch (e) {
          console.error('Error tarjeta:', e.message)
        }

        setSquareError('')
      } catch (e) {
        setSquareError(e.message || 'Error inicializando pasarela de pago')
      }
    }

    initSquare()
  }, [step])

  useEffect(() => {
    if (step !== STEP_ORDER) return

    let cancelled = false

    const loadPayPalScript = (clientId) => {
      return new Promise((resolve, reject) => {
        if (window.paypal) {
          resolve(window.paypal)
          return
        }

        const existingScript = document.querySelector('script[data-paypal-sdk]')
        if (existingScript) {
          existingScript.addEventListener('load', () => resolve(window.paypal))
          existingScript.addEventListener('error', () => reject(new Error('Error cargando PayPal')))
          return
        }

        const script = document.createElement('script')
        script.setAttribute('data-paypal-sdk', 'true')
        script.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(clientId)}&currency=EUR&intent=capture`
        script.async = true
        script.onload = () => {
          if (window.paypal) resolve(window.paypal)
          else reject(new Error('PayPal SDK no disponible'))
        }
        script.onerror = () => reject(new Error('Error cargando PayPal SDK'))
        document.body.appendChild(script)
      })
    }

    const initPayPal = async () => {
      setPaypalError('')
      setPaypalReady(false)
      try {
        const config = await getPayPalConfig()
        if (cancelled) return

        if (!config.clientId) {
          throw new Error('PayPal no está configurado en el servidor')
        }

        setPaypalClientId(config.clientId)

        const paypal = await loadPayPalScript(config.clientId)
        if (cancelled) return

        if (!paypal.Buttons) {
          throw new Error('PayPal Buttons no disponible')
        }

        const buttons = paypal.Buttons({
          style: { layout: 'vertical', color: 'gold', shape: 'rect', label: 'paypal' },
          createOrder: async () => {
            const amount = totalPrice()
            return await createPayPalOrder({ amount, currency: 'EUR' })
          },
          onApprove: async (data) => {
            console.log('PayPal onApprove triggered:', data)
            setPaypalLoading(true)
            try {
              console.log('Capturing PayPal order:', data.orderID)
              await capturePayPalOrder(data.orderID)
              console.log('PayPal order captured successfully')
              showToast('Pago PayPal completado')

              // Intentar enviar fotos después del pago, pero NO bloquear si falla
              try {
                console.log('Sending order photos...')
                await sendOrderPhotos()
                console.log('Photos sent successfully')
              } catch (photoError) {
                console.error('Error enviando fotos (pero pago PayPal fue exitoso):', photoError)
                showToast('Pago completado. Las fotos se enviaran mas tarde.')
              }

              // Avanzar al paso de exito sea o no haya fallado el envio de fotos
              console.log('Setting step to SUCCESS')
              setStep(STEP_SUCCESS)
            } catch (error) {
              console.error('Error captura PayPal:', error)
              setPaypalError(error.message || 'Error capturando pago PayPal')
            } finally {
              setPaypalLoading(false)
            }
          },
          onError: (error) => {
            console.error('PayPal onError:', error)
            setPaypalError(error?.message || 'Error en PayPal')
          },
          onCancel: () => {
            console.log('PayPal onCancel: User cancelled payment')
            showToast('Pago PayPal cancelado')
          },
        })

        if (cancelled) return
        paypalButtonsRef.current = buttons

        const container = document.getElementById('paypal-button-container')
        if (!container) {
          throw new Error('Contenedor PayPal no encontrado')
        }

        await buttons.render('#paypal-button-container')
        if (cancelled) return

        setPaypalReady(true)
      } catch (e) {
        if (!cancelled) {
          setPaypalError(e.message || 'No se pudo inicializar PayPal')
          console.log('PayPal init:', e)
        }
      }
    }

    initPayPal()
    return () => { cancelled = true }
  }, [step])

  const handleSquarePayment = async () => {
    console.log('handleSquarePayment invocado')
    console.log('squareCard disponible?', !!squareCard)

    if (!squareCard) {
      setSquareError('Pasarela de pago no inicializada')
      return
    }
    setSquareLoading(true)
    try {
      const result = await squareCard.tokenize()
      if (result.status !== 'OK') {
        throw new Error(result.errors?.[0]?.message || 'Tokenización fallida')
      }

      const amountInCents = String(Math.round(parseFloat(totalPrice()) * 100))
      console.log('Enviando pago a Square:', { amount: amountInCents, currency: 'EUR', location_id: SQUARE_LOCATION_ID })

      const body = await processPayment({
        token: result.token,
        amount: amountInCents,
        currency: 'EUR',
        location_id: SQUARE_LOCATION_ID,
      })

      console.log('Respuesta de Square:', body)

      // Si los datos estan invalidos en Square pero se procesa de todas formas, notificar al usuario
      // pero continuar (porque BBVA puede haber procesar el pago)
      if (body?.errors) {
        console.error('Square devolvio errores:', body.errors)
        showToast('Pago procesado con advertencias, por favor revisa tu banco')
      }

      // Intentar enviar fotos después del pago, pero NO bloquear si falla
      try {
        await sendOrderPhotos()
      } catch (photoError) {
        console.error('Error enviando fotos (pero pago fue exitoso):', photoError)
        showToast('Pago completado. Las fotos se enviarán más tarde.')
      }

      // Avanzar al paso de éxito sea o no haya fallado el envío de fotos
      setStep(STEP_SUCCESS)
    } catch (e) {
      setSquareError(`Error Square: ${e.message}`)
    } finally {
      setSquareLoading(false)
    }
  }

  // Procesar pago desde Square
  const processSquarePayment = async (token, methodName) => {
    setSquareLoading(true)
    try {
      const amountInCents = String(Math.round(parseFloat(totalPrice()) * 100))
      console.log(`Enviando pago a Square (${methodName}):`, { amount: amountInCents, currency: 'EUR', location_id: SQUARE_LOCATION_ID })

      const body = await processPayment({
        token,
        amount: amountInCents,
        currency: 'EUR',
        location_id: SQUARE_LOCATION_ID,
      })

      console.log('Respuesta de Square:', body)

      if (body?.errors) {
        console.error('Square devolvio errores:', body.errors)
        showToast('Pago procesado con advertencias, por favor revisa tu banco')
      }

      try {
        await sendOrderPhotos()
      } catch (photoError) {
        console.error('Error enviando fotos:', photoError)
        showToast('Pago completado. Las fotos se enviarán más tarde.')
      }

      setStep(STEP_SUCCESS)
    } catch (e) {
      setSquareError(`Error en ${methodName}: ${e.message}`)
    } finally {
      setSquareLoading(false)
    }
  }

  /**
   * Refrescar precios cuando se conecta al evento o navega al paso ORDER
   */
  useEffect(() => {
    if (uuid || step === STEP_ORDER) {
      getConfig(eventCode).then(d => {
        if (d.textos) applyTextos(d.textos)
      }).catch(() => { })
    }
  }, [uuid, step, eventCode])

  /**
   * Guardar estado en localStorage cuando cambie
   */
  useEffect(() => {
    saveToLocalStorage()
  }, [eventCode, step, selected, capturedPhotos, uuid, page, lastPage, photos])

  // ============================================

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
  async function handleConnectEvent(code = null) {
    const eventCodeToUse = normalizeEventCode(code || eventCode)
    if (!eventCodeToUse) {
      setEventError('Introduce el número del evento')
      return
    }
    setLoading(true)
    setEventError('')
    try {
      const id = await findEvent(`ev-${eventCodeToUse}`)
      setUuid(id)
      uuidRef.current = id

      const configData = await getConfig(eventCodeToUse)
      if (configData.textos) applyTextos(configData.textos)
      // Cargar evento impresora si existe
      if (configData.config?.evento_printer) {
        const printerCode = configData.config.evento_printer.replace(/^ev[-_]?/i, '')
        if (printerCode) {
          await loadPrinterEvent(printerCode)
          lastPrinterCodeRef.current = printerCode
        }
      }

      // Recargar config para precios actualizados del evento específico
      try {
        const configData = await getConfig(eventCodeToUse)
        if (configData.textos) {
          setTextos(configData.textos)
        }
      } catch (err) {
        console.error('Error recargando config:', err)
      }

      // Intentar cargar fotos, pero no bloquear si falla
      try {
        await loadPhotos(id, 1)
      } catch (err) {
        console.error('Error cargando fotos:', err)
        // Continuar aunque no carguen fotos
        setPhotos([])
      }

      setStep(STEP_GALLERY)
      setLoadingFromQR(false)
    } catch (e) {
      console.error('Error conectando evento:', e)
      setEventError('Evento no encontrado. Verifica el código.')
      setLoadingFromQR(false)
    } finally {
      setLoading(false)
    }
  }

  // ============================================
  // PASO 2: GALERÍA - CARGAR FOTOS
  // ============================================

  /**
   * Cargar solo la página inicial de fotos (sin saturar)
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
    } catch (err) {
      console.error('[loadPhotos] Error:', err.message)
      showToast('Error cargando fotos')
      throw err  // Re-lanzar para que handleConnectEvent lo atrape
    } finally {
      setLoadingPhotos(false)
    }
  }

  /**
   * Cargar más fotos cuando el usuario llega al final (infinite scroll)
   */
  async function loadMorePhotos() {
    if (loadingMore || page >= lastPage) return
    setLoadingMore(true)
    try {
      const nextPage = page + 1
      const { photos: data } = await getEventPhotos(uuid, nextPage)
      setPhotos(prev => [...prev, ...data])
      setPage(nextPage)
    } catch {
      showToast('Error cargando más fotos')
    } finally {
      setLoadingMore(false)
    }
  }

  /**
   * Intersection Observer para infinite scroll
   */
  useEffect(() => {
    if (!loaderRef.current || step !== STEP_GALLERY) return

    const observer = new IntersectionObserver(
      entries => {
        if (entries[0].isIntersecting && !loadingMore && page < lastPage) {
          loadMorePhotos()
        }
      },
      { threshold: 0.1 }
    )

    observer.observe(loaderRef.current)
    return () => observer.disconnect()
  }, [page, lastPage, loadingMore, step])

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
    showToast('Foto capturada')
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
   * Remover una foto capturada
   * @param {number} id - ID único de la foto capturada
   */
  function removeCaptured(id) {
    setCapturedPhotos(prev => prev.filter(p => p.id !== id))
  }

  /**
   * Subir una foto directamente sin hacer pedido
   * @param {Object} photo - Foto capturada { dataUrl, copies, id }
   */
  async function uploadPhotoDirectly(photo) {
    setSending(true)
    try {
      const targetUuid = printerUuid || uuid
      if (!targetUuid) throw new Error('No hay evento destino')
      await sendPhoto({
        event: targetUuid,   // ← cambio
        image: photo.dataUrl,
        times: 1,
        name: `print_1_${photo.id}`,
        phone: '000000000',
        orientation: 'portrait'
      })
      showToast('Foto subida correctamente')
      removeCaptured(photo.id)
    } catch (e) {
      showToast(`Error: ${e.message}`)
    } finally {
      setSending(false)
    }
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
  async function sendOrderPhotos() {
    const targetUuid = printerUuid || uuid   // Usar evento impresora si existe, si no el principal
    if (!targetUuid) throw new Error('No hay evento destino')

    // Enviar fotos de la galería
    for (const photo of selected) {
      const proxyUrl = getImageUrl(photo.uri_full || photo.uri)
      const resp = await fetch(proxyUrl)
      const blob = await resp.blob()
      const base64 = await new Promise(res => {
        const reader = new FileReader()
        reader.onload = () => res(reader.result)
        reader.readAsDataURL(blob)
      })
      const resized = await resizeImageBase64(base64, 1400)
      await sendPhoto({
        event: targetUuid,
        image: resized,
        times: photo.copies,
        name: `print_${photo.copies}_${photo.id || 'gallery'}`,
        phone: '000000000',
        orientation: 'portrait'
      })
    }

    // Enviar fotos de cámara
    for (const photo of capturedPhotos) {
      await sendPhoto({
        event: targetUuid,
        image: photo.dataUrl,
        times: photo.copies,
        name: `print_${photo.copies}_${photo.id}`,
        phone: '000000000',
        orientation: 'portrait'
      })
    }
    return true
  }

  async function handleSendOrder() {
    if (totalCopies === 0) {
      showToast('No has seleccionado ninguna foto')
      return
    }
    setSending(true)
    try {
      await sendOrderPhotos()
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
   * Indicador visual de progreso (números)
   */
  const StepNumbers = () => (
    <div className="d-flex justify-content-center gap-2 py-2">
      {[STEP_GALLERY, STEP_CAMERA, STEP_ORDER].map((s, index) => (
        <div
          key={s}
          className={`step-number ${step === s ? 'active' : (
            [STEP_ORDER, STEP_SUCCESS].includes(step) && s !== STEP_ORDER ? 'done' :
              step === STEP_ORDER && s === STEP_CAMERA ? 'done' : ''
          )
            }`}
        >
          {index + 1}
        </div>
      ))}
    </div>
  )

  // Componente para mostrar StepNumbers solo en pasos específicos
  const renderStepNumbers = () => {
    return null
  }

  const procesarPago = async () => {
    // Método opcional, se usa handleSquarePayment() desde el formulario de pago.
    if (squareCard) {
      await handleSquarePayment()
    }
  }

  // ============================================
  // RENDER POR PASO
  // ============================================

  // --- PASO 1: EVENTO ---
  if (step === STEP_EVENT) {
    if (loadingFromQR) {
      return (
        <div className="mobile-app event-container">
          <img src="/assets/ic_launcher.png" alt="Logo" className="event-logo" />
          <h1 className="event-title">Printbox Adventure</h1>
          <p className="event-subtitle">Cargando evento...</p>
          <div className="d-flex justify-content-center">
            <span className="spinner-border text-warning" style={{ width: '3rem', height: '3rem' }} />
          </div>
          {toast && <div className="mobile-toast">{toast}</div>}
        </div>
      )
    }

    return (
      <div className="mobile-app event-container">
        <img src="/assets/ic_launcher.png" alt="Logo" className="event-logo" />
        <h1 className="event-title">Printbox Adventur</h1>
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
        <div className="mobile-header d-flex align-items-center gap-3 justify-content-between">
          <img src="/assets/ic_launcher.png" alt="Logo" className="mobile-header-ic-launcher-large" />
          <div className="flex-grow-1">
            <div className="mobile-header-title">
              <span style={{ fontSize: '1.2rem', marginRight: '6px' }}>🇪🇸</span> Elige tus fotos para imprimir<br />
              <small className="text-muted">
                <span style={{ fontSize: '1rem', marginRight: '6px' }}>🇬🇧</span> Choose your photos to print
              </small>
            </div>
          </div>
          <button
            className="btn btn-sm btn-outline-warning"
            title="Términos y condiciones"
            style={{ fontSize: '18px', padding: '2px 6px' }}
            onClick={() => setShowTermsModal(true)}
          >
            <i className="bi bi-info-circle" />
          </button>
        </div>

        {renderStepNumbers()}

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
                <img src={getImageUrl(photo.uri)} alt="" loading="lazy" draggable={false} onContextMenu={(e) => e.preventDefault()} onDragStart={(e) => e.preventDefault()} />
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

        {/* Modal de términos y condiciones */}
        {showTermsModal && (
          <div className="terms-modal-overlay" onClick={() => setShowTermsModal(false)}>
            <div className="terms-modal-content" onClick={(e) => e.stopPropagation()}>
              <div className="terms-modal-header">
                <h5>Términos y condiciones</h5>
                <button className="terms-modal-close" onClick={() => setShowTermsModal(false)}>&times;</button>
              </div>
              <div className="terms-modal-body">
                <p><strong>Tus fotos están protegidas.</strong> No almacenamos datos personales ni compartimos tus imágenes con terceros.</p>
                <p>Los pagos se procesan de forma segura a través de <strong>Square</strong> y <strong>PayPal</strong>. No guardamos información de tarjetas.</p>
                <p>Al usar este servicio, aceptas que las fotos seleccionadas se impriman en el evento. Puedes solicitar la eliminación de tus fotos en cualquier momento al operador.</p>
                <p><small>Para cualquier consulta, contacta con el organizador del evento.</small></p>
              </div>
              <div className="terms-modal-footer">
                <button className="btn btn-sm btn-secondary" onClick={() => setShowTermsModal(false)}>Cerrar</button>
              </div>
            </div>
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

        {renderStepNumbers()}

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
                    <img src={p.dataUrl} alt="" className="captured-thumb" draggable={false} onContextMenu={(e) => e.preventDefault()} onDragStart={(e) => e.preventDefault()} />
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
            <div className="d-flex gap-2 w-100" style={{ flexDirection: 'column' }}>
              <button
                className="btn btn-success fw-bold w-100 continue-button"
                onClick={async () => {
                  setSending(true)
                  try {
                    for (const photo of capturedPhotos) {
                      await sendPhoto({ event: uuid, image: photo.dataUrl, times: 1, name: `print_1_${photo.id}`, phone: '000000000', orientation: 'portrait' })
                    }
                    showToast(`${capturedPhotos.length} foto(s) subida(s)`)
                    setCapturedPhotos([])
                  } catch (e) {
                    showToast(`Error: ${e.message}`)
                  } finally {
                    setSending(false)
                  }
                }}
                disabled={sending}
              >
                {sending ? (
                  <><span className="spinner-border spinner-border-sm me-2" /> Subiendo...</>
                ) : (
                  <><i className="bi bi-cloud-upload me-2" /> Subir fotos directamente</>
                )}
              </button>

              <button
                className="btn btn-warning fw-bold w-100 continue-button"
                onClick={() => setStep(STEP_ORDER)}
                disabled={sending}
              >
                <i className="bi bi-bag-check me-2" />
                Hacer pedido ({capturedPhotos.length} foto{capturedPhotos.length > 1 ? 's' : ''})
              </button>
            </div>
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

        {renderStepNumbers()}

        <div className="order-summary-container">
          {/* Fotos de galería */}
          {selected.map((photo, i) => (
            <div key={i} className="order-photo-item">
              <img src={getImageUrl(photo.uri)} alt="" className="order-photo-thumb" draggable={false} onContextMenu={(e) => e.preventDefault()} onDragStart={(e) => e.preventDefault()} />
              <div className="order-photo-info">
                <div className="order-photo-label">Foto del evento</div>
                <div className="order-copies-selector">
                  <span className="order-copies-label">Copias:</span>
                  {[1, 2, 3].map(n => (
                    <button
                      key={n}
                      className={`btn btn-sm order-copies-btn ${photo.copies === n ? 'order-copies-btn-active' : 'order-copies-btn-inactive'
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
              <img src={photo.dataUrl} alt="" className="order-photo-thumb" draggable={false} onContextMenu={(e) => e.preventDefault()} onDragStart={(e) => e.preventDefault()} />
              <div className="order-photo-info">
                <div className="order-photo-label">Foto tomada</div>
                <div className="order-copies-selector">
                  <span className="order-copies-label">Copias:</span>
                  {[1, 2, 3].map(n => (
                    <button
                      key={n}
                      className={`btn btn-sm order-copies-btn ${photo.copies === n ? 'order-copies-btn-active' : 'order-copies-btn-inactive'
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

          {/* Métodos de Pago */}
          <div className="payment-methods-section">
            <h6 className="payment-title"><i className="bi bi-credit-card me-2"></i>Selecciona tu metodo de pago</h6>

            {/* PayPal */}
            <div className="payment-method-card paypal-card">
              <div className="payment-method-header">
                <div className="payment-method-icon">
                  <i className="bi bi-paypal"></i>
                </div>
                <div className="payment-method-info">
                  <div className="payment-method-name">PayPal</div>
                  <div className="payment-method-desc">Paga con tu cuenta PayPal o tarjeta</div>
                </div>
              </div>
              <div className="payment-method-content">
                {paypalError && <div className="text-danger text-center mb-2">{paypalError}</div>}
                <div id="paypal-button-container" style={{ minHeight: '70px' }} />
                {!paypalReady && !paypalError && (
                  <div className="text-center text-muted mb-2">Cargando PayPal...</div>
                )}
                {!paypalClientId && (
                  <div className="text-center text-muted mb-2">PayPal no configurado en el servidor.</div>
                )}
              </div>
            </div>

            {/* Tarjeta de Crédito */}
            <div className="payment-method-card card-payment-card">
              <div className="payment-method-header">
                <div className="payment-method-icon">
                  <i className="bi bi-credit-card"></i>
                </div>
                <div className="payment-method-info">
                  <div className="payment-method-name">Tarjeta de Crédito/Débito</div>
                  <div className="payment-method-desc">Visa, Mastercard, American Express</div>
                </div>
              </div>
              <div className="payment-method-content">
                <div id="card-container" style={{ minHeight: '170px' }}></div>
                {squareError && <div className="text-danger text-center mt-2">{squareError}</div>}
                <button
                  className="btn btn-warning w-100 mt-3 fw-bold payment-btn"
                  onClick={handleSquarePayment}
                  disabled={squareLoading || !squareCard || totalCopies === 0}
                >
                  {squareLoading ? 'Procesando pago...' : `Pagar ${totalPrice()}€`}
                </button>
              </div>
            </div>
          </div>

          <div className="alert alert-secondary order-payment-note">
            <i className="bi bi-credit-card text-warning" />
            Pago seguro con tarjeta de crédito o PayPal
          </div>
        </div>

        {/* Footer con botón de confirmación - DESHABILITADO POR AHORA */}
        {/* 
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
        */}

        {toast && <div className="mobile-toast">{toast}</div>}
      </div>
    )
  }

  // --- PASO 5: ÉXITO ---
  if (step === STEP_SUCCESS) {
    return (
      <div className="mobile-app success-container">
        <img src="/assets/logo-adventure.png" alt="Success" className="success-image" />
        <h2 className="success-title">¡Pedido enviado!</h2>
        <p className="success-text">
          Tu pedido ha sido enviado. Tus fotos se imprimirán en breve.
        </p>
        <p className="success-small-text">¡Gracias por tu compra!</p>

        <button
          className="btn btn-outline-warning back-button"
          onClick={() => {
            // Volver a galería del mismo evento (no a introducir código)
            setStep(STEP_GALLERY)
            setSelected([])
            setCapturedPhotos([])
            // Mantener eventCode y uuid para seguir en el mismo evento
          }}
        >
          <i className="bi bi-check-circle me-2" />
          Finalizar
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