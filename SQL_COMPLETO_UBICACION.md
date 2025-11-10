# 📋 Scripts SQL Completos - Sistema de Ubicación y Guardados Temporales

## ⚠️ IMPORTANTE: Ejecutar en Supabase en el siguiente orden

---

## 1️⃣ Agregar Columna `ubicacion` a Tablas Existentes

### Tabla: `detalles_inventario`
```sql
-- Agregar columna ubicacion (permite NULL para registros antiguos)
ALTER TABLE detalles_inventario 
ADD COLUMN ubicacion TEXT CHECK (ubicacion IN ('punto_venta', 'bodega'));

-- Agregar comentario
COMMENT ON COLUMN detalles_inventario.ubicacion IS 'Ubicación donde se realizó el conteo: punto_venta o bodega. NULL para inventarios anteriores a esta funcionalidad';
```

### Tabla: `registro_carnesYfruver` (con Y mayúscula)
```sql
-- Agregar columna ubicacion (permite NULL para registros antiguos)
ALTER TABLE "registro_carnesYfruver" 
ADD COLUMN ubicacion TEXT CHECK (ubicacion IN ('punto_venta', 'bodega'));

-- Agregar comentario
COMMENT ON COLUMN "registro_carnesYfruver".ubicacion IS 'Ubicación donde se realizó el conteo: punto_venta o bodega. NULL para inventarios anteriores a esta funcionalidad';
```

---

## 2️⃣ Agregar Columna `sede` a Tabla de Ajustes

### Tabla: `ajustes_reconteo`
```sql
-- Agregar columna sede
ALTER TABLE ajustes_reconteo 
ADD COLUMN sede TEXT;

-- Agregar comentario
COMMENT ON COLUMN ajustes_reconteo.sede IS 'Sede donde se realizó el ajuste de reconteo';
```

---

## 3️⃣ Crear Tabla `guardados_reconteo` (Guardados Temporales)

```sql
-- Crear tabla para guardados temporales de reconteo
CREATE TABLE IF NOT EXISTS guardados_reconteo (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  consecutivo TEXT NOT NULL,
  item_id TEXT NOT NULL,
  ubicacion TEXT NOT NULL CHECK (ubicacion IN ('punto_venta', 'bodega')),
  cantidad DECIMAL(10, 2) NOT NULL DEFAULT 0,
  operario_email TEXT NOT NULL,
  zona_descripcion TEXT, -- Campo opcional (no se usa en la UI actual)
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para mejorar rendimiento
CREATE INDEX idx_guardados_reconteo_consecutivo ON guardados_reconteo(consecutivo);
CREATE INDEX idx_guardados_reconteo_item_id ON guardados_reconteo(item_id);
CREATE INDEX idx_guardados_reconteo_operario ON guardados_reconteo(operario_email);
CREATE INDEX idx_guardados_reconteo_ubicacion ON guardados_reconteo(ubicacion);

-- Comentarios para documentación
COMMENT ON TABLE guardados_reconteo IS 'Almacena conteos parciales temporales antes del ajuste final en reconteos';
COMMENT ON COLUMN guardados_reconteo.ubicacion IS 'Ubicación donde se encontró el producto: punto_venta o bodega';
COMMENT ON COLUMN guardados_reconteo.zona_descripcion IS 'Descripción opcional del lugar específico donde se encontró (NO SE USA EN LA UI ACTUAL)';

-- Función para actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger para actualizar updated_at
CREATE TRIGGER update_guardados_reconteo_updated_at 
BEFORE UPDATE ON guardados_reconteo 
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

---

## ✅ Verificación de Columnas

Después de ejecutar los scripts, verifica que todo se creó correctamente:

```sql
-- 1. Verificar columna ubicacion en detalles_inventario
SELECT column_name, data_type, column_default, is_nullable
FROM information_schema.columns 
WHERE table_name = 'detalles_inventario' AND column_name = 'ubicacion';

-- 2. Verificar columna ubicacion en registro_carnesYfruver
SELECT column_name, data_type, column_default, is_nullable
FROM information_schema.columns 
WHERE table_name = 'registro_carnesYfruver' AND column_name = 'ubicacion';

-- 3. Verificar columna sede en ajustes_reconteo
SELECT column_name, data_type, column_default, is_nullable
FROM information_schema.columns 
WHERE table_name = 'ajustes_reconteo' AND column_name = 'sede';

-- 4. Verificar tabla guardados_reconteo completa
SELECT table_name, column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'guardados_reconteo'
ORDER BY ordinal_position;

-- 5. Verificar índices de guardados_reconteo
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'guardados_reconteo';
```

---

## 📊 Consultas de Prueba (Después de Implementar)

### Ver registros con ubicación en inventarios cíclicos
```sql
SELECT 
  item_id_registrado,
  cantidad,
  COALESCE(ubicacion, 'sin_especificar') as ubicacion,
  fecha_hora
FROM detalles_inventario
WHERE inventario_id = [TU_INVENTARIO_ID]
ORDER BY fecha_hora DESC
LIMIT 20;
```

### Ver registros con ubicación en Carnes/Fruver
```sql
SELECT 
  item_id,
  cantidad,
  COALESCE(ubicacion, 'sin_especificar') as ubicacion,
  fecha_registro
FROM "registro_carnesYfruver"
WHERE id_zona = [TU_ZONA_ID]
ORDER BY fecha_registro DESC
LIMIT 20;
```

### Ver guardados temporales de un operario
```sql
SELECT 
  item_id,
  ubicacion,
  cantidad,
  zona_descripcion,
  created_at
FROM guardados_reconteo
WHERE operario_email = 'operario@merka.com.co'
  AND consecutivo = 'CONSECUTIVO_INVENTARIO'
ORDER BY created_at DESC;
```

### Ver totales por ubicación en guardados
```sql
SELECT 
  item_id,
  ubicacion,
  SUM(cantidad) as total_cantidad,
  COUNT(*) as num_guardados
FROM guardados_reconteo
WHERE consecutivo = 'CONSECUTIVO_INVENTARIO'
GROUP BY item_id, ubicacion
ORDER BY item_id, ubicacion;
```

---

## 🎯 Resumen de Cambios

### ✅ Tablas Modificadas:
1. **detalles_inventario** → Agregada columna `ubicacion` (NULL permitido)
2. **registro_carnesYfruver** → Agregada columna `ubicacion` (NULL permitido)
3. **ajustes_reconteo** → Agregada columna `sede`

### ✅ Tablas Nuevas:
1. **guardados_reconteo** → Nueva tabla para guardados temporales con ubicación

### ✅ Comportamiento:
- **Registros antiguos**: `ubicacion = NULL` (sin información)
- **Registros nuevos**: `ubicacion = 'punto_venta'` o `'bodega'`
- **Guardados temporales**: Se crean con ubicación, se eliminan al registrar ajuste final
- **Ajustes de reconteo**: Ahora guardan la sede donde se realizó el ajuste

---

## 📝 Notas Importantes

1. **No afecta registros existentes**: Los inventarios antiguos mantendrán `ubicacion = NULL`
2. **Validación en backend**: Solo acepta valores 'punto_venta' o 'bodega'
3. **Frontend listo**: Todos los componentes ya envían la ubicación
4. **Backend actualizado**: Todos los controladores están preparados
5. **Sin downtime**: Los scripts son compatibles con datos existentes

---

## 🚀 Siguiente Paso

Una vez ejecutes estos scripts en Supabase:
1. ✅ Verifica con las consultas de verificación
2. ✅ Prueba crear un nuevo inventario
3. ✅ Prueba cambiar la ubicación durante el conteo
4. ✅ Prueba el módulo de reconteo con guardados temporales
5. ✅ Verifica que los datos se guardan correctamente

---

**¿Listo para ejecutar?** Copia y pega estos scripts en el SQL Editor de Supabase en el orden indicado. 🎉
