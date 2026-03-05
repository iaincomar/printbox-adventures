================================================================================
  PRINTBOX ADVENTURES — Documentación completa
  Migración de Python + tkinter  →  React + Electron + Node.js
================================================================================

ÍNDICE
------
  1. Descripción general
  2. Requisitos
  3. Instalación y arranque
  4. Estructura del proyecto
  5. Cómo funciona la aplicación
     5.1 Panel de Control (Printer)
     5.2 Visor de Evento (Viewer)
  6. Archivos de configuración
  7. Assets / Imágenes
  8. Arquitectura técnica
  9. Cambios respecto a la versión Python
  10. Solución de problemas conocidos


================================================================================
1. DESCRIPCIÓN GENERAL
================================================================================

PrintboxAdventures es una aplicación de escritorio para gestionar la impresión
de fotos en eventos. Se compone de dos pantallas que se abren simultáneamente:

  - PANEL DE CONTROL (Printer): lo usa el operador para conectar al evento,
    monitorizar las descargas e impresiones y configurar la impresora.

  - VISOR DE EVENTO (Viewer): pantalla tipo kiosco orientada al público.
    Muestra las fotos del evento en una galería. El usuario puede hacer click
    en una foto para imprimirla o click derecho para previsualizarla.

La aplicación se conecta a la API de Printbox en:
  http://gestion.printboxweb.com

El backend (servidor Laravel) gestiona los eventos y las fotos. Esta app
solo consume esa API y gestiona la impresión física en local.


================================================================================
2. REQUISITOS
================================================================================

  - Windows 10 o superior (la impresión física requiere Windows)
  - Node.js v18 o superior  →  https://nodejs.org
  - npm (viene incluido con Node.js)
  - Una impresora instalada en el sistema (o PDF como impresora virtual para pruebas)
  - Conexión a internet para acceder a la API de Printbox


================================================================================
3. INSTALACIÓN Y ARRANQUE
================================================================================

PRIMERA VEZ:
  1. Descomprimir el proyecto en una carpeta
  2. Abrir una terminal (PowerShell o CMD) en esa carpeta
  3. Ejecutar:
       npm install
  4. Esto instala todas las dependencias (puede tardar 1-2 minutos)

ARRANCAR EN MODO DESARROLLO:
  npm run dev

  Esto lanza 3 procesos simultáneamente:
    [REACT]    Servidor de desarrollo en http://localhost:3000
    [BACKEND]  Servidor Express local en http://localhost:4000
    [ELECTRON] Ventana de escritorio con las dos pantallas

COMPILAR PARA PRODUCCIÓN:
  npm run build

  Genera un instalador .exe en la carpeta dist-electron/
  El instalador incluye todo, no necesita Node.js instalado para ejecutarse.

VERIFICAR QUE EL BACKEND FUNCIONA:
  Abrir en el navegador: http://localhost:4000/health
  Debe devolver: { "ok": true }


================================================================================
4. ESTRUCTURA DEL PROYECTO
================================================================================

printbox-adventures/
│
├── electron/
│   ├── main.js             Proceso principal de Electron.
│   │                       Abre 2 ventanas: /printer y /viewer
│   └── preload.js          Expone la URL del backend al renderer
│                           de forma segura (contextBridge)
│
├── backend/
│   ├── server.js           Servidor Express local (puerto 4000).
│   │                       Solo gestiona lo que el navegador no puede:
│   │                       impresión física y lectura de archivos locales.
│   └── routes/
│       ├── printbox.js     PROXY hacia gestion.printboxweb.com
│       │                   Reenvía las llamadas a la API de Printbox
│       │                   para evitar errores CORS desde el renderer.
│       ├── print.js        Descarga imagen → convierte a PDF → imprime
│       └── config.js       Lee y escribe los archivos config/*.txt
│
├── src/
│   ├── index.html          HTML principal
│   ├── main.jsx            Entry point de React + React Router
│   │                       Ruta /printer → PrinterApp
│   │                       Ruta /viewer  → ViewerApp
│   ├── public/
│   │   └── assets/         Imágenes estáticas servidas por Vite
│   │       ├── banners-AdventureSup.png   Banner superior del Viewer
│   │       ├── banners-Adventure_inf.png  Banner inferior del Viewer
│   │       ├── qr-code.png               Código QR del header
│   │       └── MoscaPrintbox.png         Logo/mascota
│   ├── styles/
│   │   └── global.css      Variables CSS globales y estilos base
│   ├── shared/
│   │   ├── api.js          Todas las llamadas HTTP centralizadas:
│   │   │                     - findEvent()        buscar evento por código
│   │   │                     - getEventPhotos()   galería paginada
│   │   │                     - getPhotosToPrint() fotos nuevas a imprimir
│   │   │                     - printJob()         enviar trabajo de impresión
│   │   │                     - getConfig()        leer configuración
│   │   │                     - saveConfig()       guardar configuración
│   │   └── hooks/
│   │       └── useInterval.js  Hook para polling periódico
│   ├── viewer/
│   │   ├── ViewerApp.jsx   Pantalla kiosco pública
│   │   └── Viewer.css
│   └── printer/
│       ├── PrinterApp.jsx  Panel de control del operador
│       └── Printer.css
│
├── config/
│   ├── servidor_api.txt    Configuración de conexión (ver sección 6)
│   └── textos.txt          Textos del Viewer (ver sección 6)
│
├── descargas/              Imágenes ya descargadas e impresas.
│                           Actúa como base de datos local para no
│                           volver a imprimir las mismas fotos.
│                           VACIAR MANUALMENTE entre eventos.
│
├── pdf/                    PDFs temporales generados para imprimir.
│                           Se pueden borrar sin problema.
│
└── package.json            Dependencias y scripts del proyecto


================================================================================
5. CÓMO FUNCIONA LA APLICACIÓN
================================================================================

5.1 PANEL DE CONTROL (Printer)
-------------------------------
Es la pantalla que usa el operador del evento. Ruta: /#/printer

FLUJO DE USO:
  1. Al abrir la app aparece el Panel de Control.
  2. Si se quiere cambiar la configuración (delay, timer, impresora o textos
     del Viewer), pulsar "Editar", hacer los cambios y pulsar "Guardar".
  3. Pulsar "▶ Encender". Si no hay evento configurado, aparece un modal
     pidiendo el número de evento (solo el número, sin "ev-").
     El prefijo "ev-" se añade automáticamente.
  4. El programa se conecta a la API, obtiene el UUID del evento y empieza
     a consultar la API cada X segundos (según el valor de Timer).
  5. Cuando detecta fotos nuevas las descarga, las convierte a PDF y las
     envía a la impresora con el delay configurado.
  6. El log muestra en tiempo real todo lo que ocurre.
  7. Al terminar el evento, pulsar "■ Apagar".

CAMBIAR DE EVENTO:
  - El badge con el código del evento (ej: ev-1668042) tiene un ✏
    que abre el modal para cambiarlo. Solo disponible cuando está apagado.

CAMPOS DE CONFIGURACIÓN:
  - Delay (seg): segundos que espera desde que descarga la imagen hasta
    que la imprime. Útil para asegurarse de que la imagen está completa.
    Mínimo recomendado: 5 segundos.
  - Timer (seg): cada cuántos segundos consulta la API buscando fotos nuevas.
    Mínimo recomendado: 5 segundos.
  - Impresora: selecciona la impresora física. Si se deja vacío usa la
    predeterminada del sistema.

5.2 VISOR DE EVENTO (Viewer)
-----------------------------
Es la pantalla pública orientada al cliente. Ruta: /#/viewer

FLUJO DE USO:
  1. Al abrir siempre aparece un modal pidiendo el número de evento.
  2. Al confirmar, carga las fotos del evento en una galería de 2 filas
     con hasta 5 fotos cada una (10 por página).
  3. La galería se refresca automáticamente cada X segundos (Timer).
  4. CLICK IZQUIERDO en una foto → la imprime.
  5. CLICK DERECHO en una foto → la previsualiza en pantalla completa.
  6. Si hay más de 10 fotos aparece un paginador en la parte inferior.

CAMBIAR DE EVENTO:
  - Botón "✏ cambiar evento" debajo del contador de impresiones (header).

ELEMENTOS VISUALES:
  - Banner superior con textos en 4 idiomas (ES, EN, FR, DE)
  - Código QR centrado en el header
  - Contador de impresiones totales (top derecha)
  - Banner inferior con los precios (1, 2 y 3 fotos) y nombre de empresa


================================================================================
6. ARCHIVOS DE CONFIGURACIÓN
================================================================================

config/servidor_api.txt
-----------------------
Formato: clave;valor (una por línea, en este orden exacto)

  servidor;http://gestion.printboxweb.com   URL del servidor Printbox
  evento;ev-1668042                          Código del evento actual
  timer;5                                    Segundos entre consultas a la API
  impresora;Adobe PDF                        Nombre exacto de la impresora
  delay;5                                    Segundos de espera antes de imprimir

NOTA: Este archivo se actualiza automáticamente al guardar desde la app.
No hace falta editarlo a mano, pero se puede hacer si es necesario.

config/textos.txt
-----------------
Formato: clave:valor (una por línea, en este orden exacto)

  es:¡Consigue tu foto del evento!
  en:Get your event photo!
  fr:Obtenez votre photo!
  de:Hol dir dein Foto!
  precio1:5                   Precio por 1 foto (sin símbolo €)
  precio2:9                   Precio por 2 fotos
  precio3:12                  Precio por 3 fotos
  empresa:PrintboxAdventures  Nombre que aparece en el footer del Viewer

NOTA: Estos textos se pueden editar también desde el Panel de Control
pulsando "Editar" y modificando la sección "Textos del Visor".


================================================================================
7. ASSETS / IMÁGENES
================================================================================

Las imágenes estáticas de la interfaz están en:
  src/public/assets/

Para reemplazar cualquier imagen, poner el nuevo archivo en esa carpeta
con el mismo nombre. Vite las sirve automáticamente desde la ruta /assets/.

  banners-AdventureSup.png  →  Banner azul superior del Viewer (1500x120px aprox)
  banners-Adventure_inf.png →  Banner azul inferior con precios (1500x60px aprox)
  qr-code.png               →  Código QR del header (cualquier tamaño cuadrado)
  MoscaPrintbox.png         →  Logo/mascota usado en modales y header del Printer


================================================================================
8. ARQUITECTURA TÉCNICA
================================================================================

PROBLEMA DE CORS Y SOLUCIÓN:
  El navegador (Electron renderer) bloquea las peticiones directas a dominios
  externos como gestion.printboxweb.com cuando el origen es localhost.
  
  Solución: todas las llamadas a la API de Printbox pasan por el backend
  local Express (puerto 4000), que actúa de proxy y hace las peticiones
  server-side sin restricciones CORS.

  React → localhost:4000/printbox/... → gestion.printboxweb.com

PROBLEMA DE CSRF 419 Y SOLUCIÓN:
  Laravel protege sus rutas POST con tokens CSRF. El backend Node obtiene
  primero el token visitando /sanctum/csrf-cookie, lo guarda en un CookieJar
  (como haría un navegador) y lo envía en la cabecera X-XSRF-TOKEN de cada
  petición POST.

IMPRESIÓN FÍSICA:
  El navegador no tiene acceso a impresoras del sistema. Por eso existe el
  backend Express local que:
    1. Descarga la imagen desde la URL de Printbox
    2. La guarda en descargas/
    3. La convierte a PDF con PDFKit y Sharp (respetando orientación)
    4. Espera los segundos de delay configurados
    5. La envía a la impresora con pdf-to-printer
    6. Incrementa el contador en C:/log/PBAcount.txt

CONTADOR DE IMPRESIONES:
  Se persiste en C:/log/PBAcount.txt (igual que en la versión Python).
  Para resetear el contador, editar ese archivo y poner 0.

POLLING:
  Tanto el Viewer como el Printer usan el hook useInterval para consultar
  la API periódicamente. El intervalo se pausa automáticamente cuando
  el programa está apagado (uuid = null).


================================================================================
9. CAMBIOS RESPECTO A LA VERSIÓN PYTHON
================================================================================

ELIMINADO:
  - Modo FTP completo (ya no se usa)
  - Dependencia de tkinter (interfaz gráfica de Python)
  - win32print → reemplazado por pdf-to-printer (Node.js)
  - img2pdf → reemplazado por PDFKit + Sharp (Node.js)
  - Necesidad de tener un lector de PDF instalado (Sumatra PDF, etc.)

AÑADIDO:
  - Interfaz web moderna con React (diseño oscuro, tipografía Syne)
  - Dos ventanas separadas que se abren simultáneamente con Electron
  - Modal al arrancar para introducir el número de evento sin tocar archivos
  - Botón "Cambiar Evento" en ambas pantallas sin necesidad de recargar
  - Proxy en el backend para resolver CORS y CSRF automáticamente
  - Log en tiempo real con colores por tipo de mensaje
  - Reloj de tiempo en ejecución
  - Paginación dinámica de fotos en el Viewer
  - Previsualización de fotos en modal (antes era ventana nueva de tkinter)
  - Los assets (banners, QR, logo) son archivos reemplazables fácilmente

MANTENIDO IGUAL:
  - Formato de config/servidor_api.txt y config/textos.txt (compatible)
  - Lógica de descarga: las fotos ya en descargas/ no se vuelven a imprimir
  - Campo "times" respetado: si una foto tiene times=2 se imprime 2 veces
  - Contador persistente en C:/log/PBAcount.txt
  - Mismos 3 endpoints de la API de Printbox


================================================================================
10. SOLUCIÓN DE PROBLEMAS CONOCIDOS
================================================================================

ERROR: "failed to fetch" al arrancar
  → Verificar que el backend está corriendo: http://localhost:4000/health
  → Asegurarse de ejecutar con "npm run dev" y no solo "vite"

ERROR 419 al conectar con el evento
  → Error CSRF de Laravel. El backend lo gestiona automáticamente con
    el CookieJar. Si persiste, reiniciar el backend (Ctrl+C y npm run dev).

ERROR: El Viewer no muestra fotos
  → Verificar que el número de evento es correcto (solo números, sin "ev-")
  → Comprobar en el log del Printer que la conexión fue exitosa
  → Verificar conexión a internet

ERROR: No imprime
  → Verificar que el nombre de impresora en config es exactamente igual
    al que aparece en "Dispositivos e impresoras" de Windows
  → Dejar el campo impresora vacío para usar la predeterminada del sistema
  → Revisar la carpeta pdf/ para ver si los PDFs se están generando

Las fotos se reimprimen al reiniciar
  → Es normal si se vació la carpeta descargas/. Esa carpeta es la memoria
    del programa. No vaciarla hasta que termine el evento.

El modal de evento no aparece en el Viewer
  → El Viewer siempre muestra el modal al arrancar. Si no aparece,
    hacer Ctrl+R en la ventana del Viewer para recargar.

================================================================================
  Desarrollado por Alejandro · PrintboxAdventures 2026
================================================================================