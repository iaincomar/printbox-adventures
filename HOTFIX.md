# URGENT FIX - .htaccess Rule Ordering

## Problem Found
- `/config` is a REAL DIRECTORY on your server
- Apache's rule ordering was checking "real files/dirs" BEFORE the rewrite rules
- So `/config` matched the "is real directory" rule and returned 403
- This is why `/debug/config` worked (no real /debug folder exists)

## Solution Applied
Moved all API rewrite rules BEFORE the "real files/directories" check in `.htaccess`:

**Order now:**
1. ✅ Check if it's `/config` → rewrite to proxy.php
2. ✅ Check if it's `/reset-config` → rewrite to proxy.php  
3. ✅ Check if it's `/debug` → rewrite to proxy.php
4. ✅ Check if it's other APIs → rewrite to proxy.php
5. Then check if real file/directory exists

## Action Required
Upload **ONLY** the updated `.htaccess` file to IONOS (same FTP location)

## Test After Upload
Open in browser:
```
https://printbox.incomar.net/config
```

Should return **JSON with prices**, not 403 HTML error.

If it works:
- Mobile app will auto-load prices
- Admin can save prices
- Prices sync correctly
