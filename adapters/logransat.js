const puppeteer = require('puppeteer')

async function getLocation({ portalUrl, usuario, password, deviceId }) {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  })

  const page = await browser.newPage()
  const allJson = []

  await page.setRequestInterception(true)
  page.on('request', (req) => req.continue())
  page.on('response', async (response) => {
    const url = response.url()
    const ct = response.headers()['content-type'] || ''
    if (ct.includes('json') && !url.includes('lng.php')) {
      try {
        const json = await response.json()
        console.log('[GPS] JSON:', url, '| size:', JSON.stringify(json).length)
        allJson.push({ url, data: json })
      } catch (e) {}
    }
  })

  try {
    const base = portalUrl.endsWith('/') ? portalUrl.slice(0, -1) : portalUrl
    await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 30000 })
    
    console.log('[GPS] En login page:', page.url())

    // Esperar que aparezca el campo de usuario
    await page.waitForSelector('#username, input[type="text"]', { timeout: 10000 })
    
    await page.click('#username', { clickCount: 3 })
    await page.type('#username', usuario)
    await page.click('#password', { clickCount: 3 })
    await page.type('#password', password)
    
    console.log('[GPS] Credenciales llenadas, haciendo submit')
    
    // Click en submit y esperar navegacion o cambio de URL
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => {}),
      page.click('button[type="submit"], input[type="submit"]').catch(async () => {
        await page.keyboard.press('Enter')
      })
    ])
    
    console.log('[GPS] Despues de submit:', page.url())
    
    // Esperar 20s para que cargue el dashboard
    await new Promise(r => setTimeout(r, 20000))
    
    console.log('[GPS] URL final:', page.url())
    console.log('[GPS] JSON capturados:', allJson.map(j => j.url).join(', '))

    if (allJson.length === 0) throw new Error('Sin respuestas JSON despues del login')

    // Buscar el que tenga coordenadas
    for (const response of allJson) {
      const str = JSON.stringify(response.data)
      if (str.includes('"lat"') || str.includes('"lng"') || str.includes('"x"')) {
        console.log('[GPS] Encontrado con coords:', response.url)
        const data = response.data
        const units = data.data ? Object.values(data.data) : Array.isArray(data) ? data : Object.values(data)
        const unit = units[0]
        const loc = unit.location?.[0] || unit.pos || unit
        return {
          lat: parseFloat(loc.lat || loc.x),
          lng: parseFloat(loc.lng || loc.y),
          speed: loc.speed || 0,
          status: unit.status_string || 'activo',
          provider: 'logransat',
        }
      }
    }

    throw new Error('Sin coordenadas. URLs: ' + allJson.map(j => j.url).join(', '))
  } finally {
    await browser.close()
  }
}

module.exports = { getLocation }
