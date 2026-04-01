# Deployment Checklist for IONOS Server

## Summary of Recent Fixes

### Problem
- `GET /config` and `POST /config` were returning 403 Forbidden errors on IONOS
- Mobile app couldn't load prices (defaulted to 5, 9, 12)
- Admin couldn't save price changes
- Root cause: `.htaccess` rewrite rules missing `[PT]` (pass-through) flag

### Solution Implemented
1. Fixed `.htaccess` to use `[PT,L,QSA]` flags on all proxy rewrites
2. Added explicit `/proxy.php` with leading slash in rewrite targets
3. Added error handling in `api.js` to gracefully return defaults on 403 errors
4. Ensured `proxy.php` has robust CORS headers and request logging

---

## Deployment Steps

### Step 1: Upload Files to IONOS Server

Upload these files/folders to your IONOS hosting root (`/homepages/11/d669006142/htdocs/Printbox_Adventure/`):

**Files to replace/update:**
```
dist/                          (entire folder - new compiled assets)
.htaccess                       (updated rewrite rules)
proxy.php                       (already has logging & CORS)
```

**Command (if using FTP/SFTP via terminal):**
```bash
# Using sftp or rsync (replace with your credentials)
# Example with rsync:
rsync -avz --delete dist/ username@your-ftp-server:/path/to/Printbox_Adventure/
rsync -avz .htaccess username@your-ftp-server:/path/to/Printbox_Adventure/
rsync -avz proxy.php username@your-ftp-server:/path/to/Printbox_Adventure/
```

### Step 2: Set File Permissions on IONOS

If you have SSH/terminal access, run these commands:

```bash
# Make PHP file executable
chmod 755 proxy.php

# Make config directory writable
chmod 755 config/
chmod 644 config/*.txt

# Make logs writable if they exist
chmod 644 pba_requests.log 2>/dev/null || true
chmod 644 config/debug.log 2>/dev/null || true
```

**If using IONOS File Manager (web interface):**
- Right-click on `proxy.php` → Properties → Set permissions to `755`
- Right-click on `config/` → Properties → Set permissions to `755`

### Step 3: Reset Configuration to Defaults

This ensures `textos.txt` has proper default prices:

**Access this URL in your browser:**
```
https://printbox.incomar.net/reset-config
```

**Expected response:**
```json
{
  "ok": true,
  "message": "Config restaurada a valores por defecto"
}
```

**What this does:**
- Creates `config/textos.txt` with proper format:
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

### Step 4: Verify System State

Check these diagnostic endpoints:

**1. View current config state:**
```
https://printbox.incomar.net/debug/config
```

**Expected output:**
```json
{
  "configDir": "/homepages/11/d669006142/htdocs/Printbox_Adventure/config",
  "textosFile": "/homepages/11/d669006142/htdocs/Printbox_Adventure/config/textos.txt",
  "fileExists": true,
  "isWritable": true,
  "rawContent": "es:¡Consigue tu foto del evento!\nen:Get your event photo!\n...",
  "parsed": {
    "text_es": "¡Consigue tu foto del evento!",
    "text_en": "Get your event photo!",
    "precio1": "5",
    "precio2": "9",
    "precio3": "12"
  }
}
```

**2. Check request logs (if available):**
```
https://printbox.incomar.net/pba_requests.log
```

This shows timestamps of all requests hitting the proxy. Useful for debugging.

---

## Testing the Complete Flow

### Test 1: Mobile App Loads Prices

1. Open mobile on device or browser: `https://printbox.incomar.net/mobile`
2. Check browser console (F12 → Console tab)
3. Should see prices loaded: "precio1: 5, precio2: 9, precio3: 12"
4. **If error:** Console will show "GET https://printbox.incomar.net/config/ 403 Forbidden" but app should still display defaults

### Test 2: Admin Panel Login

1. Open viewer: `https://printbox.incomar.net/viewer`
2. Press Ctrl+Shift+A (or use the admin button)
3. Login with password: `admin123`
4. Should see prices loaded: 5, 9, 12

### Test 3: Change and Save Prices

1. In admin panel, change prices to test values (e.g., 6, 10, 13)
2. Click "Guardar" (Save)
3. Check browser console:
   - Should see: "Admin guardando: {adminPrice1: '6', ...}"
   - Success message: "✓ Precios guardados correctamente"
   - Or error if POST /config fails

### Test 4: Verify Prices Sync to Mobile

1. While mobile is open in another browser tab
2. Save new prices in admin (e.g., 6, 10, 13)
3. Mobile should refresh every 5 seconds
4. Price display should update to show new values (6, 10, 13)
5. Check mobile console - should see new prices loaded from `/config`

### Test 5: Verify Server-Side

1. After saving prices in admin
2. Visit: `https://printbox.incomar.net/debug/config`
3. The `"parsed"` section should show your new prices
4. The `rawContent` should show the file contains them

---

## Troubleshooting

### Problem: POST /config still returns 403

**Possible causes:**
1. `.htaccess` not uploaded or has syntax errors
2. `proxy.php` file permissions not set to 755
3. Apache `mod_security` blocking requests (contact IONOS support)

**Solutions:**
1. Verify `.htaccess` exists and starts with: `Options -MultiViews` and `RewriteEngine On`
2. Re-run: `chmod 755 proxy.php`
3. Check `pba_requests.log` - if POST `/config` doesn't appear, Apache is blocking it before reaching PHP
4. Contact IONOS support to disable mod_security for your domain

### Problem: GET /config returns 403

**Same as above, plus:**
- Verify the new `api.js` is deployed (should have fallback defaults in console logs)
- Frontend will still work with default prices even if GET fails

### Problem: Request log shows requests but prices aren't saved

**Check:**
1. `config/` folder exists and is writable: `chmod 755 config/`
2. Look at `/debug/config` - does it show correct file path?
3. Check `debug.log` in config folder: `https://printbox.incomar.net/debug/config` → lastLog section

### Problem: Changes saved but don't show in mobile

**Check:**
1. Mobile is actually refreshing (should refresh every 5 seconds)
2. Open mobile console and watch for "GET /config" requests
3. Verify `/debug/config` shows the saved prices
4. Mobile might be caching - try hard refresh: Ctrl+Shift+R or Cmd+Shift+R

---

## Files Modified in This Fix

| File | Change |
|------|--------|
| `.htaccess` | Added `[PT]` flag to all proxy rewrites |
| `proxy.php` | Already had CORS headers and logging |
| `src/shared/api.js` | Added graceful 403 error handling with defaults |
| `src/viewer/ViewerApp.jsx` | Already fixed admin price loading |
| `dist/` | Rebuilt with latest changes |

---

## Important Notes

### Prices Default Values
- Default prices when config unavailable: **5, 9, 12**
- These are hardcoded in `api.js` as fallback
- Users will always see prices even if server is down

### Admin Password
- Username: (not required)
- Password: `admin123`
- Stored only in frontend code
- Change by editing `src/viewer/ViewerApp.jsx` and rebuilding

### Config File Format
Each line is `key:value`:
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

**Do not edit manually** - use `/reset-config` endpoint or admin panel to modify.

---

## Next Steps

1. ✅ Deploy files to IONOS
2. ✅ Set permissions (chmod 755)
3. ✅ Run `/reset-config`
4. ✅ Verify `/debug/config` shows proper values
5. ✅ Test mobile loads prices
6. ✅ Test admin saves prices
7. ✅ Test mobile syncs within 5 seconds
8. 📋 **(Future)** Implement Square payment integration

---

## Contact Information

If you encounter persistent 403 errors after completing steps 1-2:
- **IONOS Support:** Contact your hosting provider's support
- **Issue:** "Apache mod_security blocking PHP requests to /config endpoint"
- **Request:** "Please disable mod_security for domain printbox.incomar.net or add exception for /config and /reset-config"
