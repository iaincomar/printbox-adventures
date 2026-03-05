# PrintboxAdventures — React + Electron

Migración de la app Python a React + Electron.

## Estructura del proyecto

```
printbox-adventures/
├── electron/
│   ├── main.js          # Proceso principal de Electron (abre 2 ventanas)
│   └── preload.js       # Expone backendUrl al renderer de forma segura
├── backend/
│   ├── server.js        # Express local — SOLO gestiona impresión física
│   └── routes/
│       ├── print.js     # Descarga imagen → PDF → impresora
│       └── config.js    # Lee/escribe config/*.txt
├── src/
│   ├── main.jsx         # Entry point React + React Router
│   ├── index.html
│   ├── styles/
│   │   └── global.css
│   ├── shared/
│   │   ├── api.js       # Todas las llamadas a gestion.printboxweb.com + backend
│   │   └── hooks/
│   │       └── useInterval.js
│   ├── viewer/
│   │   ├── ViewerApp.jsx   # Galería kiosko (reemplaza Printbox_Viewer.py)
│   │   └── Viewer.css
│   └── printer/
│       ├── PrinterApp.jsx  # Panel de control (reemplaza Printbox_Printer.py)
│       └── Printer.css
└── config/
    ├── servidor_api.txt # Configuración de conexión
    └── textos.txt       # Textos e idiomas del Viewer
```

## Instalación

```bash
npm install
```

## Desarrollo

```bash
npm run dev
```
Arranca: React (puerto 3000) + Backend Express (puerto 4000) + Electron

## Producción

```bash
npm run build
```
Genera el instalador `.exe` en `dist-electron/`

## Configuración

Editar `config/servidor_api.txt`:
```
servidor;http://gestion.printboxweb.com
evento;ev-XXXX        ← código del evento
timer;5               ← segundos entre consultas a la API
impresora;            ← nombre exacto de la impresora (vacío = predeterminada)
delay;5               ← segundos de espera antes de imprimir
```

Editar `config/textos.txt` para los textos del Viewer.

## Equivalencias Python → React

| Python                    | React                          |
|---------------------------|--------------------------------|
| `Printbox_Viewer.py`      | `src/viewer/ViewerApp.jsx`     |
| `Printbox_Printer.py`     | `src/printer/PrinterApp.jsx`   |
| `win32print`              | `pdf-to-printer` (Node)        |
| `img2pdf`                 | `pdfkit` + `sharp` (Node)      |
| `config/servidor_api.txt` | `config/servidor_api.txt` (igual) |
| `config/textos.txt`       | `config/textos.txt` (igual)    |
| `C:/log/PBAcount.txt`     | `C:/log/PBAcount.txt` (igual)  |

## Notas

- El modo FTP ha sido eliminado (ya no se usa)
- La carpeta `descargas/` sigue funcionando como base de datos de fotos ya impresas
- Al encender el programa, las fotos de `descargas/` se cargan para no re-imprimir
- Los archivos de config son compatibles con el formato anterior
