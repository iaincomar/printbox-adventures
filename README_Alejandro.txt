================================================================================
  PRINTBOX ADVENTURES — Documentación completa
  Versión 1.0.0 · Desarrollado por Alejandro · 2026
================================================================================

ÍNDICE
------
  1.  Descripción general
  2.  Requisitos
  3.  Instalación y arranque (desarrollo)
  4.  Compilar instalador .exe (producción)
  5.  Estructura del proyecto
  6.  Cómo funciona la aplicación
       6.1 Panel de Control (Printer)
       6.2 Visor de Evento (Viewer)
  7.  Archivos de configuración
  8.  Assets / Imágenes
  9.  Arquitectura técnica
  10. Flujo de datos completo
  11. Dependencias principales
  12. Cambios respecto a la versión Python original
  13. Solución de problemas conocidos
  14. Pendientes / Ideas de mejora


================================================================================
1. DESCRIPCIÓN GENERAL
================================================================================

PrintboxAdventures es una aplicación de escritorio para gestionar la impresión
de fotos en eventos. Migrada en 2026 de Python + tkinter a React + Electron +
Node.js Express.

Se compone de DOS PANTALLAS que se abren simultáneamente al arrancar:

  - PANEL DE CONTROL (Printer):
    Lo usa el operador. Conecta al evento, monitoriza las impresiones,
    configura la impresora y los textos del Viewer.

  - VISOR DE EVENTO (Viewer):
    Pantalla pública orientada al cliente del evento. Muestra la galería
    de fotos. El usuario hace click en una foto para imprimirla, selecciona
    cuántas copias quiere (1, 2 o 3) y confirma.

La app se conecta a la API de Printbox en:
  https://gestion.printboxweb.com  (servidor Laravel)

El backend de Printbox gestiona los eventos y las fotos. Esta app solo
consume esa API y gestiona la impresión física local.


================================================================================
2. REQUISITOS
================================================================================

PARA DESARROLLO:
  - Windows 10/11 x64
  - Node.js v18 o superior  →  https://nodejs.org
  - npm (viene incluido con Node.js)
  - Una impresora instalada (o PDF como impresora virtual para pruebas)
  - Conexión a internet para acceder a la API de Printbox

PARA EL EQUIPO DESTINO (instalador .exe):
  - Windows 10/11 x64
  - NO necesita Node.js ni nada de desarrollo
  - SÍ necesita una impresora instalada y conexión a internet


================================================================================
3. INSTALACIÓN Y ARRANQUE (DESARROLLO)
================================================================================

PRIMERA VEZ:
  1. Descomprimir o clonar el proyecto en una carpeta
  2. Abrir una terminal (PowerShell o CMD) en esa carpeta
  3. Ejecutar:
       npm install
  4. Esto instala todas las dependencias (puede tardar 1-2 minutos)

ARRANCAR EN MODO DESARROLLO:
  npm run dev

  Lanza 3 procesos simultáneamente:
    [REACT]    Vite dev server en http://localhost:3000
    [BACKEND]  Express local en http://localhost:4000
    [ELECTRON] Abre las dos ventanas apuntando a localhost:3000

VERIFICAR QUE EL BACKEND FUNCIONA:
  Abrir en el navegador: http://localhost:4000/health
  Debe devolver: { "ok": true }


================================================================================
4. COMPILAR INSTALADOR .EXE (PRODUCCIÓN)
================================================================================

PREPARACIÓN (solo la primera vez):
  - Convertir MoscaPrintbox.png a .ico en https://convertio.co/png-ico/
  - Guardar el .ico en:  src/public/MoscaPrintbox.ico
  - Sin el .ico el instalador sale con el icono por defecto de Electron

COMPILAR:
  npm run build

  Proceso:
    1. Vite compila el frontend React → carpeta dist/
    2. electron-builder empaqueta todo → dist-electron/

RESULTADO:
  dist-electron/
  ├── PrintboxAdventures Setup 1.0.0.exe   ← ESTE ES EL INSTALADOR
  ├── win-unpacked/                         (app sin empaquetar, para pruebas)
  ├── latest.yml                            (para auto-actualizaciones futuras)
  └── builder-effective-config.yaml        (config usada en el build)

  Solo hace falta el .exe para distribuir. Los demás archivos son auxiliares.

INSTALAR EN OTRO EQUIPO:
  - Copiar solo el .exe al equipo destino
  - Hacer doble click e instalar
  - La primera vez que arranca crea automáticamente:
      C:\Users\[usuario]\AppData\Local\PrintboxAdventures\
        ├── config\servidor_api.txt
        ├── config\textos.txt
        ├── descargas\
        ├── pdf\
        └── PBAcount.txt

  IMPORTANTE: Si hay una versión anterior instalada, desinstalarla primero
  desde "Agregar o quitar programas" antes de instalar la nueva.


================================================================================
5. ESTRUCTURA DEL PROYECTO
================================================================================

printbox-adventures/
│
├── electron/
│   ├── main.js             Proceso principal de Electron.
│   │                       - En DEV carga http://localhost:3000
│   │                       - En PROD carga http://localhost:4000 (Express)
│   │                       - Abre 2 ventanas: /#/printer y /#/viewer
│   │                       - En producción espera 2s a que arranque Express
│   └── preload.js          Expone la URL del backend al renderer
│                           de forma segura (contextBridge)
│
├── backend/
│   ├── server.js           Servidor Express local (puerto 4000).
│   │                       - En DEV: gestiona API y config
│   │                       - En PROD: también sirve dist/ y assets/
│   │                       - Detecta si está empaquetado (isPackaged)
│   │                       - Guarda datos en AppData en producción
│   └── routes/
│       ├── printbox.js     PROXY hacia gestion.printboxweb.com
│       │                   - Gestiona CSRF con CookieJar automáticamente
│       │                   - Endpoints: find-event, photos, photos-to-print
│       ├── print.js        Descarga imagen → PDF → imprime
│       │                   - GET  /print/printers   lista impresoras
│       │                   - GET  /print/count      contador impresiones
│       │                   - POST /print/job        trabajo de impresión
│       └── config.js       Lee y escribe config/*.txt
│                           - GET  /config           leer configuración
│                           - POST /config           guardar configuración
│
├── src/
│   ├── index.html          HTML principal con Bootstrap 5.3.8 CDN dark mode
│   ├── main.jsx            Entry point React + HashRouter
│   │                         /printer → PrinterApp
│   │                         /viewer  → ViewerApp
│   ├── public/
│   │   ├── favicon.png               Icono de la pestaña (MoscaPrintbox)
│   │   ├── MoscaPrintbox.ico         Icono del .exe (generar desde el PNG)
│   │   └── assets/
│   │       ├── banners-AdventureSup.png   Banner superior Viewer (fijo 90px)
│   │       ├── qr-code.png               QR del header (reemplazar por real)
│   │       └── MoscaPrintbox.png         Logo/mascota
│   ├── styles/
│   │   └── global.css      Estilos globales mínimos
│   ├── shared/
│   │   ├── api.js          Todas las llamadas HTTP centralizadas
│   │   └── hooks/
│   │       └── useInterval.js  Hook para polling periódico
│   ├── viewer/
│   │   ├── ViewerApp.jsx   Pantalla pública del evento
│   │   └── Viewer.css      Estilos del Viewer (header altura fija, etc.)
│   └── printer/
│       ├── PrinterApp.jsx  Panel de control del operador
│       └── Printer.css     Estilos del Printer
│
├── config/
│   ├── servidor_api.txt    Config de conexión (ver sección 7)
│   └── textos.txt          Textos e idiomas del Viewer (ver sección 7)
│
├── package.json            Dependencias, scripts y config del build (.exe)
├── vite.config.js          Config de Vite (root: src, outDir: ../dist)
└── README.txt              Este archivo


================================================================================
6. CÓMO FUNCIONA LA APLICACIÓN
================================================================================

6.1 PANEL DE CONTROL (Printer) — /#/printer
--------------------------------------------

FLUJO DE USO:
  1. Abrir la app → aparece el Panel de Control.
  2. Pulsar "Editar" para configurar:
       - Delay (seg):    espera antes de imprimir (mínimo recomendado: 5)
       - Timer (seg):    frecuencia de consulta a la API (mínimo: 5)
       - Impresora:      seleccionar de la lista o dejar "Predeterminada"
       - Textos Viewer:  editar los 4 idiomas y los 3 precios
  3. Pulsar "▶ Encender":
       - Si no hay evento, aparece modal para introducirlo
         (solo el número sin "ev-", el prefijo se añade automáticamente)
       - Conecta a la API y obtiene el UUID del evento
       - Inicia el polling cada X segundos
  4. Al detectar fotos nuevas:
       - Descarga → AppData\descargas\
       - Espera Delay segundos
       - Convierte a PDF A4 centrado → AppData\pdf\
       - Envía a impresora
       - Incrementa contador
  5. Log en tiempo real con colores por tipo de mensaje.
  6. Al terminar → "■ Apagar".

CAMBIAR DE EVENTO:
  Badge del evento tiene ✏ → abre modal. Solo disponible con programa apagado.

6.2 VISOR DE EVENTO (Viewer) — /#/viewer
-----------------------------------------

FLUJO DE USO:
  1. Siempre aparece modal pidiendo código de evento al arrancar.
  2. Carga galería responsive de fotos (se adapta al ancho de pantalla).
  3. Galería se refresca automáticamente según Timer.
  4. CLICK en foto → modal con foto grande + selector de copias (1/2/3)
  5. Cada opción muestra el precio configurado.
  6. "Imprimir" → envía el trabajo al backend.
  7. Paginación automática si hay muchas fotos.

ELEMENTOS DE LA INTERFAZ:
  - Header: imagen banner fija a 90px (los textos van pintados en la imagen)
  - Footer Bootstrap negro: precios, empresa, contador, botón "Cambiar evento"
  - Botón "Cambiar evento" amarillo (btn-warning) en el footer


================================================================================
7. ARCHIVOS DE CONFIGURACIÓN
================================================================================

EN DESARROLLO: config/ (raíz del proyecto)
EN PRODUCCIÓN: C:\Users\[usuario]\AppData\Local\PrintboxAdventures\config\

config/servidor_api.txt — orden EXACTO, no cambiar posición de líneas
-----------------------
  servidor;https://gestion.printboxweb.com
  evento;ev-1668042
  timer;5
  impresora;Adobe PDF
  delay;5

config/textos.txt — orden EXACTO, no cambiar posición de líneas
-----------------
  es:¡Consigue tu foto del evento!
  en:Get your event photo!
  fr:Obtenez votre photo!
  de:Hol dir dein Foto!
  precio1:5
  precio2:9
  precio3:12
  empresa:PrintboxAdventures

Ambos archivos se actualizan automáticamente desde la app al pulsar "Guardar".
Solo editar manualmente en caso de emergencia si la app no arranca.


================================================================================
8. ASSETS / IMÁGENES
================================================================================

Ubicación desarrollo:   src/public/assets/
Ubicación producción:   resources/assets/ (dentro del .exe empaquetado)
                        → configurado en package.json > build > extraResources

Para reemplazar: sustituir el archivo con el mismo nombre → npm run build.

  banners-AdventureSup.png
    Banner superior del Viewer. Se muestra a 90px de alto fijo (overflow:hidden).
    Los textos van PINTADOS en la imagen, no superpuestos con código.
    Reemplazar para personalizar por cliente/evento.

  qr-code.png
    QR del header. Reemplazar con el QR real (Instagram, web, etc.)
    Tamaño cuadrado recomendado: 200x200px mínimo.

  MoscaPrintbox.png
    Logo/mascota principal. Usado en el Printer (header y modal de evento).
    Para el .exe: convertir a .ico y guardar como src/public/MoscaPrintbox.ico


================================================================================
9. ARQUITECTURA TÉCNICA
================================================================================

STACK:
  Frontend:  React 18 + Vite 7 + Bootstrap 5.3.8 CDN (dark mode)
  Backend:   Node.js + Express 4 (puerto 4000, local)
  Desktop:   Electron 40
  Build:     electron-builder 26 → instalador NSIS (.exe)

PROBLEMA CORS Y SOLUCIÓN:
  El renderer no puede llamar directamente a gestion.printboxweb.com.
  Solución: proxy en Express local.
    React → localhost:4000/printbox/... → gestion.printboxweb.com

PROBLEMA CSRF 419 Y SOLUCIÓN:
  Laravel protege sus POST con tokens CSRF.
  El backend visita /sanctum/csrf-cookie, guarda la cookie en un CookieJar
  (tough-cookie + fetch-cookie) y envía el token en X-XSRF-TOKEN.

IMPRESIÓN FÍSICA:
  1. Descarga imagen con node-fetch → AppData\descargas\
  2. Lee metadatos de orientación con Sharp
  3. Genera PDF A4 centrado con PDFKit → AppData\pdf\
  4. Espera Delay segundos
  5. Envía a impresora con pdf-to-printer (usa SumatraPDF embebido)
  6. Incrementa contador en PBAcount.txt

CÓMO ELECTRON CARGA EL FRONTEND:
  En DEV:   loadURL('http://localhost:3000')  ← Vite dev server
  En PROD:  loadURL('http://localhost:4000')  ← Express sirve dist/
  Razón: loadFile() rompe las rutas /assets/ en producción.
         Cargando desde Express las rutas funcionan igual que en dev.

DATOS EN PRODUCCIÓN VS DESARROLLO:
  Dev:   datos en raíz del proyecto (config/, descargas/, pdf/)
  Prod:  datos en AppData\Local\PrintboxAdventures\
         → tiene permisos de escritura sin ser administrador
         → Program Files NO tiene permisos de escritura (error EPERM)

RUTAS REACT (HashRouter):
  Se usa # en vez de BrowserRouter porque Electron no gestiona rutas HTML5.
    /#/printer  →  PrinterApp
    /#/viewer   →  ViewerApp


================================================================================
10. FLUJO DE DATOS COMPLETO
================================================================================

CONEXIÓN AL EVENTO:
  App → POST /printbox/find-event { code: "ev-XXXXXX" }
       → gestion.printboxweb.com/api/v1/events/find
       → { uuid: "xxxx-xxxx-..." }

GALERÍA (Viewer):
  App → POST /printbox/photos?page=N { event: uuid }
       → gestion.printboxweb.com/api/v1/events/photos
       → { data: [...fotos], last_page: N }

FOTOS NUEVAS (Printer, polling):
  App → POST /printbox/photos-to-print { event: uuid }
       → gestion.printboxweb.com/api/v1/events/photos_two
       → { values: [...fotos nuevas] }

IMPRIMIR:
  App → POST /print/job { imageUrl, imageName, printer, delay }
       → descarga → PDF → imprime → { ok: true, count: N }

CONFIG:
  App → GET  /config  → lee servidor_api.txt + textos.txt
  App → POST /config  → escribe servidor_api.txt + textos.txt


================================================================================
11. DEPENDENCIAS PRINCIPALES
================================================================================

PRODUCCIÓN (van dentro del .exe):
  express          Servidor web local
  cors             Cabeceras CORS
  fs-extra         Utilidades de sistema de archivos
  node-fetch       HTTP client (CommonJS, compatible con el proxy)
  fetch-cookie     Gestión de cookies en node-fetch (para CSRF Laravel)
  tough-cookie     CookieJar para mantener sesión
  pdfkit           Generación de PDFs
  sharp            Procesado de imágenes (orientación, metadatos)
  pdf-to-printer   Impresión física (SumatraPDF embebido)

DESARROLLO (no van en el .exe):
  vite + @vitejs/plugin-react   Compilador y dev server
  react + react-dom             Framework UI
  react-router-dom              Enrutado HashRouter
  electron                      Shell de escritorio
  electron-builder              Generador de instaladores .exe
  concurrently                  Lanza varios procesos en paralelo
  wait-on                       Espera a que los servidores arranquen


================================================================================
12. CAMBIOS RESPECTO A LA VERSIÓN PYTHON ORIGINAL
================================================================================

ELIMINADO:
  - Modo FTP completo (ya no lo usa el servidor Printbox)
  - tkinter (interfaz gráfica Python)
  - win32print → reemplazado por pdf-to-printer
  - img2pdf → reemplazado por PDFKit + Sharp
  - Sumatra PDF instalado por separado (ahora va embebido)
  - Contador en C:/log/PBAcount.txt → ahora en AppData

AÑADIDO:
  - Interfaz web moderna con React y Bootstrap 5 dark mode
  - Dos ventanas independientes simultáneas
  - Modal para introducir evento sin editar archivos
  - Botón "Cambiar Evento" sin reiniciar
  - Proxy automático CORS + CSRF
  - Log en tiempo real con colores
  - Reloj de tiempo en ejecución
  - Paginación dinámica de fotos
  - Galería responsive
  - Modal de impresión con selector de copias y precios
  - Instalador .exe sin dependencias en el destino
  - Datos en AppData (permisos correctos en Windows)

MANTENIDO:
  - Formato de config/*.txt (compatible con versión Python)
  - Anti-duplicados: fotos en descargas/ no se reimprimen
  - Campo "times": times=2 imprime 2 veces
  - Mismos 3 endpoints de la API de Printbox


================================================================================
13. SOLUCIÓN DE PROBLEMAS CONOCIDOS
================================================================================

ERROR: "EPERM mkdir C:\Program Files\..." al instalar
  → Ya corregido: los datos se guardan en AppData.
  → Si persiste con versión antigua: desinstalar desde "Agregar o quitar
    programas" y reinstalar con el .exe más reciente.

ERROR: "failed to fetch" en desarrollo
  → Verificar http://localhost:4000/health devuelve { "ok": true }
  → Usar siempre "npm run dev", no "vite" solo.

ERROR 419 (CSRF) al conectar
  → Reiniciar el backend. El CookieJar lo resuelve automáticamente.

ERROR: Viewer sin fotos
  → Verificar código de evento (solo números, sin "ev-")
  → Comprobar log del Printer: ¿conectó correctamente?
  → Verificar conexión a internet

ERROR: No imprime
  → Nombre de impresora debe ser EXACTAMENTE igual al de Windows
  → Dejar vacío para usar la predeterminada
  → Verificar que se generan PDFs en AppData\Local\PrintboxAdventures\pdf\

Las fotos se reimprimen al reiniciar
  → No vaciar AppData\Local\PrintboxAdventures\descargas\ hasta fin de evento.
  → Esa carpeta es la memoria del programa.

El banner superior crece con la pantalla
  → Verificar que Viewer.css tiene la regla:
      .viewer-app > header { height: 90px !important; overflow: hidden !important; }

El icono del .exe es el de Electron
  → Falta src/public/MoscaPrintbox.ico
  → Convertir en https://convertio.co/png-ico/ y hacer npm run build.

Las ventanas abren en blanco en producción
  → El backend tarda en arrancar. El main.js espera 2 segundos.
  → Si no es suficiente, aumentar el setTimeout en electron/main.js.


================================================================================
14. PENDIENTES / IDEAS DE MEJORA
================================================================================

FUNCIONALES:
  [ ] Versión visible en la app (header del Printer)
  [x] Minimizar a bandeja del sistema (system tray) — X minimiza, Ctrl+Q cierra
  [x] Pantalla splash mientras arranca el backend — logo + barra de progreso
  [x] Modo quiosco: Viewer en pantalla completa sin menú (F11/Escape para salir)
  [ ] Notificación toast al imprimir
  [ ] Sonido de confirmación al imprimir

VIEWER:
  [ ] Autoplay / slideshow automático
  [ ] QR dinámico con URL del visor web
  [ ] Búsqueda de fotos por número

PRINTER:
  [ ] Historial de impresiones con miniatura y hora
  [ ] Reimprimir última foto con un click
  [x] Alerta si impresora offline — barra roja con botón reintentar, comprueba cada 30s
  [ ] Estadísticas: fotos impresas, ingresos estimados

TÉCNICAS:
  [ ] Auto-actualización (electron-updater)
  [ ] Log de errores en disco
  [x] Reconexión automática si cae la API


================================================================================
15. MEJORAS IMPLEMENTADAS — DETALLE TÉCNICO
================================================================================

MODO QUIOSCO (electron/main.js)
  El Viewer se abre con kiosk:true + fullscreen:true en Electron.
  El operador puede salir del modo quiosco pulsando F11 o Escape.
  El Printer se abre normal (sin quiosco) para que el operador lo controle.

SPLASH SCREEN (electron/main.js)
  En producción, mientras Express tarda 2.5s en arrancar, se muestra una
  ventana sin bordes con el logo MoscaPrintbox, título y barra de progreso
  animada. Se cierra automáticamente cuando las ventanas principales cargan.

BANDEJA DEL SISTEMA (electron/main.js)
  La X del Panel de Control minimiza a la bandeja en vez de cerrar la app.
  Icono en la bandeja con menú contextual:
    - Mostrar Panel de Control
    - Mostrar Visor
    - Salir (cierra todo)
  Doble click en el icono del tray → muestra el Panel de Control.
  Para salir de verdad: Ctrl+Q desde cualquier ventana, o menú del tray.

RECONEXIÓN AUTOMÁTICA (src/printer/PrinterApp.jsx)
  Si la API de Printbox falla durante el polling, la app:
    1. Muestra barra amarilla "Sin conexión con la API"
    2. Llama a tryReconnect() automáticamente
    3. Reintenta cada 5s, 10s, 15s... hasta máximo 30s entre intentos
    4. Al reconectar: vuelve al estado normal y sigue imprimiendo
  No requiere intervención del operador.

ALERTA IMPRESORA OFFLINE (src/printer/PrinterApp.jsx)
  Al arrancar y cada 30s, comprueba si la impresora configurada está en
  la lista de impresoras del sistema.
  Si no la encuentra: barra roja en la parte superior con el nombre de la
  impresora y botón "Reintentar".
  Si no hay impresora configurada (usa predeterminada): no muestra alerta.

================================================================================
  PrintboxAdventures v1.0.0 · Desarrollado por Alejandro · 2026
  Soporte API Printbox: eventos@printboxweb.com · 623 040 445
================================================================================