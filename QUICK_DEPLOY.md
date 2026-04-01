# Quick Start: Deploy to IONOS & Test

## 1. Upload Files (5 minutes)

Upload to IONOS FTP root:
```
dist/                  ← entire folder
.htaccess              ← file
proxy.php              ← file
```

## 2. Set Permissions (2 minutes)

Via IONOS File Manager or SSH:
```bash
chmod 755 proxy.php
chmod 755 config/
```

## 3. Reset Config (1 minute)

Visit in browser:
```
https://printbox.incomar.net/reset-config
```

Should return:
```json
{"ok":true,"message":"Config restaurada..."}
```

## 4. Verify State (1 minute)

Visit:
```
https://printbox.incomar.net/debug/config
```

Should show **JSON with prices: 5, 9, 12** in the `parsed` section.

## 5. Test Mobile (2 minutes)

1. Open: `https://printbox.incomar.net/mobile`
2. Open browser console (F12)
3. Should see prices loading (even if /config returns 403, defaults apply)

## 6. Test Admin (3 minutes)

1. Open: `https://printbox.incomar.net/viewer`
2. Press **Ctrl+Shift+A** to show admin
3. Login: password = `admin123`
4. See prices: 5, 9, 12
5. Change to 6, 10, 13
6. Click Save
7. Check console for success message

## 7. Test Sync (2 minutes)

1. Keep mobile open in another tab
2. Admin changes price to 7, 11, 14 
3. **Mobile refreshes every 5 seconds**
4. Should see new prices appear

---

## If Still Getting 403 Errors

Check `/debug/config` → if `"parsed"` section shows empty prices:
- Run `/reset-config` again
- Verify `config/` folder is writable (chmod 755)

If `/config` endpoint still 403:
- Contact IONOS support
- Issue: "mod_security blocking /config endpoint"
- They can disable or add exception

---

## Expected Final State

- ✅ Mobile shows prices from config (5, 9, 12 or custom)
- ✅ Admin can change prices
- ✅ Mobile syncs within 5 seconds
- ✅ `/debug/config` shows correct values
- ✅ `/pba_requests.log` shows all requests

Done! Prices should now sync between admin PC and mobile within 5 seconds.
