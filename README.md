# PrintboxAdventures

Sistema de gestión de impresión de fotos para eventos. Migrado en 2026 de Python + tkinter a **React + Electron + Node.js Express**, con app web móvil incluida.

---

## Índice

1. [Descripción general](#1-descripción-general)
2. [Requisitos](#2-requisitos)
3. [Instalación y arranque](#3-instalación-y-arranque)
4. [Compilar instalador .exe](#4-compilar-instalador-exe)
4.1. [Despliegue automático con GitHub Actions](#41-despliegue-automático-con-github-actions)
5. [Estructura del proyecto](#5-estructura-del-proyecto)
6. [Cómo funciona la aplicación](#6-cómo-funciona-la-aplicación)
7. [App móvil web](#7-app-móvil-web)
8. [Archivos de configuración](#8-archivos-de-configuración)
9. [Assets / Imágenes](#9-assets--imágenes)
10. [Arquitectura técnica](#10-arquitectura-técnica)
11. [Flujo de datos completo](#11-flujo-de-datos-completo)
12. [Dependencias principales](#12-dependencias-principales)
13. [Mejoras implementadas](#13-mejoras-implementadas)
14. [Solución de problemas](#14-solución-de-problemas)
14.1. [Nuevas características (Marzo 2026)](#141-nuevas-características-marzo-2026)
15. [Pendientes / Ideas de mejora](#15-pendientes--ideas-de-mejora)

---

## 1. Descripción general

PrintboxAdventures se compone de **tres pantallas**:

| Pantalla | Ruta | Quién la usa |
|---|---|---|
| Panel de Control | `/#/printer` | Operador del evento |
| Visor de Evento | `/#/viewer` | Pantalla pública en el evento |
| App Móvil | `/#/mobile` | Cliente desde su móvil |

Se conecta a la API de Printbox en `https://gestion.printboxweb.com` (servidor Laravel).

---

## 2. Requisitos

### Para desarrollo
- Windows 10/11 x64
- Node.js v18 o superior → https://nodejs.org
- npm (incluido con Node.js)
- Una impresora instalada
- Conexión a internet

### Para el equipo destino (instalador .exe)
- Windows 10/11 x64
- **No necesita** Node.js ni nada de desarrollo
- Sí necesita impresora y conexión a internet

---

## 3. Instalación y arranque

### Primera vez
```bash
npm install
```

### Arrancar en desarrollo
```bash
npm run dev
```

Lanza 3 procesos:
- `[REACT]` — Vite dev server en `http://localhost:3000`
- `[BACKEND]` — Express en `http://localhost:4000`
- `[ELECTRON]` — Abre las ventanas de escritorio

### Verificar backend
```
http://localhost:4000/health  →  { "ok": true }
```

### Probar app móvil desde el móvil (mismo WiFi)
1. Añadir `host: true` en `vite.config.js` → `server: { port: 3000, host: true }`
2. Cambiar en `src/shared/api.js` → `'http://192.168.X.X:4000'` con la IP del PC
3. Abrir en el móvil → `http://192.168.X.X:3000/#/mobile`

> ⚠️ La cámara solo funciona en HTTPS (producción). En desarrollo local solo funciona la galería.

---

## 4. Compilar instalador .exe

### Preparación (solo la primera vez)
- Convertir `MoscaPrintbox.png` a `.ico` en https://convertio.co/png-ico/
- Guardar en `src/public/MoscaPrintbox.ico`

### Compilar
```bash
npm run build
```

### Resultado
```
dist-electron/
├── PrintboxAdventures Setup 1.0.0.exe   ← INSTALADOR
├── win-unpacked/
├── latest.yml
└── builder-effective-config.yaml
```

> Solo hace falta el `.exe` para distribuir.

### Primera ejecución en equipo nuevo
Crea automáticamente:
```
C:\Users\[usuario]\AppData\Local\PrintboxAdventures\
├── config\servidor_api.txt
├── config\textos.txt
├── descargas\
├── pdf\
└── PBAcount.txt
```

> ⚠️ Si hay versión anterior instalada, desinstalar primero desde "Agregar o quitar programas".

---

## 4.1. Despliegue automático con GitHub Actions

### Configuración inicial
1. Ir a tu repositorio en GitHub → **Settings** → **Secrets and variables** → **Actions**
2. Crear nuevo secreto llamado `GH_TOKEN` con tu token personal de GitHub
   > **⚠️ Importante**: Nunca incluyas tokens reales en el código o documentación

### Cómo funciona
- **Push a `main/master`**: Se ejecuta automáticamente el build y se crea un release draft
- **Publicar release**: Los archivos del instalador se suben como assets del release
- **Tag automático**: Se crea un tag con el número de versión (ej: `v1.0.6`)

### Archivos generados en cada release
- `PrintboxAdventures Setup X.X.X.exe` - Instalador para Windows
- `latest.yml` - Información de actualización automática
- `PrintboxAdventures-X.X.X-x64.nsis.7z` - Archivo comprimido

### Verificar workflow
Después de hacer push, ve a **Actions** en GitHub para ver el progreso del build.

---

## 5. Estructura del proyecto

```
printbox-adventures/
│
├── electron/
│   ├── main.js          Proceso principal — ventanas, splash, tray, quiosco
│   └── preload.js       Expone backend URL al renderer (contextBridge)
│
├── backend/
│   ├── server.js        Express (puerto 4000) — sirve frontend + API proxy
│   └── routes/
│       ├── printbox.js  Proxy → gestion.printboxweb.com (gestiona CSRF)
│       ├── print.js     Descarga → PDF → imprime
│       └── config.js    Lee/escribe config/*.txt
│
├── src/
│   ├── index.html       Bootstrap 5.3.8 CDN dark mode
│   ├── main.jsx         React Router — /printer /viewer /mobile
│   ├── public/
│   │   ├── favicon.png
│   │   ├── MoscaPrintbox.ico    (generar desde PNG para el .exe)
│   │   └── assets/
│   │       ├── banners-AdventureSup.png
│   │       ├── qr-code.png
│   │       └── MoscaPrintbox.png
│   ├── styles/global.css
│   ├── shared/
│   │   ├── api.js              Todas las llamadas HTTP centralizadas
│   │   └── hooks/useInterval.js
│   ├── viewer/
│   │   ├── ViewerApp.jsx
│   │   └── Viewer.css
│   ├── printer/
│   │   ├── PrinterApp.jsx
│   │   └── Printer.css
│   └── mobile/
│       ├── MobileApp.jsx
│       └── Mobile.css
│
├── config/
│   ├── servidor_api.txt
│   └── textos.txt
│
├── package.json
├── vite.config.js
└── README.md
```

---

## 6. Cómo funciona la aplicación

### 6.1 Panel de Control — `/#/printer`

1. Abrir la app → aparece el Panel de Control
2. **Editar** para configurar delay, timer, impresora y textos del Viewer
3. **▶ Encender** → introduce el código del evento (solo números, sin `ev-`)
4. El programa detecta fotos nuevas → descarga → PDF → imprime
5. Log en tiempo real con colores
6. **■ Apagar** al terminar

**Alertas automáticas:**
- 🔴 Barra roja si la impresora no se encuentra (comprueba cada 30s)
- 🟡 Barra amarilla si la API cae (reconecta automáticamente)

### 6.2 Visor de Evento — `/#/viewer`

1. Siempre pide el código de evento al arrancar
2. Galería responsive de fotos
3. Click en foto → modal con foto grande + selector de copias (1/2/3)
4. Confirmar → se imprime
5. Paginación automática

**Elementos:**
- Header: imagen banner fija 90px (textos pintados en la imagen)
- Footer Bootstrap: precios, empresa, contador, botón "Cambiar evento"

---

## 7. App móvil web

Accesible en `/#/mobile`. Pensada para que el cliente la use desde su móvil.

### Flujo del cliente

1. Escanea el QR o recibe la URL
2. Introduce el código del evento (o viene relleno desde `?evento=XXXX`)
3. Ve todas las fotos del evento
4. Toca fotos para seleccionarlas → aparece botón flotante amarillo
5. "Ver pedido" → elige copias por foto (1/2/3) y ve el precio
6. Confirma → el operador cobra con el datáfono Square
7. Las fotos se imprimen

### Precios
Se configuran en el **Panel de Control → Editar → precio1/precio2/precio3**.  
La app móvil los lee automáticamente.

- 1 copia de una foto = precio1
- 2 copias de una foto = precio2 (precio conjunto, no x2)
- 3 copias de una foto = precio3

### Cámara
Permite hacer fotos con la cámara del móvil y subirlas al evento.  
> ⚠️ Solo funciona en **HTTPS** (producción con dominio real).

### URL con QR
```
https://tudominio.com/#/mobile?evento=1668042
```
El código se rellena automáticamente al escanear.

---

## 8. Archivos de configuración

> **Desarrollo:** `config/` en la raíz del proyecto  
> **Producción:** `C:\Users\[usuario]\AppData\Local\PrintboxAdventures\config\`

### `config/servidor_api.txt`
```
servidor;https://gestion.printboxweb.com
evento;ev-1668042
timer;5
impresora;Adobe PDF
delay;5
```
> ⚠️ Orden exacto — no cambiar posición de líneas

### `config/textos.txt`
```
es:¡Consigue tu foto del evento!
en:Get your event photo!
fr:Obtenez votre photo!
de:Hol dir dein Foto!
precio1:5
precio2:9
precio3:12
empresa:PrintboxAdventures
```
> ⚠️ Orden exacto — no cambiar posición de líneas

---

## 9. Assets / Imágenes

| Archivo | Uso | Notas |
|---|---|---|
| `banners-AdventureSup.png` | Banner superior Viewer | 90px fijo, textos pintados en la imagen |
| `qr-code.png` | QR del header | Reemplazar con QR real del evento |
| `MoscaPrintbox.png` | Logo/mascota | También usado como favicon |
| `MoscaPrintbox.ico` | Icono del .exe | Generar desde el PNG en convertio.co |

Para reemplazar: sustituir el archivo con el mismo nombre → `npm run build`.

---

## 10. Arquitectura técnica

### Stack

| Capa | Tecnología |
|---|---|
| Frontend | React 18 + Vite 7 + Bootstrap 5.3.8 CDN dark mode |
| Backend | Node.js + Express 4 (puerto 4000) |
| Desktop | Electron 40 |
| Build | electron-builder 26 → NSIS installer |

### CORS
El renderer no puede llamar directamente a `gestion.printboxweb.com`.
```
React → localhost:4000/printbox/... → gestion.printboxweb.com
```

### CSRF (error 419)
Laravel protege sus POST con tokens CSRF. El backend visita `/sanctum/csrf-cookie`, guarda la cookie en un `CookieJar` (`tough-cookie` + `fetch-cookie`) y la envía en `X-XSRF-TOKEN`.

### Impresión física
1. Descarga imagen → `AppData\descargas\`
2. Detecta orientación con Sharp
3. Genera PDF A4 centrado con PDFKit → `AppData\pdf\`
4. Espera Delay segundos
5. Envía a impresora con pdf-to-printer (SumatraPDF embebido)
6. Incrementa contador en `PBAcount.txt`

### Carga del frontend
```
DEV:  Electron → loadURL('http://localhost:3000')  ← Vite
PROD: Electron → loadURL('http://localhost:4000')  ← Express sirve dist/
```
> `loadFile()` rompe las rutas `/assets/` — por eso se usa Express en producción.

### Datos en producción
```
DEV:  config/, descargas/, pdf/ en la raíz del proyecto
PROD: C:\Users\[usuario]\AppData\Local\PrintboxAdventures\
```

---

## 11. Flujo de datos completo

```
CONECTAR EVENTO
App → POST /printbox/find-event { code }
    → /api/v1/events/find → { uuid }

GALERÍA
App → POST /printbox/photos?page=N { event: uuid }
    → /api/v1/events/photos → { data: [...], last_page }

FOTOS A IMPRIMIR (polling del Printer)
App → POST /printbox/photos-to-print { event: uuid }
    → /api/v1/events/photos_two → { values: [...] }

SUBIR FOTO (app móvil)
App → POST /printbox/photo-send { event, image: base64, times }
    → /api/v1/events/photo/send → { success: true }

IMPRIMIR
App → POST /print/job { imageUrl, imageName, printer, delay }
    → descarga → PDF → imprime → { ok: true, count: N }

CONFIG
App → GET  /config  → lee servidor_api.txt + textos.txt
App → POST /config  → escribe servidor_api.txt + textos.txt
```

---

## 12. Dependencias principales

### Producción

| Paquete | Uso |
|---|---|
| `express` | Servidor web local |
| `cors` | Cabeceras CORS |
| `fs-extra` | Utilidades de ficheros |
| `node-fetch` | HTTP client (CommonJS) |
| `fetch-cookie` | Cookies en node-fetch (CSRF) |
| `tough-cookie` | CookieJar para sesión Laravel |
| `pdfkit` | Generación de PDFs |
| `sharp` | Orientación de imágenes |
| `pdf-to-printer` | Impresión física (SumatraPDF) |

### Desarrollo

| Paquete | Uso |
|---|---|
| `vite` + `@vitejs/plugin-react` | Compilador y dev server |
| `react` + `react-dom` | Framework UI |
| `react-router-dom` | HashRouter |
| `electron` | Shell de escritorio |
| `electron-builder` | Generador de .exe |
| `concurrently` | Lanza varios procesos |
| `wait-on` | Espera a que arranquen los servidores |

---

## 13. Mejoras implementadas

| Mejora | Archivo | Descripción |
|---|---|---|
| ✅ Modo quiosco | `electron/main.js` | Viewer en pantalla completa. `F11`/`Escape` para salir |
| ✅ Splash screen | `electron/main.js` | Logo + barra de progreso mientras arranca Express (2.5s) |
| ✅ Bandeja del sistema | `electron/main.js` | La X minimiza a tray. Menú contextual. `Ctrl+Q` para cerrar |
| ✅ Reconexión automática | `PrinterApp.jsx` | Si la API cae, reintenta cada 5s→10s→...→30s automáticamente |
| ✅ Alerta impresora offline | `PrinterApp.jsx` | Barra roja si la impresora no se encuentra. Comprueba cada 30s |
| ✅ App móvil web | `mobile/MobileApp.jsx` | Galería completa, cámara, selección, pedido y precios |
| ✅ Auto-actualización | `electron/main.js` | Comprueba GitHub Releases al arrancar. Barra amarilla de aviso + instala al cerrar |
| ✅ Proxy de imágenes | `viewer/ViewerApp.jsx`, `mobile/MobileApp.jsx` | Convierte URLs de imágenes a rutas relativas para evitar CORS |
| ✅ QR código evento | `viewer/ViewerApp.jsx` | Botón para mostrar QR → escanear acceso directo a app móvil (Marzo 2026) |
| ✅ Autoplay viewer | `viewer/ViewerApp.jsx` | Botón para cambiar de página automáticamente cada 5 segundos (Marzo 2026) |
| ✅ Botones con fondo | `viewer/ViewerApp.jsx` | QR y Autoplay con `bg-dark border-*` para mejor visibilidad (Marzo 2026) |
| ✅ Envío fotos móvil directo | `mobile/MobileApp.jsx` | Fotos tomadas con cámara se envían sin costo adicional (Marzo 2026) |
| ✅ Paginación mobile | `mobile/MobileApp.jsx` | Infinite scroll en galería para evitar saturación del proxy (Marzo 2026) |
| ✅ Paginación viewer client-side | `viewer/ViewerApp.jsx` | 10 fotos por página (2 filas × 5 columnas), carga inicial completa (Marzo 2026) |
| ✅ Grid layouts optimizados | `viewer/Viewer.css`, `mobile/Mobile.css` | Viewer: 5 columnas, Mobile: 3 columnas para mejor visualización (Marzo 2026) |
| ✅ Prevención descarga imágenes | `viewer/ViewerApp.jsx`, `mobile/MobileApp.jsx` | Bloquea click derecho, drag-drop y descarga en todas las imágenes (Marzo 2026) |
| ✅ Prevención capturas pantalla | `electron/main.js`, `mobile/Mobile.css` | Bloquea Print Screen en Electron + desactiva selección en web (Marzo 2026) |
| ✅ Persistencia localStorage | `mobile/MobileApp.jsx` | Guarda selecciones y pedido entre recargas de página (Marzo 2026) |
| ✅ Entrada automática QR | `mobile/MobileApp.jsx` | No muestra modal de entrada, va directamente a galería desde QR (Marzo 2026) |
| ✅ Pantalla carga QR | `mobile/MobileApp.jsx` | "Cargando evento..." amigable al acceder vía QR (Marzo 2026) |
| ✅ Flujo simplificado mobile | `mobile/MobileApp.jsx` | Botón editar removido, sin "Hacer foto nueva", texto bilingüe (Marzo 2026) |
| ✅ Pago mobile actualizado | `mobile/MobileApp.jsx` | Cambio de "datáfono" a "tarjeta, Google Pay, etc." (Marzo 2026) |

---

## 14. Solución de problemas

**`EPERM mkdir C:\Program Files\...`**  
Versión antigua. Desinstalar desde "Agregar o quitar programas" y reinstalar.

**`failed to fetch` en desarrollo**  
Verificar `http://localhost:4000/health`. Usar siempre `npm run dev`.

**Error 419 (CSRF)**  
Reiniciar el backend. El CookieJar lo resuelve automáticamente.

**Viewer sin fotos**  
Verificar código de evento (solo números, sin `ev-`). Comprobar log del Printer.

**No imprime**  
Nombre de impresora exactamente igual al de Windows. Dejar vacío para predeterminada.

**Las fotos se reimprimen al reiniciar**  
No vaciar `AppData\Local\PrintboxAdventures\descargas\` hasta fin del evento.

**Banner superior crece con la pantalla**  
Verificar en `Viewer.css`:
```css
.viewer-app > header { height: 90px !important; overflow: hidden !important; }
```

**Cámara no funciona en móvil**  
Solo funciona en HTTPS. En desarrollo local solo funciona la galería.

**App móvil "evento no encontrado" desde móvil**  
La IP en `src/shared/api.js` debe ser la IP del PC, no `localhost`. Solo para desarrollo.

---

## 14.1. ✨ Nuevas características (Marzo 2026)

### � Mejoras UI/UX

#### Botones con Fondo en Viewer
- **QR y Autoplay:** Ahora tienen fondo oscuro con borde de color para mejor visibilidad
- Estilos: `bg-dark border-success` y `bg-dark border-info`

#### Texto Bilingüe en Mobile
- Header de galería muestra: **🇪🇸 Elige tus fotos para imprimir • Choose your photos to print 🇺🇸**
- Código de evento en subtítulo separado: **`ev-{eventCode}`**
- Layout más limpio y organizado

#### Cambios en el Flujo Mobile
- ✅ **Botón de editar removido** — Una vez dentro del evento, no se puede cambiar
- ✅ **Sin botón "Hacer foto nueva"** — La cámara solo funciona en orden/pedido
- ✅ **Entrada automática desde QR** — No muestra modal de entrada, va directamente a galería
- ✅ **Pantalla de carga amigable** — "Cargando evento..." con spinner cuando accede vía QR

#### Cambios en el Pago
- **Nuevo texto:** "El pago se realizará con tarjeta, Google Pay, etc. desde el móvil"
- Reemplaza el obsoleto: "El operador se acercará con el datáfono"
- Aparece en la pantalla de resumen del pedido y en la de éxito

#### Cambio Viewer
- **Título modal evento:** "Introduce el código de evento" (más claro que "¿Cuál es el evento?")

---

### 🔒 Seguridad & Privacidad

#### Prevención de Descarga de Imágenes
- `onContextMenu={(e) => e.preventDefault()}` en todas las imágenes
- `onDragStart={(e) => e.preventDefault()}` para bloquear drag
- `draggable={false}` en elementos img
- Aplicado a:
  - Galería móvil
  - Miniaturas de fotos capturadas
  - Modal de impresión en Viewer
  - Resumen de pedido

**Archivos modificados:**
- `src/viewer/ViewerApp.jsx` — Componente `PhotoCard`, modal de impresión
- `src/mobile/MobileApp.jsx` — Galería, cámara, resumen de orden

#### Prevención de Capturas de Pantalla
- **Electron:** Bloquea Print Screen con `globalShortcut`
  - `PrintScreen`, `Alt+PrintScreen`, `Ctrl+PrintScreen`
  - Se limpian al cerrar la app
  - Archivo: `electron/main.js`

- **Web (Mobile):** Desactiva selección de texto
  - `user-select: none`
  - `-webkit-touch-callout: none`
  - Archivo: `src/mobile/Mobile.css`

> ⚠️ En navegadores móviles, los atajos de SO (vol+ power, etc.) **no se pueden bloquear**. Esto requeriría app nativa.

---

### 💾 Persistencia en LocalStorage

#### Guardado Automático
El estado del móvil se guarda automáticamente en `localStorage`:
- Código de evento
- Fotos seleccionadas (galerías)
- Fotos capturadas con cámara
- Número de copias por foto
- Paso/página actual

#### Restauración al Recargar
Si el usuario:
1. **Recarga la página** (`F5`/`Ctrl+R`) → Se restaura el estado anterior
2. **Cierra y abre el navegador** → Vuelve a la galería con sus selecciones
3. **Viene de QR** → Va directamente a la galería (sin necesidad de re-entrar evento)

**Implementación:**
```javascript
// En MobileApp.jsx
const saveToLocalStorage = () => {
  const data = { eventCode, step, selected, capturedPhotos, uuid, ... }
  localStorage.setItem('printbox_mobile_state', JSON.stringify(data))
}

const loadFromLocalStorage = () => {
  const data = localStorage.getItem('printbox_mobile_state')
  return JSON.parse(data) // Restaura todos los estados
}

// Se ejecuta en useEffect al montar y cada vez que algo cambia
useEffect(() => {
  saveToLocalStorage()
}, [eventCode, step, selected, capturedPhotos, uuid, page, lastPage])
```

**Archivos modificados:**
- `src/mobile/MobileApp.jsx` (líneas ~140-170)

---

### 🎥 Fotos de cámara en móvil - Sin costo

Cuando el usuario toma fotos con la cámara del móvil desde `/#/mobile`, éstas:
- **Se envían directamente** al servidor sin necesidad de pago
- Se combinan con fotos de la galería en el mismo pedido
- Si hay fotos de cámara solas, se imprimen sin costo adicional
- Las fotos se capturan en **alta resolución** (redimensionadas a 1400px)

**Flujo:**
```
1. Móvil → Toma foto
2. Foto se almacena en estado local
3. Usuario ve miniatura (puede eliminar)
4. Al confirmar pedido → Envía foto automáticamente
5. Servidor imprime sin pasar por carrito de compra
```

---

### 📱 QR código de evento (Viewer)

El **Panel de Control (Viewer)** ahora incluye:
- **Botón "Mostrar QR"** en el header con fondo
- Genera un QR con la URL completa: `printbox.incomar.net/#/mobile?evento=ev-XXXXXX`
- Los clientes **escanean con su móvil** y acceden directamente sin escribir código
- QR se muestra en modal emergente

**Uso:**
```
Operador → Botón "Mostrar QR" → Proyecta pantalla
Cliente → Escanea QR con móvil → App abre automáticamente
```

---

### ▶️ Autoplay en Viewer

Para un **efecto de diaporama/carrusel**:
- **Botón "Autoplay ON/OFF"** en el header del Viewer con fondo
- Cuando está activado → cambia de página cada **5 segundos**
- Cicla automáticamente: página 1 → 2 → 3 → ... → última → vuelve a 1
- Perfecto para proyectar fotos en pantalla grande

**Uso:**
```
Operador → Botón "Autoplay ON"
Viewer cambia de página automáticamente
Operador → Botón "Autoplay OFF" para parar
```

**Configuración:**
- Intervalo: **5 segundos** (editable en código: `useInterval` de ViewerApp.jsx)
- Se pausa si el operador hace click manual en paginación

---

### 💳 Google Pay (Pendiente - Q2 2026)

**Estado:** Documentado para implementación futura.

Planificado para el **flujo de pago**:
1. Usuario selecciona fotos (galería + cámara)
2. App muestra total
3. Botón **"Pagar con Google Pay"**
4. Se abre billetera digital
5. Se confirma pago
6. Impresión sin operador

**Requisitos:**
- [Google Pay Web API](https://developers.google.com/pay/api/web)
- Integración con procesador de pagos (Stripe, Square, etc.)
- HTTPS obligatorio
- Mobile-only

**Notas técnicas:**
```javascript
// Pseudocódigo (aún no implementado)
const payWithGooglePay = async (amount) => {
  const paymentRequest = {
    apiVersion: 2,
    apiVersionMinor: 0,
    allowedPaymentMethods: [...],
    transactionInfo: { totalPriceStatus: 'FINAL', totalPrice: amount },
  }
  const paymentsClient = new window.google.payments.api.PaymentsClient()
  const response = await paymentsClient.loadPaymentData(paymentRequest)
  await sendPhoto({ event: uuid, image, times, paymentToken: response.paymentMethodData })
}
```

---

### 🔧 Corrección de URLs de imágenes (CORS fix)

**Problema:**  
Las imágenes de `https://gestion.printboxweb.com` no cargaban en ViewerApp y MobileApp. El método antiguo (`.replace('gestion.printboxweb.com', '/proxy-image')`) generaba rutas inválidas como `http://proxy-image/...`.

**Solución implementada (Marzo 2026):**  
Se reemplazó el método simple de encuentra-y-reemplaza con una función robusta que:

1. **ViewerApp.jsx** - Nueva función `fixImageUrl()`:
```javascript
function fixImageUrl(url) {
  if (!url) return ''
  try {
    const parsed = new URL(url)
    return '/proxy-image' + parsed.pathname
  } catch {
    return url
  }
}
```

2. **MobileApp.jsx** - Actualización de `getImageUrl()`:
```javascript
const getImageUrl = (url) => {
  if (!url) return ''
  try {
    const parsed = new URL(url)
    return '/proxy-image' + parsed.pathname
  } catch {
    return url
  }
}
```

**Resultado:**
- ✅ Las imágenes se cargan correctamente vía proxy en Viewer
- ✅ La galería y captura de cámara funciona en app móvil
- ✅ Sin errores CORS
- ✅ Compatible con URLs absolutas, relativas y malformadas

**Archivos modificados:**
- `src/viewer/ViewerApp.jsx` (línea 10-20)
- `src/mobile/MobileApp.jsx` (línea 75-85)


---

## 15. Pendientes / Ideas de mejora

### Funcionales
- [ ] Versión visible en la app (header del Printer)
- [ ] Notificación toast al imprimir
- [ ] Sonido de confirmación al imprimir
- [ ] Pago integrado (Google Pay, Stripe, etc.)

### Viewer
- [x] QR dinámico con código de evento en la URL ✅ Marzo 2026
- [x] Autoplay / slideshow automático ✅ Marzo 2026

### Printer
- [ ] Historial de impresiones con miniatura y hora
- [ ] Reimprimir última foto con un click
- [ ] Estadísticas del evento (fotos impresas, ingresos estimados)

### App móvil
- [x] Deshabilitación de editar evento ✅ Marzo 2026
- [x] Persistencia en localStorage ✅ Marzo 2026
- [x] Entrada automática desde QR ✅ Marzo 2026
- [x] Prevención de descarga de imágenes ✅ Marzo 2026
- [x] Texto bilingüe (español/inglés) ✅ Marzo 2026
- [ ] Despliegue en IONOS con HTTPS (necesario para la cámara)
- [ ] PWA manifest para instalar en pantalla de inicio

### Técnicas
- [x] Auto-actualización (electron-updater) — GitHub Releases
- [x] Bloqueo de capturas de pantalla (Electron) ✅ Marzo 2026
- [x] Prevención de capturas en web (CSS) ✅ Marzo 2026
- [ ] Log de errores en disco

---

## 16. Publicar actualizaciones

Las actualizaciones se publican en **GitHub Releases** y los usuarios las reciben automáticamente al arrancar la app.

### Pasos para publicar una versión nueva

1. Incrementa la versión en `package.json`:
```json
"version": "1.0.1"
```

2. Haz commit y push:
```bash
git add .
git commit -m "feat: descripción de los cambios"
git push
```

3. Genera el token en https://github.com/settings/tokens (scope: `repo`) y ejecuta:
```powershell
$env:GH_TOKEN="tu_token_aqui"
npm run build
```

4. Ve a https://github.com/iaincomar/printbox-adventures/releases y pulsa **"Publish release"** en el borrador.

### Qué ven los usuarios
- Al arrancar la app comprueba automáticamente si hay versión nueva en GitHub
- Si la hay → barra amarilla en el Panel de Control: *"Hay una actualización disponible"*
- La descarga en segundo plano
- Al cerrar la app instala la nueva versión sola
- Botón "Instalar ahora" para no esperar al cierre

---

## Contacto API Printbox

**Email:** eventos@printboxweb.com · **Teléfono:** 623 040 445

---

*PrintboxAdventures v1.0.0 · Desarrollado por Alejandro · 2026*