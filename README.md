# PrintboxAdventures

Sistema de gestión de impresión de fotos para eventos. Migrado en 2026 de Python + tkinter a **React + Electron + Node.js Express**, con app web móvil incluida.

---

## Índice

1. [Descripción general](#1-descripción-general)
2. [Requisitos](#2-requisitos)
3. [Instalación y arranque](#3-instalación-y-arranque)
4. [Compilar instalador .exe](#4-compilar-instalador-exe)
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

## 15. Pendientes / Ideas de mejora

### Funcionales
- [ ] Versión visible en la app (header del Printer)
- [ ] Notificación toast al imprimir
- [ ] Sonido de confirmación al imprimir

### Viewer
- [ ] Autoplay / slideshow automático
- [ ] QR dinámico con código de evento en la URL

### Printer
- [ ] Historial de impresiones con miniatura y hora
- [ ] Reimprimir última foto con un click
- [ ] Estadísticas del evento (fotos impresas, ingresos estimados)

### App móvil
- [ ] Despliegue en IONOS con HTTPS (necesario para la cámara)
- [ ] QR dinámico que incluya el código del evento
- [ ] PWA manifest para instalar en pantalla de inicio

### Técnicas
- [ ] Auto-actualización (electron-updater)
- [ ] Log de errores en disco

---

## Contacto API Printbox

**Email:** eventos@printboxweb.com · **Teléfono:** 623 040 445

---

*PrintboxAdventures v1.0.0 · Desarrollado por Alejandro · 2026*