const puppeteer = require('puppeteer')

async function getLocation({ portalUrl, usuario, password, deviceId }) {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  })

  const page = await browser.newPage()
  let lngData = null

  await page.setRequestInterception(true)
  page.on('request', (req) => req.continue())
  page.on('response', async (response) => {
    const url = response.url()
    if (url.includes('lng.php')) {
      try {
        const json = await response.json()
        console.log('[GPS] lng.php data:', JSON.stringify(json).substring(0, 500))
        lngData = json
      } catch (e) {}
    }
  })

  try {
    const base = portalUrl.endsWith('/') ? portalUrl.slice(0, -1) : portalUrl
    await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 30000 })

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

    for (const sel of ['button[type="submit"]', 'input[type="submit"]', '.btn-login', '#btn-login']) {
      const el = await page.$(sel)
      if (el) { await el.click(); break }
    }

    await new Promise((resolve) => setTimeout(resolve, 35000))

    if (!lngData) throw new Error('lng.php no respondio')

    console.log('[GPS] Estructura completa:', JSON.stringify(lngData).substring(0, 1000))

    const data = lngData.data
    if (!data) throw new Error('Sin campo data en lng.php: ' + JSON.stringify(lngData))

    const units = typeof data === 'object' ? Object.values(data) : data
    if (!units || units.length === 0) throw new Error('Sin unidades: ' + JSON.stringify(data).substring(0, 300))

    const unit = units[0]
    console.log('[GPS] Unidad:', JSON.stringify(unit).substring(0, 500))

    const loc = unit.location?.[0] || unit.pos || unit.position || unit
    const lat = parseFloat(loc.lat || loc.x || loc.latitude || loc.lt)
    const lng = parseFloat(loc.lng || loc.y || loc.longitude || loc.ln)

    if (!lat || !lng) throw new Error('Sin coordenadas en: ' + JSON.stringify(unit).substring(0, 300))

    return {
      lat,
      lng,
      speed: loc.speed || loc.sp || 0,
      status: unit.status_string || unit.status || 'activo',
      provider: 'logransat',
    }
  } finally {
    await browser.close()
  }
}

module.exports = { getLocation }
