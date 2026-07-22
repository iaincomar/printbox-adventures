# Estado verificado

## Limpieza de código (22 julio 2026)

Pasada de "quitar lo que no sea necesario y funcione", equivalente a la que se hizo en Printbox Hotels. Todo verificado con `npm run build`, `node -c` y `php -l`, y arrancando el backend (`/health` → 200).

- **Electron eliminado por completo** (confirmado con el usuario). La carpeta `electron/` ya no existía en el repo y toda su maquinaria en `package.json` estaba rota (`main: electron/main.js` inexistente, `npm run dev` intentaba lanzar `electron .` y fallaba). Quitado: el `main`, el arranque de electron del script `dev`, las deps `electron`/`electron-builder`/`electron-updater`/`electron-log`/`wait-on`, y todo el bloque `build` (nsis/extraResources). `npm install` eliminó **242 paquetes**. `npm run dev` queda como Hotels: React (`:3000`) + backend (`:4000`).
- **`backend/server.js`** limpiado de referencias a Electron: `isPackaged`/`process.resourcesPath`/`process.defaultApp` → `DATA_DIR = process.cwd()` fijo; import `os` sin usar retirado; `assetsPath` simplificado a `src/public/assets`.
- **Dependencia `axios`** retirada (no se usaba en ningún sitio del código).
- **Assets no usados**: borradas **31 imágenes** de `src/public/assets/` que no referenciaba ningún componente (mascotas `monito-*`, `banners-*`, iconos del flujo OTP/cámara antiguo `IcBack/IcCamera/IcGallery/...`, `Background*`, `splashscreen`, `qr-code`, `logo-adventure2`, variantes `IcHeader*` sin usar). Quedan solo las 5 realmente referenciadas: `ic_launcher.png`, `ic_launcher.ico`, `IcHeaderWhite.png`, `logo-adventure.png`, `terms_and_conditions_2.html`. Menos peso en cada deploy (vite copia `src/public/assets` entero a `dist/`).
- **Carpeta `assets/` de la raíz** eliminada: era un duplicado exacto de `src/public/assets` que no usaba ni el build ni el backend.
- **Archivos scratch de la raíz** borrados: `test.html`, `test.php` (diagnóstico IONOS) y `textos.txt` (huérfano; la config real vive en `config/textos.txt`).
- **Carpeta vacía `backend/printbox/`** eliminada.
- **Bug arreglado — logo roto del Printer**: `PrinterApp.jsx` apuntaba a `/assets/MoscaPrintbox.png`, que **no existía** (imagen rota en el Panel de Control). Repuntado a `/assets/ic_launcher.png` (el logo usado en el resto de la app).
- **Bug arreglado — `/config` daba 403 al recargar**: `ViewerApp.jsx` llamaba a `/config` sin barra final; con `config/.htaccess` protegiendo la carpeta, Apache devolvía 403 antes de reescribir a `proxy.php`. Corregido a `/config/` (mismo criterio que el resto de la app).
- **`backend/routes/printbox.js`**: `module.exports = router` estaba a mitad de fichero (antes de definir `/photo-send`); movido al final para evitar la trampa de reordenar y romperlo.

## Verificado

- `npm install` (–242 paquetes), `npm run build` ✅ sin errores; `dist/assets` queda solo con las 5 imágenes usadas + bundles.
- `node -c` sobre los 5 ficheros de backend y `php -l proxy.php` ✅.
- Backend arranca (`DATA_DIR` = raíz del proyecto, `/health` → 200) y `/assets/ic_launcher.png` sirve un PNG real; ninguna referencia `/assets/*` del código queda rota.

## Pendiente (no bloqueante)

- El `README.md` (970 líneas) sigue teniendo secciones extensas de Electron/instalador `.exe`/Panel de Control que ya no aplican — marcadas como legacy con un aviso al principio, pero convendría una reescritura completa en una pasada aparte.
- Ver `AUDITORIA_2026-07-20.md` para los arreglos de seguridad previos (importe de pago, admin, CORS/CSP, cupones) y sus pendientes (rotar credenciales de Square/PayPal, subir a producción).
