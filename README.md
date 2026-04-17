# PrintboxAdventures

Sistema de gestión de impresión de fotos para eventos. Migrado en 2026 de Python + tkinter a **React + Electron + Node.js Express**, con app web móvil incluida.

**Versión actual:** 1.0.7 (Abril 2026)

---

## Índice

1. [Descripción general](#1-descripci%C3%B3n-general)
2. [Requisitos](#2-requisitos)
3. [Instalación y arranque](#3-instalaci%C3%B3n-y-arranque)
4. [Compilar instalador .exe](#4-compilar-instalador-exe)
4.1. [Despliegue automático con GitHub Actions](#41-despliegue-autom%C3%A1tico-con-github-actions)
5. [Estructura del proyecto](#5-estructura-del-proyecto)
6. [Cómo funciona la aplicación](#6-c%C3%B3mo-funciona-la-aplicaci%C3%B3n)
7. [App móvil web](#7-app-m%C3%B3vil-web)
8. [Archivos de configuración](#8-archivos-de-configuraci%C3%B3n)
9. [Assets / Imágenes](#9-assets--im%C3%A1genes)
10. [Arquitectura técnica](#10-arquitectura-t%C3%A9cnica)
11. [Flujo de datos completo](#11-flujo-de-datos-completo)
12. [Dependencias principales](#12-dependencias-principales)
13. [Mejoras implementadas](#13-mejoras-implementadas)
14. [Solución de problemas](#14-soluci%C3%B3n-de-problemas)
14.1. [Nuevas características (Marzo 2026)](#141-nuevas-caracter%C3%ADsticas-marzo-2026)
15. [Pendientes / Ideas de mejora](#15-pendientes--ideas-de-mejora)

---

## 1. Descripción general

PrintboxAdventures se compone de **dos interfaces públicas en web** y **una app de escritorio**:

### Interfaces web (públicas)

| Pantalla | Ruta | Uso |
| --- | --- | --- |
| Visor de Evento | `/viewer` | Proyección de fotos en pantalla pública del evento |
| App Móvil | `/mobile` | Cliente escanea QR desde su móvil para ver/comprar fotos |

### App de escritorio (Electron)

| Aplicación | Acceso | Uso |
| --- | --- | --- |
| Panel de Control | Solo Electron | Operador del evento (sin acceso web) |

Se conecta a la API de Printbox en `https://gestion.printboxweb.com` (servidor Laravel).

> ⚠️ **Nota:** El Panel de Control (`/printer`) es **solo accesible desde la app de Electron**, no desde navegador web.

---

## 2. Requisitos

### Para desarrollo

- Windows 10/11 x64
- Node.js v18 o superior → <https://nodejs.org>
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

### Verificar backend en desarrollo y producción
```
Desarrollo:  http://localhost:4000/health  →  { "ok": true }
Producción:  https://printbox.incomar.net/health  →  { "ok": true }
```

### Probar app móvil desde el móvil en desarrollo (mismo WiFi)
1. Descubrir tu IP local: `ipconfig` (Windows) → busca `IPv4 Address: 192.168.X.X`
2. Cambiar en `src/shared/api.js` → `const BACKEND_URL = 'http://192.168.X.X:4000'`
3. Abrir desde móvil → `http://192.168.X.X:3000/#/mobile`

> ⚠️ La cámara del móvil solo funciona en **HTTPS** (producción en https://printbox.incomar.net). En desarrollo local solo funciona la galería.

---

## 4. Compilar instalador .exe

### Preparación (solo la primera vez)
- Convertir `ic_launcher.png` a `.ico` en https://convertio.co/png-ico/ (o usar `src/public/assets/ic_launcher.ico` existente)
- Guardar en `src/public/assets/ic_launcher.ico`

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

## 4.2. Despliegue web en IONOS (Apache)

La versión web está desplegada en **https://printbox.incomar.net** usando Apache compartido de IONOS.
Como IONOS no permite Node.js, el backend Express se reemplaza con un **proxy PHP**.

### Archivos necesarios en IONOS (raíz del subdominio)

```
/  (raíz de printbox.incomar.net)
├── index.html          ← del dist/
├── assets/             ← del dist/
├── proxy.php           ← reemplaza el backend Express
├── .htaccess           ← enruta las llamadas API al proxy
└── config/             ← carpeta con permisos de escritura (chmod 755)
    ├── servidor_api.txt
    └── textos.txt
```

### Pasos para actualizar la web

1. Hacer el build:
```bash
npm run build
```

2. Subir via FTP a la raíz del subdominio:
   - Todo el contenido de `dist/`
   - `proxy.php`
   - `.htaccess`
   - Carpeta `config/` (solo si no existe ya)

> ⚠️ No sobreescribir `config/` si ya tiene datos configurados.

### `.htaccess`

```apache
Options -MultiViews
RewriteEngine On
RewriteBase /

RewriteRule ^health$           proxy.php [L,QSA]
RewriteRule ^config/?$         proxy.php [L,QSA]
RewriteRule ^print/.*$         proxy.php [L,QSA]
RewriteRule ^printbox/.*$      proxy.php [L,QSA]
RewriteRule ^proxy-image/.*$   proxy.php [L,QSA]

RewriteCond %{REQUEST_FILENAME} !-f
RewriteCond %{REQUEST_FILENAME} !-d
RewriteRule ^ index.html [L]
```

### `proxy.php`

El `proxy.php` reemplaza completamente el backend Express en producción web:
- Gestiona CSRF automáticamente (CookieJar en PHP)
- Proxea todas las llamadas a `gestion.printboxweb.com` usando HTTPS
- Lee/escribe los archivos de configuración en `config/`
- Proxea las imágenes en `/proxy-image/` para evitar mixed content

#### Debug de configuración (nueva ruta)

Si quieres verificar qué se guardó exactamente, en la URL del servidor ejecuta:

- `GET /debug/config` → Devuelve `configDir`, estado del archivo, contenido crudo y parseado
- `GET /reset-config` → Restaura valores por defecto (texto + precios)

💡 Nota importante: en PHP (gateway) la ruta `getConfigDir()` intenta usar primero `LOCALAPPDATA` si existe, y luego `__DIR__/config`. En IONOS la ruta siempre es `__DIR__/config`.

### `vite.config.js` para web

```js
base: '/',  // El subdominio apunta directo a la raíz
```

### `src/shared/api.js` para web

```js
const BACKEND_URL =
  typeof window !== 'undefined' && window.electronAPI?.backendUrl
    ? window.electronAPI.backendUrl
    : ''  // Rutas relativas → proxy.php en Apache
```

### Diagnóstico

```
https://printbox.incomar.net/proxy.php  →  { "status": "ok", "curl": true, ... }
https://printbox.incomar.net/health     →  { "ok": true }
https://printbox.incomar.net/config     →  { "config": {...}, "textos": {...} }
```

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
│   │   ├── ic_launcher.ico    (usar para el .exe)
│   │   └── assets/
│   │       ├── banners-AdventureSup.png
│   │       ├── qr-code.png
│   │       ├── ic_launcher.png
│   │       └── MoscaPrintbox.png (opcional, ya no en uso directo)
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

### 6.1 Panel de Control — Aplicación Electron (no web)

**⚠️ Nota:** El Panel de Control **NO es accesible vía web**. Solo está disponible en la app de Electron para Windows.

1. Abrir la app Electron → aparece el Panel de Control
2. **Editar** para configurar delay, timer, impresora y textos del Viewer
3. **▶ Encender** → introduce el código del evento (solo números, sin `ev-`)
4. El programa detecta fotos nuevas → descarga → PDF → imprime
5. Log en tiempo real con colores
6. **■ Apagar** al terminar

**Alertas automáticas:**
- 🔴 Barra roja si la impresora no se encuentra (comprueba cada 30s)
- 🟡 Barra amarilla si la API cae (reconecta automáticamente)
- 🟡 Barra amarilla si hay actualización disponible (se instala al cerrar)

### 6.2 Visor de Evento — `/#/viewer`

**Accesible vía web pública** en `https://printbox.incomar.net/viewer`

1. Siempre pide el código de evento al arrancar
2. Galería responsive de fotos
3. Click en foto → modal con foto grande + selector de copias (1/2/3)
4. Confirmar → se imprime (si hay un Panel de Control Electron activo)
5. Paginación automática (10 fotos por página)

**Elementos:**
- Header: Botones QR y Autoplay
- Header: imagen banner fija 90px (textos pintados en la imagen)
- Footer Bootstrap: precios, empresa, contador, botón "Cambiar evento"

---

## 7. App móvil web

Accesible vía web pública en `https://printbox.incomar.net/mobile`

**Pensada para que el cliente la use desde su móvil o tablet.**

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
https://tudominio.com/mobile?evento=1668042
```
El código se rellena automáticamente al escanear.

---

## 8. Archivos de configuración

> **Desarrollo:** `config/` en la raíz del proyecto  
> **Producción:** `C:\Users\[usuario]\AppData\Local\PrintboxAdventures\config\`

### `config/servidor_api.txt`
```
servidor;https://gestion.printboxweb.com
evento;ev-
timer;5
impresora;-IMPRESORA-
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
| --- | --- | --- |
| `banners-AdventureSup.png` | Banner superior Viewer | 90px fijo, textos pintados en la imagen |
| `qr-code.png` | QR del header | Reemplazar con QR real del evento |
| `MoscaPrintbox.png` | Logo/mascota | También usado como favicon |
| `MoscaPrintbox.ico` | Icono del .exe | Generar desde el PNG en convertio.co |

Para reemplazar: sustituir el archivo con el mismo nombre → `npm run build`.

---

## 10. Arquitectura técnica

### Stack

| Capa | Tecnología |
| --- | --- |
| Frontend | React 18 + Vite 7 + Bootstrap 5.3.8 CDN dark mode + React Router |
| API HTTP | Fetch API (nativa) |
| Backend | Node.js + Express 4 (puerto 4000) |
| Desktop | Electron 40 |
| Build | electron-builder 26 → NSIS installer |

### CORS y Proxy
En desarrollo, las llamadas pasan por el backend local:
```
React → localhost:4000/printbox/... → gestion.printboxweb.com
```

En producción (`printbox.incomar.net`), Express también maneja el proxy de CORS.

### CSRF (error 419)
Laravel protege sus POST con tokens CSRF. El backend visita `/sanctum/csrf-cookie`, guarda la cookie en un `CookieJar` (`tough-cookie` + `fetch-cookie`) y la envía en `X-XSRF-TOKEN`.

### Impresión física (Panel de Control en Electron)
1. Lee fotos de la API en tiempo real
2. Descarga imagen → `AppData\descargas\`
3. Detecta orientación con Sharp
4. Genera PDF A4 centrado con PDFKit → `AppData\pdf\`
5. Espera Delay segundos (configurable)
6. Envía a impresora con pdf-to-printer (SumatraPDF embebido)
7. Incrementa contador en `PBAcount.txt`

### Carga del frontend en Electron

**Desarrollo:**
```
Electron → loadURL('http://localhost:3000')  ← Vite dev server (solo frontend)
Express en puerto 4000 maneja APIs
```

**Producción:**
```
Electron → loadURL('http://localhost:4000')  ← Express sirve dist/ (frontend compilado)
Express también maneja APIs de backend
```

> Se usa `loadURL()` en ambos casos para mantener consistencia con rutas `/assets/`.

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
| --- | --- |
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
| --- | --- |
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
| --- | --- | --- |
| ✅ Modo quiosco | `electron/main.js` | Viewer en pantalla completa. `F11`/`Escape` para salir |
| ✅ Splash screen | `electron/main.js` | Logo + barra de progreso mientras arranca Express (2.5s) |
| ✅ Bandeja del sistema | `electron/main.js` | La X minimiza a tray. Menú contextual. `Ctrl+Q` para cerrar |
| ✅ Reconexión automática | `PrinterApp.jsx` | Si la API cae, reintenta cada 5s→10s→...→30s automáticamente |
| ✅ Alerta impresora offline | `PrinterApp.jsx` | Barra roja si la impresora no se encuentra. Comprueba cada 30s |
| ✅ App móvil web | `mobile/MobileApp.jsx` | Galería completa, cámara, selección, pedido y precios |
| ✅ OTP opcional eliminado | `mobile/MobileApp.jsx` | Ahora el evento se conecta directamente a la galería sin verificación SMS opcional |
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
| ✅ Persistencia localStorage (viewer) | `viewer/ViewerApp.jsx` | Guarda evento, config, paging y texto entre recargas (Marzo 2026) |
| ✅ Entrada automática QR | `mobile/MobileApp.jsx` | No muestra modal de entrada, va directamente a galería desde QR (Marzo 2026) |
| ✅ Pantalla carga QR | `mobile/MobileApp.jsx` | "Cargando evento..." amigable al acceder vía QR (Marzo 2026) |
| ✅ Flujo simplificado mobile | `mobile/MobileApp.jsx` | Botón editar removido, sin "Hacer foto nueva", texto bilingüe (Marzo 2026) |
| ✅ Pago mobile actualizado | `mobile/MobileApp.jsx` | Cambio de "datáfono" a "tarjeta, Google Pay, etc." (Marzo 2026) |
| ✅ Pago integrado Square | `proxy.php`, `MobileApp.jsx`, `ViewerApp.jsx` | Payments API de Square/BBVA. Tokenización PCI-compliant (Abril 2026) |
| ✅ Envío directo a impresora tras pago | `ViewerApp.jsx`, `src/shared/api.js` | La foto del pedido se envía automáticamente al evento de la impresora después del pago, sin copia manual | 
| ✅ Compatibilidad de evento `ev-` | `src/shared/api.js`, `src/mobile/MobileApp.jsx`, `proxy.php` | Normaliza códigos `ev-123` para cargar precios correctos desde `textos_123.txt` (Abril 2026) |
| ✅ Config independiente por evento | `proxy.php`, `api.js` | Cada evento guarda precios en archivo `textos_<eventCode>.txt` (Abril 2026) |
| ✅ Admin evento independiente | `ViewerApp.jsx` | Admin puede cambiar precios específicos de cada evento sin afectar otros (Abril 2026) |
| ✅ Flujo post-pago robusto | `MobileApp.jsx`, `ViewerApp.jsx` | Pago exitoso no se bloquea por error de envío de fotos (Abril 2026) |
| ✅ Volver al evento después de pagar | `MobileApp.jsx` | Botón "Finalizar" vuelve a galería del evento, no a introducir código (Abril 2026) |

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

### Mejoras UI/UX

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

#### Mejoras de Rendimiento
- **Cache inteligente de fotos:** El viewer guarda las fotos en localStorage por 15 minutos
- **Carga instantánea al recargar:** No vuelve a descargar todas las fotos si ya están en caché
- **Actualización automática de precios:** Los cambios en admin se reflejan en tiempo real en la UI

#### Mejoras de Layout
- **Grid responsive mejorado:** Máximo 5-6 columnas en pantallas anchas (antes se estiraba a 8+)
- **Header móvil rediseñado:** Logo + texto bilingüe + botón privacidad
- **Ocultar indicadores de paso:** Los "1 2 3" ya no aparecen sobre las fotos

#### Optimizaciones Técnicas
- **URLs limpias:** Migración completa de HashRouter a BrowserRouter
- **API unificada:** Rutas relativas que funcionan en desarrollo y producción
- **Gestión de estado mejorada:** localStorage persistente para configuración móvil
- **Actualización en tiempo real:** Los precios y configuraciones del admin se sincronizan automáticamente con la UI

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

### 🔒 Apple Pay y Google Pay (Pendiente)

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

## 14.2 Apple Pay y Google Pay (Pendiente)

### Estado actual

Apple Pay y Google Pay **no están implementados** actualmente. Se mantienen activos solo:
- **Tarjeta de crédito/débito** via Square
- **PayPal** via SDK de PayPal

### Apple Pay (Pendiente)

**Requisitos para implementar:**
- Verificar dominio `printbox.incomar.net` en Square Developer Dashboard
- El archivo de verificación ya está desplegado en el servidor
- Contactar a Square soporte para habilitar Apple Pay en la cuenta

**Archivo preparado:**
```
.well-known/apple-developer-merchantid-domain-association
```

### Google Pay (Pendiente)

**Requisitos para implementar:**
- Registrar merchant en Google Pay Dashboard
- Configurar Square como gateway (alternative: Stripe)
- Implementación con Google Pay Web API

**Opción recomendada:** Usar **Stripe** para Google Pay en lugar de Square, ya que Stripe tiene mejor documentación y configuración más sencilla.

---

## 15. Pendientes / Ideas de mejora

### Funcionales
- [ ] Versión visible en la app (header del Printer)
- [ ] Notificación toast al imprimir
- [ ] Sonido de confirmación al imprimir
- [x] Pago integrado (Square/BBVA) ✅ Abril 2026 - PRODUCTION
- [ ] Apple Pay (iOS) - Pendiente (requiere verificación de dominio en Square)
- [ ] Google Pay (Android) - Pendiente (requiere configuración en Google Pay Dashboard)

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
- [x] Despliegue en IONOS con HTTPS ✅ Marzo 2026 → https://printbox.incomar.net
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
"version": "1.0.7"
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

4. Ve a tu repositorio en GitHub → **Releases** y pulsa **"Publish release"** en el borrador.

### Qué ven los usuarios
- Al arrancar la app comprueba automáticamente si hay versión nueva en GitHub
- Si la hay → barra amarilla en el Panel de Control: *"Hay una actualización disponible"*
- La descarga en segundo plano
- Al cerrar la app instala la nueva versión sola
- Botón "Instalar ahora" para no esperar al cierre

---

---

*PrintboxAdventures v1.0.7 · Desarrollado por Alejandro · 2026*