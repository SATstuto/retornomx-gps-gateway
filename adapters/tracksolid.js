// adapters/tracksolid.js
// TrackSolid Pro API - Syscom VL103KIT y compatibles
// Docs: https://open.tracksolid.com/
// TODO: Activar cuando Jaime tenga API key de Syscom

async function getLocation({ portalUrl, usuario, password, deviceId, apiKey }) {
  // TrackSolid tiene API REST oficial en open.tracksolid.com
  // Requiere: AppKey (de developer portal) + usuario + password

  if (!apiKey) {
    throw new Error(
      'TrackSolid requiere API key. Obtenerla en: https://open.tracksolid.com'
    )
  }

  const fetch = require('node-fetch')

  // 1. Login para obtener access_token
  const loginRes = await fetch('https://open.tracksolid.com/api/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      account: usuario,
      password: password,
      lang: 'es',
    }),
  })

  const loginData = await loginRes.json()

  if (loginData.code !== 0) {
    throw new Error(`TrackSolid login error: ${loginData.msg}`)
  }

  const accessToken = loginData.data.accessToken

  // 2. Obtener última posición del dispositivo
  const posRes = await fetch(
    `https://open.tracksolid.com/api/v1/device/lastLocation?imei=${deviceId}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        AppKey: apiKey,
      },
    }
  )

  const posData = await posRes.json()

  if (posData.code !== 0) {
    throw new Error(`TrackSolid position error: ${posData.msg}`)
  }

  const loc = posData.data

  return {
    lat: loc.lat,
    lng: loc.lng,
    speed: loc.speed || 0,
    angle: loc.course || 0,
    altitude: loc.altitude || 0,
    dt_tracker: loc.positionTime,
    status: loc.speed > 0 ? 'moving' : 'stopped',
    provider: 'tracksolid',
  }
}

module.exports = { getLocation }
