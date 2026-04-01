# Deployment Verification Checklist

## Pre-Deployment Verification (Local) ✅

### Build Status
- [x] `npm run build` completed successfully
- [x] dist/ folder contains index.html
- [x] dist/assets/ contains compiled JS and CSS
- [x] Latest asset hash: `index-Dk5nO0_5.js` (includes new error handling)

### Code Changes
- [x] `.htaccess` contains `[PT,L,QSA]` flags on all proxy rewrites
- [x] `src/shared/api.js` has graceful 403 error handling
- [x] `proxy.php` already has CORS and logging (no changes needed)
- [x] `src/viewer/ViewerApp.jsx` already has correct admin logic (no changes)

### Documentation
- [x] `DEPLOYMENT_IONOS.md` - Complete deployment guide created
- [x] `QUICK_DEPLOY.md` - Quick reference guide created
- [x] `FIX_SUMMARY.md` - Technical documentation created

### Files Ready for Upload
```
✅ dist/
   ├── index.html
   └── assets/
       ├── index-Dk5nO0_5.js (234KB - NEW)
       ├── index-CcW38GVj.css
       └── [images, fonts, etc.]

✅ .htaccess
   ├── [PT,L,QSA] flags on config
   ├── [PT,L,QSA] flags on reset-config
   ├── [PT,L,QSA] flags on debug
   └── [PT,L,QSA] flags on all proxy routes

✅ proxy.php
   ├── CORS headers (unchanged)
   ├── Request logging (unchanged)
   └── /config, /reset-config, /debug endpoints (unchanged)
```

---

## Deployment Steps

### Step 1: Upload Files to IONOS

**Via FTP/SFTP:**
1. Connect to IONOS FTP server
2. Navigate to `/homepages/11/d669006142/htdocs/Printbox_Adventure/`
3. Upload:
   - `dist/` folder (entire - will replace old assets)
   - `.htaccess` file (will replace)
   - `proxy.php` file (can replace, or keep if no changes needed)

**Via IONOS File Manager (Web):**
1. Login to IONOS control panel
2. Open File Manager
3. Navigate to Printbox_Adventure folder
4. Upload dist/, .htaccess, proxy.php

### Step 2: Verify File Permissions

**Via SSH (if available):**
```bash
chmod 755 proxy.php
chmod 755 config/
chmod 644 config/*.txt
# Verify:
ls -la proxy.php          # Should show: -rwxr-xr-x
ls -ld config/            # Should show: drwxr-xr-x
```

**Via IONOS File Manager:**
1. Right-click proxy.php → Properties → Set to 755
2. Right-click config/ → Properties → Set to 755

### Step 3: Verify .htaccess Syntax

Access this URL in browser to test:
```
https://printbox.incomar.net/health
```

**Expected response:**
```json
{"ok":true}
```

If you get 403 or 404:
- .htaccess may have syntax error
- Re-upload .htaccess file
- Check IONOS error logs

### Step 4: Reset Configuration

Access in browser:
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
- Creates/overwrites `config/textos.txt`
- Sets default prices: 5, 9, 12
- Clears any corrupted data from previous attempts

### Step 5: Verify Configuration State

Access in browser:
```
https://printbox.incomar.net/debug/config
```

**Expected response (abbreviated):**
```json
{
  "configDir": "/homepages/11/d669006142/htdocs/Printbox_Adventure/config",
  "fileExists": true,
  "isWritable": true,
  "rawContent": "es:...\nen:Get your event photo!\nfr:...\nde:...\nprecio1:5\nprecio2:9\nprecio3:12\nempresa:PrintboxAdventures",
  "parsed": {
    "precio1": "5",
    "precio2": "9",
    "precio3": "12"
  }
}
```

---

## Post-Deployment Testing

### Test 1: Mobile App - Load Prices

**Steps:**
1. Open mobile browser: `https://printbox.incomar.net/mobile`
2. Open DevTools (F12) → Console tab
3. Watch for GET requests to /config every 5 seconds

**Expected Result:**
- Mobile displays prices (could be default 5,9,12 or custom)
- Console shows prices loaded successfully
- OR shows 403 error BUT still displays default prices
- No JavaScript errors that prevent app from running

**Acceptance Criteria:** ✅ App works, prices visible

### Test 2: Admin Panel - Login and View

**Steps:**
1. Open viewer: `https://printbox.incomar.net/viewer`
2. Press Ctrl+Shift+A (or find admin button)
3. Enter password: `admin123`
4. Should see price fields populated

**Expected Result:**
- Admin modal opens with password field
- After login, see prices: 5, 9, 12 (or custom values)
- Price input fields are editable

**Acceptance Criteria:** ✅ Admin login works, prices visible

### Test 3: Admin Panel - Save Prices

**Steps:**
1. In admin panel (from Test 2)
2. Change price 1 from 5 to 6
3. Change price 2 from 9 to 10
4. Change price 3 from 12 to 13
5. Click "Guardar" (Save) button
6. Watch console and network tab (F12)

**Expected Result:**
- See console log: `"Admin guardando: {adminPrice1: '6', adminPrice2: '10', ...}"`
- POST request to `/config` shows status 200 OK
- Response shows `{"ok":true, ...}` with new prices
- Success message shown: "✓ Precios guardados correctamente"
- OR error message if 403 (but should still show success update in UI)

**Acceptance Criteria:** ✅ Admin can save prices

### Test 4: Admin Save - Verify Server State

**Steps:**
1. After saving prices in Test 3 (6, 10, 13)
2. Visit: `https://printbox.incomar.net/debug/config`
3. Look at `"parsed"` section

**Expected Result:**
```json
"parsed": {
  "precio1": "6",
  "precio2": "10",
  "precio3": "13"
}
```

**Acceptance Criteria:** ✅ Server saved the new prices

### Test 5: Mobile Sync - Auto-Refresh

**Steps:**
1. Keep mobile app open in one browser tab
2. In another tab, open admin panel
3. Admin saves new prices (e.g., 7, 11, 14)
4. Watch mobile tab - should auto-refresh every 5 seconds
5. Prices should update on mobile to match admin

**Expected Result:**
- Mobile shows old prices initially
- After admin saves, mobile console shows new GET /config request
- Mobile display updates to new prices within 5 seconds
- No manual refresh needed

**Acceptance Criteria:** ✅ Mobile syncs prices within 5 seconds

### Test 6: Request Logging

**Steps:**
1. Open mobile
2. Open admin panel
3. Admin changes and saves prices
4. Visit: `https://printbox.incomar.net/pba_requests.log`

**Expected Result:**
```
2026-04-01 HH:MM:SS GET /config/ Content-Length:0 Body:
2026-04-01 HH:MM:SS POST /config Content-Length:228 Body:{"config":{...},"textos":{...
```

**Shows:**
- GET requests from mobile (every 5s)
- POST request from admin when saving
- No more 403 errors in log

**Acceptance Criteria:** ✅ Requests logged correctly

---

## Rollback Plan (If Issues)

If deployment causes problems:

1. **Restore Previous .htaccess:**
   - Keep backup of old .htaccess
   - Upload old version if new one causes errors
   - Clear cache: `https://printbox.incomar.net/health` should work

2. **Restore Previous dist/:**
   - Upload old dist/ folder from backup
   - JavaScript will revert to old version

3. **Reset Config:**
   - Run `/reset-config` endpoint again
   - Eliminates any corrupted config files

---

## Troubleshooting During Deployment

### Issue: Upload Fails
- **Cause:** File permissions or FTP connection
- **Solution:** Check IONOS FTP credentials, try different FTP client

### Issue: 403 on /health After Upload
- **Cause:** .htaccess syntax error or not uploaded
- **Solution:** Re-upload .htaccess, verify it starts with `Options -MultiViews`

### Issue: /reset-config Returns 500 Error
- **Cause:** proxy.php has issues or config/ not writable
- **Solution:** 
  1. Verify proxy.php uploaded
  2. Run `chmod 755 config/`
  3. Check IONOS error logs

### Issue: POST /config Still Returns 403
- **Cause:** Apache mod_security or [PT] flag not working
- **Solution:**
  1. Verify [PT,L,QSA] in .htaccess
  2. Check /pba_requests.log - does POST appear?
  3. If not: Contact IONOS, mention mod_security

### Issue: Prices Saved But Mobile Doesn't Update
- **Cause:** Mobile caching or not polling
- **Solution:**
  1. Force mobile refresh: Ctrl+Shift+R
  2. Check console - does it show new GET /config?
  3. Wait 5+ seconds, should auto-update

---

## Final Verification Checklist

### Before Going Live

- [ ] All files uploaded to IONOS
- [ ] Permissions set: `chmod 755 proxy.php config/`
- [ ] `/health` endpoint returns 200 OK
- [ ] `/reset-config` returns success message
- [ ] `/debug/config` shows proper JSON with prices 5,9,12
- [ ] Mobile loads without JavaScript errors
- [ ] Admin can login with password `admin123`
- [ ] Admin sees prices 5, 9, 12
- [ ] Admin can save new prices
- [ ] Server state updated (check /debug/config)
- [ ] Mobile auto-updates within 5 seconds (no manual refresh)
- [ ] `/pba_requests.log` shows all requests logged

### All Checks Passing?

✅ **Deployment Successful!**

The Printbox Adventures app is now fully deployed with:
- ✅ Prices syncing from admin to mobile within 5 seconds
- ✅ Admin panel working with login
- ✅ Config persistence on server
- ✅ Error handling with graceful defaults
- ✅ Request logging for troubleshooting

---

## Post-Deployment Monitoring

### Daily Checks (First Week)
1. Visit `/debug/config` - verify current prices intact
2. Try `/reset-config` - should work without errors
3. Open mobile - confirm prices load
4. Check `/pba_requests.log` - on every couple visitors

### Weekly Checks
1. Test admin panel login and price save
2. Verify mobile gets updated prices within 5 seconds
3. Check for any errors in IONOS error logs

### If Issues Appear
1. Check `/pba_requests.log` for clues
2. Check `/debug/config` for file state
3. Try `/reset-config` to restore clean state
4. If 403 returns: Contact IONOS about mod_security

---

## Success Metrics

After deployment, the app should have:
- **Performance:** No slowdown from new code
- **Reliability:** Handles 403 errors gracefully
- **Functionality:** Full price sync 5-second loop
- **Usability:** No user-visible errors or dropped prices
- **Diagnostics:** Full logging available at `/pba_requests.log`

**Target State:** Mobile shows same prices as admin within 5 seconds, consistently, with no failures.
