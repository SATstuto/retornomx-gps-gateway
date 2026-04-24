// adapters/logransat.js
// Puppeteer adapter para Logransat y portales similares (PHP + jQuery, objects.php)
// Funciona para cualquier portal que use el mismo patrón de objects.php

const puppeteer = require('puppeteer')

async function getLocation({ portalUrl, usuario, password, deviceId }) {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
    ],
  })

  const page = await browser.newPage()

  // Interceptar la respuesta de objects.php
  let objectsData = null

  await page.setRequestInterception(true)

  page.on('request', (req) => req.continue())

  page.on('response', async (response) => {
    const url = response.url()
    if (url.includes('objects.php')) {
      try {
        const json = await response.json()
        if (json && json.success) {
          objectsData = json
        }
      } catch (e) {
        // no era JSON, ignorar
      }
    }
  })

  try {
    // Normalizar URL base
    const base = portalUrl.endsWith('/') ? portalUrl.slice(0, -1) : portalUrl

    // 1. Cargar página de login
    await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 30000 })

    // 2. Llenar credenciales - selectores comunes en portales PHP con jQuery
    // Intentamos múltiples selectores para máxima compatibilidad
    const userSelectors = [
      'input[name="usuario"]',
      'input[name="user"]',
      'input[name="username"]',
      'input[type="text"]',
      '#usuario',
      '#username',
    ]

    const passSelectors = [
      'input[name="contrasena"]',
      'input[name="password"]',
      'input[name="pass"]',
      'input[type="password"]',
      '#contrasena',
      '#password',
    ]

    let userFilled = false
    for (const sel of userSelectors) {
      const el = await page.$(sel)
      if (el) {
        await page.click(sel, { clickCount: 3 })
        await page.type(sel, usuario)
        userFilled = true
        break
      }
    }

    if (!userFilled) throw new Error('No se encontró campo de usuario en el portal')

    for (const sel of passSelectors) {
      const el = await page.$(sel)
      if (el) {
        await page.click(sel, { clickCount: 3 })
        await page.type(sel, password)
        break
      }
    }

    // 3. Submit login
    const submitSelectors = [
      'button[type="submit"]',
      'input[type="submit"]',
      'button:contains("Iniciar")',
      '.btn-login',
      '#btn-login',
    ]

    for (const sel of submitSelectors) {
      const el = await page.$(sel)
      if (el) {
        await el.click()
        break
      }
    }

    // 4. Esperar a que cargue el dashboard y objects.php sea llamado
    await page.waitForResponse(
      (response) => response.url().includes('objects.php'),
      { timeout: 45000 }
    )

    // Dar tiempo para que todos los objects.php se resuelvan
    await new Promise((r) => setTimeout(r, 3000))

    if (!objectsData) {
      throw new Error('Login exitoso pero no se recibió datos de objects.php')
    }

    // 5. Extraer posición de la unidad
    const units = Object.values(objectsData.data)

    if (units.length === 0) {
      throw new Error('No hay unidades en esta cuenta espejo')
    }

    // Si hay deviceId, buscar por él; si no, tomar la primera unidad
    let unit = units[0]
    if (deviceId) {
      const found = units.find((u) => {
        const key = Object.keys(objectsData.data).find(
          (k) => objectsData.data[k] === u
        )
        return key === deviceId
      })
      if (found) unit = found
    }

    const location = unit.location && unit.location[0]
    if (!location) {
      throw new Error('La unidad no tiene posición registrada aún')
    }

    return {
      lat: parseFloat(location.lat),
      lng: parseFloat(location.lng),
      speed: location.speed || 0,
      angle: location.angle || 0,
      altitude: location.altitude || 0,
      dt_tracker: location.dt_tracker,
      status: unit.status_string || unit.status,
      provider: 'logransat',
    }
  } finally {
    await browser.close()
  }
}

module.exports = { getLocation }
