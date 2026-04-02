# Estado actual del bug de precios (abril 2026)

---

## ✅ Bug corregido: localStorage sobreescribía precios del servidor (abril 2026)

### Síntoma
Al guardar precios personalizados en el panel Admin (ej: 6€, 12€, 25€), el footer del Viewer
volvía a mostrar los valores por defecto (5€, 9€, 12€) al recargar la página.

### Causa
En `ViewerApp.jsx`, durante la inicialización, el merge de datos tenía el orden incorrecto:

```js
// ANTES (bug): localStorage pisaba al servidor
const mergedTextos = {
  precio1: '5', precio2: '9', precio3: '12',  // defaults
  ...(d.textos || {}),      // servidor los sobreescribía
  ...(saved?.textos || {})  // localStorage los volvía a sobreescribir ← MAL
}
```

Si el localStorage tenía precios viejos de una sesión anterior (ej: los defaults 5/9/12),
estos siempre ganaban sobre lo que devolvía el servidor, incluso tras guardar correctamente.

### Corrección aplicada (ViewerApp.jsx)

1. **Orden del merge invertido**: servidor siempre tiene prioridad sobre localStorage.
```js
// DESPUÉS (correcto): servidor gana siempre
const mergedTextos = {
  precio1: '5', precio2: '9', precio3: '12',  // defaults
  ...(saved?.textos || {}),  // localStorage como fallback
  ...(d.textos || {}),       // servidor sobreescribe siempre ← BIEN
}
```

2. **Limpieza de localStorage al guardar**: tras un guardado exitoso en Admin, se llama a
`localStorage.removeItem('printbox_viewer_state')` para eliminar cualquier dato cacheado
que pudiera contradecir lo recién guardado.

### Archivos modificados
- `src/viewer/ViewerApp.jsx` (líneas ~158-166 y ~268-272)

---

## Resumen anterior: bug de precios en proxy.php

- El admin guarda `precio1`, `precio2`, `precio3` y se confirma con logs.
- Sin embargo, en algunos entornos se responde con `textos` vacíos (`precio1: '', ...`).
- El origen estaba en el puerto de configuración PHP (`proxy.php`), no en la UI.

## Causa específica detectada

1. En `/config POST` de `proxy.php`, la lectura de respuesta estaba usando un mapeo de claves que no coincidía con el formato de archivo.
   - Archivo guarda `es:`, `en:`, `fr:`, `de:`
   - POST hacía `in_array($key, ['text_es', 'text_en', ...])` → no coincide
2. Resultado: `textos` devuelto tras el guardado quedaba con "".
3. En `/config GET` se tuvo mapeo correcto (`es -> text_es`) por eso lectura GET podía funcionar, pero POST era inconsistente.

## Corrección aplicada

- `proxy.php` `/config POST` ahora lee `textos.txt` con un `keyMap` exacto:
  - `es -> text_es`, `en -> text_en`, `fr -> text_fr`, `de -> text_de`
  - `precio1`, `precio2`, `precio3`, `empresa` directos
- Esto hace que `saveConfig()` retorne los valores reales guardados.

## Verificación

1. Guardar precios en admin.
2. Ver `saveConfig` devuelve `textos` con precios correctos.
3. Abrir `/config` (o `GET /debug/config`) y verificar que el archivo y el JSON reflejan valores guardados.

## Notas de entorno

- Local dev: `src/shared/api.js` usa `HTTP://localhost:4000` cuando hostname es `localhost`.
- Producción IONOS: `src/shared/api.js` usa rutas relativas (`''`) y se apoya en `proxy.php`.
- `proxy.php` trata `LOCALAPPDATA` primero y luego `__DIR__/config`; en IONOS el segundo es el correcto.

## Recomendaciones inmediatas

- Ejecutar `GET /debug/config` tras un POST para confirmar la ruta y contenido.
- Si queda en `texto vacío`, revisar permisos Escribir/Leer en el directorio `config/` (en IONOS) y en `LOCALAPPDATA` (en local).
- Ejecutar `GET /reset-config` si necesitas retornar al estado inicial para pruebas.
- Si los precios siguen mostrando valores viejos tras guardar, abrir DevTools → Application → Local Storage → borrar `printbox_viewer_state` manualmente y recargar.