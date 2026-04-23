-- Migración: Agregar campos GPS a tabla unidades
-- Ejecutar en Supabase SQL Editor del proyecto #2 (phwnapragajtdcgprpyp)

ALTER TABLE unidades 
ADD COLUMN IF NOT EXISTS gps_portal_url TEXT,
ADD COLUMN IF NOT EXISTS gps_usuario TEXT,
ADD COLUMN IF NOT EXISTS gps_password TEXT, -- encriptado AES-256
ADD COLUMN IF NOT EXISTS gps_device_id TEXT; -- IMEI o ID de la unidad en el portal

-- Comentarios para documentar
COMMENT ON COLUMN unidades.gps_portal_url IS 'URL del portal GPS del proveedor. Ej: https://monitoreo.logransat.mx';
COMMENT ON COLUMN unidades.gps_usuario IS 'Usuario de la cuenta espejo (solo esta unidad)';
COMMENT ON COLUMN unidades.gps_password IS 'Contraseña encriptada AES-256-CBC';
COMMENT ON COLUMN unidades.gps_device_id IS 'IMEI o ID interno de la unidad en el portal GPS';

-- RLS: solo el transportista dueño puede ver sus propias credenciales GPS
-- La empresa NUNCA accede directamente a esta tabla para GPS
-- Solo el API route /api/gps/location (server-side) accede

-- Verificar que RLS está activo en unidades
ALTER TABLE unidades ENABLE ROW LEVEL SECURITY;

-- Policy: transportista solo ve sus propias unidades
DROP POLICY IF EXISTS "transportista_own_units" ON unidades;
CREATE POLICY "transportista_own_units" ON unidades
  FOR ALL
  USING (
    transportista_id IN (
      SELECT id FROM transportistas WHERE user_id = auth.uid()
    )
  );
