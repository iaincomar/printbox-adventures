# Estado actual (abril 2026)

---

## ✅ Fix: sendPhoto no incluía phone y orientation (abril 2026)

### Problema
El viewer enviaba fotos al evento impresora tras el pago, pero el backend de Printbox requería `phone` y `orientation` obligatorios, causando error 422.

### Causa
En `api.js` la función `sendPhoto()` construía el body correctamente pero en el fetch se enviaba solo `{ event, image, times }` ignorando los campos opcionales.

### Corrección
- `src/shared/api.js`: Corregido el fetch para usar `JSON.stringify(body)` completo en lugar de hardcodear `{ event, image, times }`
- `src/viewer/ViewerApp.jsx`: Ahora envía `phone: '000000000'` y `orientation: 'landscape'` como valores por defecto para el visor público

### Archivos modificados
- `src/shared/api.js` → línea 322: `body: JSON.stringify(body)`
- `src/viewer/ViewerApp.jsx` → línea 569-575: envía phone y orientation

---

## ✅ Fix: precio se multiplicaba por 100 dos veces (abril 2026)

### Problema
El usuario ponía 0.10€ y el banco cobraba 10€. Ponía 0.01€ y cobraba 1€.

### Causa
El viewer ya enviaba el precio en centavos (ej: 10 para 0.10€), pero `proxy.php` multiplicaba por 100 otra vez: `round(floatval($data['amount']) * 100)`.

### Corrección
`proxy.php` línea 645: Cambiado de `round(floatval($data['amount']) * 100)` a `intval($data['amount'])` ya que el viewer ya envía centavos.

---

## ✅ Fix: evento_printer no se guardaba en servidor_api.txt (abril 2026)

### Problema
El código de evento de impresora se guardaba en Admin pero no persistía.

### Causa
`proxy.php` solo guardaba 5 campos en `servidor_api.txt` (sin `evento_printer`).

### Corrección
Agregado `evento_printer` al array de claves tanto en lectura como escritura de `servidor_api.txt`.

---

## ✅ Implementado: Pagos con Tarjeta y PayPal (abril 2026)

### Características actuales

- **Tarjeta**: Square Card Element (siempre disponible)
- **PayPal**: botón estándar PayPal integrado como flujo independiente

### No implementados (pendientes)

- **Apple Pay**: Requiere verificación de dominio en Square, por ahora deshabilitado
- **Google Pay**: Requiere configuración de merchant en Google Pay Dashboard, por ahora deshabilitado

### Métodos de pago activos

1. **Tarjeta de crédito/débito** - Square Card Element
2. **PayPal** - Botón estándar PayPal (configurado en el servidor)

---

## ✅ Implementado: precios por evento (textos_{evento}.txt)

### Cómo funciona ahora

Cada evento tiene su propio fichero de precios y textos en la carpeta `config/`:

```
config/
├── servidor_api.txt       ← evento activo + config de impresora
├── textos.txt             ← fallback global (si no existe fichero del evento)
├── textos_1668042.txt     ← precios del evento 1668042
├── textos_1234567.txt     ← precios del evento 1234567
└── ...
```

- **GET `/config`** → lee `textos_{evento}.txt` del evento activo (fallback a `textos.txt`)
- **GET `/config?evento=1668042`** → lee `textos_1668042.txt` directamente (para previsualizar en admin)
- **POST `/config`** → guarda en `textos_{evento}.txt` según el evento que viene en el body
- Al cambiar el código de evento en el panel Admin → carga automáticamente los precios guardados de ese evento

### Archivos modificados
- `proxy.php` → nuevas funciones `getTextosFile()`, `parseTextosFile()`, `writeTextosFile()`; GET y POST usan fichero por evento
- `backend/routes/config.js` → mismas funciones para entorno Electron/local
- `src/shared/api.js` → `getConfig(evento)` acepta evento como parámetro, usa `/config/` con barra final
- `src/viewer/ViewerApp.jsx` → init usa `getConfig(savedEvento)`, nuevo `handleAdminEventCodeChange` carga precios al cambiar evento en admin

---

## ✅ Bug corregido: 301 Redirect destruía el POST (abril 2026)

### Síntoma
Al guardar desde el admin, los precios llegaban vacíos al servidor aunque el payload era correcto.

### Causa
Apache hacía un redirect 301 de `/config` → `/config/`. Los navegadores al seguir ese redirect convierten POST en GET, perdiendo el body completamente.

### Corrección
`saveConfig()` en `api.js` usa `/config/` con barra final para evitar el redirect.

---
## ✅ Cambio de flujo: OTP removido del móvil (abril 2026)

### Qué cambió
- Se eliminó el paso de verificación SMS/OTP en `mobile/MobileApp.jsx`.
- Ahora la app móvil conecta el evento y carga directamente la galería de fotos.

### Por qué
- El OTP no es necesario para el envío de fotos al evento en el flujo actual.
- Se simplifica el acceso móvil y se evita dependencias con SMS.

---
## ✅ Viewer envía la foto directo al evento impresora tras pago (abril 2026)

### Qué cambió
- El viewer ya no utiliza una acción manual de “copiar fotos al evento impresora”.
- Tras el pago, la foto se envía directamente al `evento_printer` configurado.

### Beneficio
- El pedido se completa con el pago y la foto se dirige automáticamente al evento de impresión sin intervención extra.

---
## ✅ API de envío de fotos a evento

### Flujo actual
- La app llama a `sendPhoto()` en `src/shared/api.js`.
- Ese helper envía a `/printbox/photo-send` en el backend local/proxy.
- `backend/routes/printbox.js` y `proxy.php` proxifican a `/api/v1/events/photo/send`.

### Payload básico
- `event` (UUID del evento)
- `image` (Base64 de la foto)
- `times` (número de copias)
- `name`, `print`, `phone`, `orientation` son opcionales y ahora se envían con valores por defecto cuando están ausentes.

### Nota
- El endpoint `/api/v1/events/send` no se utiliza actualmente en este proyecto.

---
## Bug corregido: localStorage sobreescribía precios del servidor (abril 2026)

**Síntoma**
Al guardar precios personalizados (ej: 6€, 12€, 25€), el footer volvía a los valores por defecto (5€, 9€, 12€) al recargar.

**Causa**
El merge en la inicialización tenía orden incorrecto: localStorage pisaba al servidor.

**Corrección**
- Orden del merge invertido: `{ defaults, ...localStorage, ...servidor }` → servidor siempre gana
- Tras guardar en Admin se hace `localStorage.removeItem('printbox_viewer_state')` para limpiar datos cacheados

---## ✅ Bug corregido: prefijo `ev-` no cargaba precios de evento (abril 2026)

**Síntoma**
Cuando un código de evento venía como `ev-123456`, la app no encontraba el fichero de precios correcto y cargaba valores por defecto.

**Causa**
El código de evento se enviaba tal cual al backend, que buscaba `textos_ev-123456.txt` en lugar de `textos_123456.txt`.

**Corrección**
- `src/shared/api.js` normaliza `ev-`/`ev_` antes de llamar a `/config`
- `src/mobile/MobileApp.jsx` normaliza el código antes de buscar el evento
- `proxy.php` normaliza el parámetro `eventCode` en GET y POST

---
## Notas de entorno

- Local dev: `src/shared/api.js` usa `http://localhost:4000`
- Producción IONOS: rutas relativas `''` → `proxy.php`
- `proxy.php` intenta `LOCALAPPDATA` primero, luego `__DIR__/config` (IONOS siempre el segundo)

## Debug útil

```
GET /debug/config              → muestra evento activo, fichero en uso, todos los ficheros textos_*.txt
GET /debug/config?evento=XXXX  → previsualiza fichero de un evento concreto
GET /reset-config              → restaura textos.txt global a valores por defecto
```