// detector.js
// Detecta qué adapter usar según la URL del proveedor GPS

const WIALON_PATTERNS = [
  'wialon.com',
  'hosting.wialon.com',
  'hst-api.wialon.com',
  // Proveedores mexicanos conocidos que corren Wialon
  'kosmosgps.com',
  'navego.mx',
  'zeekgps.com',
  'gpscontrol.com.mx',
  'globaltrack.com.mx',
]

const TRACKSOLID_PATTERNS = [
  'tracksolid.com',
  'tracking.syscom.mx',
  'pro.tracksolid.com',
]

const LOGRANSAT_PATTERNS = [
  'logransat.mx',
  'logransat.com',
  'monitoreo.logransat',
]

function detectProvider(url) {
  if (!url) return 'unknown'

  const urlLower = url.toLowerCase()

  for (const pattern of WIALON_PATTERNS) {
    if (urlLower.includes(pattern)) return 'wialon'
  }

  for (const pattern of TRACKSOLID_PATTERNS) {
    if (urlLower.includes(pattern)) return 'tracksolid'
  }

  for (const pattern of LOGRANSAT_PATTERNS) {
    if (urlLower.includes(pattern)) return 'logransat'
  }

  // Fallback: intentar Wialon API primero, luego Puppeteer genérico
  return 'puppeteer_generic'
}

module.exports = { detectProvider }
