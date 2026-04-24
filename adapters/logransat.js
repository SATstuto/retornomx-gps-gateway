const puppeteer = require('puppeteer')

async function getLocation({ portalUrl, usuario, password, deviceId }) {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  })

  const page = await browser.newPage()
  const allResponses = []

  await page.setRequestInterception(true)
  page.on('request', (req) => req.continue())
  page.on('response', async (response) => {
    const url = response.url()
    const contentType = response.headers()['content-type'] || ''
    if (contentType.includes('json')) {
      try {
        const json = await response.json()
        console.log('[GPS] JSON URL:', url, '| keys:', Object.keys(json).join(','))
        allResponses.push({ url, data: json })
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

    // Esperar 35 segundos para capturar todos los endpoints
    await new Promise((resolve) => setTimeout(resolve, 35000))

    console.log('[GPS] Total responses:', allResponses.length)
    allResponses.forEach(r => console.log('[GPS] ->', r.url))

    // Buscar el endpoint con datos de ubicacion
    const locationResponse = allResponses.find(r => {
      const d = r.data
      const hasData = d.data || d.units || d.objects || d.devices
      return hasData && !r.url.includes('lng.php')
    })

    if (!locationResponse) {
      throw new Error('No se encontro endpoint GPS. URLs: ' + allResponses.map(r => r.url).join(', '))
    }

    const data = locationResponse.data
    const units = data.data ? Object.values(data.data) :
                  data.units ? Object.values(data.units) :
                  data.objects ? Object.values(data.objects) :
                  data.devices ? Object.values(data.devices) :
                  Array.isArray(data) ? data : []

    if (units.length === 0) throw new Error('Sin unidades en: ' + JSON.stringify(data).substring(0, 300))

    const unit = units[0]
    const loc = unit.location?.[0] || unit.pos || unit.position || unit

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
