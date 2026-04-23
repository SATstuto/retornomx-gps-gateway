// index.js - RetornoMX GPS Gateway
// Deploy en Railway - NO expone credenciales del transportista

const express = require('express')
const crypto = require('crypto')
const { detectProvider } = require('./detector')

const app = express()
app.use(express.json())

const PORT = process.env.PORT || 3001
const GATEWAY_SECRET = process.env.GATEWAY_SECRET // shared secret con RetornoMX

// ── Middleware de autenticación ──────────────────────────────────────────────
// Solo RetornoMX puede llamar este gateway
function authMiddleware(req, res, next) {
  const authHeader = req.headers['x-gateway-secret']

  if (!GATEWAY_SECRET) {
    // En desarrollo sin secret configurado, pasar
    console.warn('⚠️  GATEWAY_SECRET no configurado - modo desarrollo')
    return next()
  }

  if (!authHeader || authHeader !== GATEWAY_SECRET) {
    return res.status(401).json({ error: 'No autorizado' })
  }

  next()
}

// ── Encriptación de credenciales ─────────────────────────────────────────────
// Las credenciales vienen encriptadas desde Supabase
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY // 32 chars hex

function decrypt(encryptedText) {
  if (!ENCRYPTION_KEY) return encryptedText // dev mode sin encripción

  try {
    const [ivHex, encrypted] = encryptedText.split(':')
    const iv = Buffer.from(ivHex, 'hex')
    const key = Buffer.from(ENCRYPTION_KEY, 'hex')
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv)
    let decrypted = decipher.update(encrypted, 'hex', 'utf8')
    decrypted += decipher.final('utf8')
    return decrypted
  } catch (e) {
    throw new Error('Error desencriptando credenciales')
  }
}

// ── Endpoint principal ───────────────────────────────────────────────────────
// POST /location
// Body: { portalUrl, usuario, password (encriptado), deviceId }
// Returns: { lat, lng, speed, status, dt_tracker, provider }

app.post('/location', authMiddleware, async (req, res) => {
  const { portalUrl, usuarioEnc, passwordEnc, deviceId } = req.body

  if (!portalUrl || !usuarioEnc || !passwordEnc) {
    return res.status(400).json({
      error: 'Faltan campos requeridos: portalUrl, usuarioEnc, passwordEnc',
    })
  }

  let usuario, password

  try {
    usuario = decrypt(usuarioEnc)
    password = decrypt(passwordEnc)
  } catch (e) {
    return res.status(400).json({ error: 'Error procesando credenciales' })
  }

  const provider = detectProvider(portalUrl)
  console.log(`[GPS] Proveedor detectado: ${provider} | URL: ${portalUrl}`)

  try {
    let adapter

    switch (provider) {
      case 'wialon':
        adapter = require('./adapters/wialon')
        break
      case 'logransat':
        adapter = require('./adapters/logransat')
        break
      case 'tracksolid':
        adapter = require('./adapters/tracksolid')
        break
      case 'puppeteer_generic':
        // Para proveedores desconocidos, intentar con el adapter de Logransat
        // (mismo patrón PHP + objects.php)
        console.log(`[GPS] Proveedor desconocido, intentando adapter genérico`)
        adapter = require('./adapters/logransat')
        break
      default:
        return res.status(400).json({
          error: `Proveedor GPS no soportado: ${provider}`,
          portalUrl,
        })
    }

    const location = await adapter.getLocation({
      portalUrl,
      usuario,
      password,
      deviceId,
    })

    console.log(`[GPS] ✓ Posición obtenida: ${location.lat}, ${location.lng}`)

    return res.json({
      success: true,
      ...location,
      provider_detected: provider,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error(`[GPS] Error con proveedor ${provider}:`, error.message)

    return res.status(500).json({
      success: false,
      error: error.message,
      provider: provider,
    })
  }
})

// ── Health check ─────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'RetornoMX GPS Gateway',
    providers_supported: ['wialon', 'logransat', 'tracksolid', 'puppeteer_generic'],
    timestamp: new Date().toISOString(),
  })
})

app.listen(PORT, () => {
  console.log(`🚀 RetornoMX GPS Gateway corriendo en puerto ${PORT}`)
  console.log(`   Proveedores: Wialon, Logransat, TrackSolid, Genérico`)
})
