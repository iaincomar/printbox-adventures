# Estado actual (abril 2026)

---

## ✅ Implementado: Apple Pay, Google Pay y PayPal (Abril 2026)

### Características

- **iOS**: Apple Pay con verificación de dominio Square
- **Android**: Google Pay (si Google Play Services instalado)
- **Todos los dispositivos**: PayPal
- **Fallback**: Tarjeta de crédito tradicional siempre disponible

### Flujo de implementación

1. **Detección automática del dispositivo** (`navigator.userAgent`)
2. **Inicialización condicional**:
   - Tarjeta: siempre
   - Apple Pay: solo en iOS
   - Google Pay: solo en Android
   - PayPal: en todos los dispositivos
3. **Renderizado automático** de botones dentro contenedores Square
4. **Event listeners** para capturar tokenización

### Verificación de dominio Square

Archivo: `.well-known/apple-developer-merchantid-domain-association`

**Ubicaciones válidas:**
- `https://printbox.incomar.net/.well-known/apple-developer-merchantid-domain-association` ✅
- `https://printbox.incomar.net/apple-developer-merchantid-domain-association` ✅ (backup)

**Headers requeridos:**
```
Content-Type: application/json
Cache-Control: no-cache, no-store, must-revalidate, max-age=0
Pragma: no-cache
Expires: Thu, 01 Jan 1970 00:00:00 GMT
```

**Configurado en:** `.htaccess` con directiva `<Files>`

### Problemas actuales (abril 2026)

#### ❌ Botones no aparecen
- **Apple Pay**: Dominio no verificado en Square (archivo de verificación no subido al servidor)
- **Google Pay**: Inicializa pero botón no funcional (posible problema con payment request o dispositivo)
- **PayPal**: Implementado pero no probado

#### ❌ Errores de CSP (fuentes Square)
- Fuentes de `cash-f.squarecdn.com` bloqueadas por CSP restrictiva de Square SDK
- Solución temporal: CSP permisiva en `index.html` y `.htaccess`

#### ❌ Google Pay no responde al clic
- Botón se renderiza pero no genera eventos de tokenización
- Posibles causas: Dispositivo sin Google Pay configurado, payment request inválido, o error en event listener

### Debug

Consola del navegador (DevTools):
```
=== ESTADO DE SQUARE ===
Device type: ios|android|other
Square Card: true|false
Square Apple Pay: true|false
Square Google Pay: true|false
Square PayPal: true|false
Step: (paso actual de la app)
```

### Próximos pasos

1. **Subir archivo de verificación Apple Pay** desde Square Dashboard a `dist/.well-known/apple-developer-merchantid-domain-association`
2. **Verificar dominio** en Square
3. **Probar en dispositivos reales** con Apple Pay/Google Pay configurados
4. **Depurar Google Pay** agregando más logs de consola
5. **Ajustar CSP** para seguridad una vez funcional
```

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

## ✅ Bug corregido: localStorage sobreescribía precios del servidor (abril 2026)

### Síntoma
Al guardar precios personalizados (ej: 6€, 12€, 25€), el footer volvía a los valores por defecto (5€, 9€, 12€) al recargar.

### Causa
El merge en la inicialización tenía orden incorrecto: localStorage pisaba al servidor.

### Corrección
- Orden del merge invertido: `{ defaults, ...localStorage, ...servidor }` → servidor siempre gana
- Tras guardar en Admin se hace `localStorage.removeItem('printbox_viewer_state')` para limpiar datos cacheados

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