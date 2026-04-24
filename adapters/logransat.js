const puppeteer = require('puppeteer')

async function getLocation({ portalUrl, usuario, password, deviceId }) {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  })

  const page = await browser.newPage()
  let locationData = null

  await page.setRequestInterception(true)
  page.on('request', (req) => req.continue())
  page.on('response', async (response) => {
    const url = response.url()
    const contentType = response.headers()['content-type'] || ''
    if (contentType.includes('json') && !url.includes('login')) {
      try {
        const json = await response.json()
        if (json && typeof json === 'object' && !locationData) {
          console.log('[GPS] JSON interceptado:', url)
          locationData = { url, data: json }
        }
      } catch (e) {}
    }
  })

  try {
    const base = portalUrl.endsWith('/') ? portalUrl.slice(0, -1) : portalUrl
    await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 30000 })

    // Login
    const userSelectors = ['#username', 'input[name="usuario"]', 'input[name="user"]', 'input[type="text"]']
    const passSelectors = ['#password', 'input[name="contrasena"]', 'input[name="password"]', 'input[type="password"]']

    for (const sel of userSelectors) {
      const el = await page.$(sel)
      if (el) { await page.click(sel, { clickCount: 3 }); await page.type(sel, usuario); break }
    }
    for (const sel of passSelectors) {
      const el = await page.$(sel)
      if (el) { await page.click(sel, { clickCount: 3 }); await page.type(sel, password); break }
    }

    // Submit
    for (const sel of ['button[type="submit"]', 'input[type="submit"]', '.btn-login', '#btn-login']) {
      const el = await page.$(sel)
      if (el) { await el.click(); break }
    }

    // Esperar cualquier JSON por 30 segundos
    await new Promise((resolve) => setTimeout(resolve, 30000))

    console.log('[GPS] locationData capturado:', JSON.stringify(locationData?.url))

    if (!locationData) throw new Error('No se capturaron datos GPS despues del login')

    // Intentar extraer lat/lng de cualquier estructura
    const data = locationData.data
    const units = data.data ? Object.values(data.data) : 
                  data.units ? Object.values(data.units) :
                  Array.isArray(data) ? data : []

    if (units.length === 0) throw new Error('No se encontraron unidades en respuesta: ' + JSON.stringify(data).substring(0, 200))

    const unit = units[0] as any
    const loc = unit.location?.[0] || unit.pos || unit.position || unit

    if (!loc?.lat && !loc?.x) throw new Error('No se encontro posicion en unidad: ' + JSON.stringify(unit).substring(0, 200))

    return {
      lat: parseFloat(loc.lat || loc.x || loc.latitude),
      lng: parseFloat(loc.lng || loc.y || loc.longitude),
      speed: loc.speed || 0,
      status: unit.status_string || unit.status || 'activo',
      provider: 'logransat',
    }
  } finally {
    await browser.close()
  }
}

module.exports = { getLocation }
