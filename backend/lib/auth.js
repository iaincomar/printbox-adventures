// Autenticación de Admin compartida por las rutas del backend Express (dev).
// Misma lógica que checkAdminAuth() en proxy.php (prod): sin sesión/cookie, cada
// escritura exige la contraseña en la cabecera X-Admin-Password, verificada con
// bcrypt contra config/admin.json (nunca en texto plano ni en el código).

const fs = require('fs-extra')
const path = require('path')
const bcrypt = require('bcryptjs')

function getAdminPasswordHash(configDir) {
  try {
    const f = path.join(configDir, 'admin.json')
    if (!fs.existsSync(f)) return null
    const parsed = JSON.parse(fs.readFileSync(f, 'utf8'))
    return parsed?.passHash || null
  } catch {
    return null
  }
}

function checkAdminAuth(req, configDir) {
  const hash = getAdminPasswordHash(configDir)
  if (!hash) return false // sin config/admin.json no hay forma de entrar — fallar cerrado
  const sent = req.headers['x-admin-password'] || ''
  if (!sent) return false
  return bcrypt.compareSync(String(sent), hash)
}

module.exports = { getAdminPasswordHash, checkAdminAuth, bcrypt }
