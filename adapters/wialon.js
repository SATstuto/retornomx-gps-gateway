// adapters/wialon.js
// Wialon Remote API - cubre Wialon Hosting, Wialon Local y todos sus revendedores
// Docs: https://help.wialon.com/en/api

const fetch = require('node-fetch')

// Resuelve la base URL del API según el portal del proveedor
// Ej: https://hosting.wialon.com → https://hst-api.wialon.com/wialon/ajax.html
// Ej: https://gps.miproveedor.com → https://gps.miproveedor.com/wialon/ajax.html
function resolveApiBase(portalUrl) {
  const url = new URL(portalUrl)

  // Wialon Hosting oficial
  if (url.hostname.includes('wialon.com')) {
    return 'https://hst-api.wialon.com/wialon/ajax.html'
  }

  // Wialon Local en servidor propio del proveedor
  // El API siempre está en /wialon/ajax.html
  return `${url.protocol}//${url.hostname}/wialon/ajax.html`
}

async function getLocation({ portalUrl, usuario, password, deviceId }) {
  const apiBase = resolveApiBase(portalUrl)

  // 1. Login con usuario y contraseña
  const loginRes = await fetch(
    `${apiBase}?svc=core/login&params=${encodeURIComponent(
      JSON.stringify({ user: usuario, password, lang: 'es' })
    )}`
  )

  if (!loginRes.ok) {
    throw new Error(`Wialon login HTTP error: ${loginRes.status}`)
  }

  const loginData = await loginRes.json()

  if (loginData.error) {
    throw new Error(`Wialon login error ${loginData.error}: credenciales inválidas`)
  }

  const sid = loginData.eid
  if (!sid) throw new Error('Wialon: no se obtuvo session ID')

  try {
    // 2. Buscar la unidad por deviceId (IMEI) o por nombre
    const searchParams = {
      spec: {
        itemsType: 'avl_unit',
        propName: deviceId ? 'sys_unique_id' : 'sys_name',
        propValueMask: deviceId || '*',
        sortType: 'sys_name',
      },
      force: 1,
      flags: 1025, // 1 (nombre) + 1024 (última posición)
      from: 0,
      to: 1,
    }

    const searchRes = await fetch(
      `${apiBase}?svc=core/search_items&params=${encodeURIComponent(
        JSON.stringify(searchParams)
      )}&sid=${sid}`
    )

    const searchData = await searchRes.json()

    if (searchData.error) {
      throw new Error(`Wialon search error ${searchData.error}`)
    }

    const items = searchData.items
    if (!items || items.length === 0) {
      throw new Error('Wialon: unidad no encontrada con las credenciales proporcionadas')
    }

    const unit = items[0]
    const pos = unit.pos

    if (!pos) {
      throw new Error('Wialon: la unidad no tiene posición registrada aún')
    }

    return {
      lat: pos.y,
      lng: pos.x,
      speed: pos.s || 0,
      angle: pos.c || 0,
      altitude: pos.z || 0,
      dt_tracker: new Date(pos.t * 1000).toISOString(),
      unit_name: unit.nm,
      status: pos.s > 0 ? 'moving' : 'stopped',
      provider: 'wialon',
    }
  } finally {
    // 3. Siempre cerrar sesión para no acumular sesiones activas
    await fetch(
      `${apiBase}?svc=core/logout&params={}&sid=${sid}`
    ).catch(() => {}) // silencioso
  }
}

module.exports = { getLocation }
