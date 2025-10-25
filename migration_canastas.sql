-- Script SQL para agregar columnas de desglose de canastas a la tabla registro_carnesYfruver
-- Ejecutar en Supabase SQL Editor

-- Agregar columnas para desglose de canastas (compatibles con la estructura existente)
ALTER TABLE registro_carnesYfruver
ADD COLUMN IF NOT EXISTS cantidad_total_ingresada NUMERIC(10, 2),
ADD COLUMN IF NOT EXISTS canas_2kg INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS canasta_1_8kg INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS canasta_1_6kg INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS custom_qty INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS custom_weight NUMERIC(10, 2) DEFAULT 0;

-- Crear índices para las nuevas columnas (opcional, para mejor rendimiento)
CREATE INDEX IF NOT EXISTS idx_cyf_canas_2kg ON registro_carnesYfruver USING btree (canas_2kg) TABLESPACE pg_default;
CREATE INDEX IF NOT EXISTS idx_cyf_canasta_1_8kg ON registro_carnesYfruver USING btree (canasta_1_8kg) TABLESPACE pg_default;
CREATE INDEX IF NOT EXISTS idx_cyf_canasta_1_6kg ON registro_carnesYfruver USING btree (canasta_1_6kg) TABLESPACE pg_default;

-- Verificar que las columnas se agregaron correctamente
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'registro_carnesYfruver'
AND column_name IN ('cantidad_total_ingresada', 'canas_2kg', 'canasta_1_8kg', 'canasta_1_6kg', 'custom_qty', 'custom_weight')
ORDER BY column_name;