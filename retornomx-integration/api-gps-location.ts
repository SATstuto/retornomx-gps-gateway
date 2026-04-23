// src/app/api/gps/location/route.ts
// RetornoMX → GPS Gateway → Proveedor del transportista
// La empresa NUNCA ve credenciales del transportista

import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'

const GATEWAY_URL = process.env.GPS_GATEWAY_URL // URL de Railway
const GATEWAY_SECRET = process.env.GPS_GATEWAY_SECRET
const ENCRYPTION_KEY = process.env.GPS_ENCRYPTION_KEY // mismo que en Railway

function encrypt(text: string): string {
  const key = Buffer.from(ENCRYPTION_KEY!, 'hex')
  const iv = crypto.randomBytes(16)
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv)
  let encrypted = cipher.update(text, 'utf8', 'hex')
  encrypted += cipher.final('hex')
  return `${iv.toString('hex')}:${encrypted}`
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const viajeId = searchParams.get('viajeId')

  if (!viajeId) {
    return NextResponse.json({ error: 'viajeId requerido' }, { status: 400 })
  }

  const supabase = createClient()

  // Verificar que el usuario autenticado tiene acceso a este viaje
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }

  // Obtener datos del viaje + unidad GPS del transportista
  // Solo accesible si el usuario es la empresa que contrató el viaje
  const { data: viaje, error } = await supabase
    .from('ofertas')
    .select(`
      id,
      status,
      empresa_id,
      unidades (
        gps_portal_url,
        gps_usuario,
        gps_password,
        gps_device_id
      ),
      empresas!empresa_id (
        user_id
      )
    `)
    .eq('id', viajeId)
    .eq('empresas.user_id', user.id)
    .single()

  if (error || !viaje) {
    return NextResponse.json(
      { error: 'Viaje no encontrado o sin acceso' },
      { status: 404 }
    )
  }

  // Solo mostrar GPS si el viaje está en curso
  if (!['aceptada', 'en_curso'].includes(viaje.status)) {
    return NextResponse.json(
      { error: 'El viaje no está activo' },
      { status: 400 }
    )
  }

  const unidad = viaje.unidades as any
  if (!unidad?.gps_portal_url) {
    return NextResponse.json(
      { error: 'Esta unidad no tiene GPS configurado' },
      { status: 404 }
    )
  }

  // Encriptar credenciales antes de enviar al Gateway
  const usuarioEnc = encrypt(unidad.gps_usuario)
  const passwordEnc = encrypt(unidad.gps_password)

  // Llamar al GPS Gateway en Railway
  const gatewayRes = await fetch(`${GATEWAY_URL}/location`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-gateway-secret': GATEWAY_SECRET!,
    },
    body: JSON.stringify({
      portalUrl: unidad.gps_portal_url,
      usuarioEnc,
      passwordEnc,
      deviceId: unidad.gps_device_id,
    }),
  })

  const locationData = await gatewayRes.json()

  if (!locationData.success) {
    return NextResponse.json(
      { error: 'No se pudo obtener ubicación: ' + locationData.error },
      { status: 500 }
    )
  }

  // Devolver solo lat/lng/status a la empresa - NUNCA credenciales
  return NextResponse.json({
    lat: locationData.lat,
    lng: locationData.lng,
    speed: locationData.speed,
    status: locationData.status,
    dt_tracker: locationData.dt_tracker,
    provider: locationData.provider,
  })
}
