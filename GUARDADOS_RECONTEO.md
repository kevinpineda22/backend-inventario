# Sistema de Guardados Temporales para Reconteo

## 📋 Resumen

Permite a los operarios guardar conteos parciales por ubicación (Punto de Venta / Bodega) antes de registrar el ajuste final. Los guardados se pueden editar o eliminar.

## 🗄️ Paso 1: Crear Tabla en Supabase

### Ejecutar este SQL en Supabase:

```sql
-- Crear tabla para guardados temporales de reconteo
CREATE TABLE IF NOT EXISTS guardados_reconteo (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  consecutivo TEXT NOT NULL,
  item_id TEXT NOT NULL,
  ubicacion TEXT NOT NULL CHECK (ubicacion IN ('punto_venta', 'bodega')),
  cantidad DECIMAL(10, 2) NOT NULL DEFAULT 0,
  operario_email TEXT NOT NULL,
  zona_descripcion TEXT, -- Descripción opcional de dónde se encontró (ej: "Estante 3")
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
COMMENT ON COLUMN guardados_reconteo.zona_descripcion IS 'Descripción opcional del lugar específico donde se encontró';

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

### Verificar que la tabla se creó:

```sql
SELECT table_name, column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'guardados_reconteo'
ORDER BY ordinal_position;
```

## 🔄 Flujo de Uso

### 1. Guardar Conteo Temporal
```
Operario ve producto con diferencia
↓
Selecciona ubicación (PV o Bodega)
↓
Ingresa cantidad encontrada
↓
Da clic en "Guardar"
↓
Se guarda en guardados_reconteo
```

### 2. Ver Guardados
```
Al abrir modal de producto:
- Muestra tabla con guardados previos
- Columnas: Ubicación | Cantidad | Zona | Fecha
- Permite editar o eliminar cada guardado
```

### 3. Registrar Ajuste Final
```
Operario revisa todos los guardados
↓
Verifica totales: PV + Bodega
↓
Da clic en "Registrar Ajuste"
↓
Backend suma todos los guardados
↓
Registra ajuste en ajustes_reconteo
↓
Elimina guardados temporales de ese item
```

## 📊 Ejemplo de Uso

### Escenario:
Item: 12345 tiene diferencia de -100 unidades

#### Paso 1: Primer guardado
- Ubicación: **Bodega**
- Cantidad: **50**
- Zona: "Estante superior"
- **Guardar** → ID: uuid-1

#### Paso 2: Segundo guardado
- Ubicación: **Punto de Venta**
- Cantidad: **30**
- Zona: "Exhibidor principal"
- **Guardar** → ID: uuid-2

#### Paso 3: Tercer guardado
- Ubicación: **Bodega**
- Cantidad: **20**
- Zona: "Estante inferior"
- **Guardar** → ID: uuid-3

#### Vista de Guardados:
| Ubicación | Cantidad | Zona | Acciones |
|-----------|----------|------|----------|
| Bodega | 50 | Estante superior | Editar / Eliminar |
| Punto de Venta | 30 | Exhibidor principal | Editar / Eliminar |
| Bodega | 20 | Estante inferior | Editar / Eliminar |

**Total Bodega:** 70
**Total Punto de Venta:** 30
**TOTAL A REGISTRAR:** 100

#### Paso 4: Registrar Ajuste
- Se suma: 70 + 30 = 100
- Se registra en `ajustes_reconteo`
- Se eliminan los 3 guardados temporales

## 🛠️ Endpoints del Backend

### 1. POST /api/operario/guardar-reconteo-temporal
**Request:**
```json
{
  "consecutivo": "123",
  "item_id": "12345",
  "ubicacion": "bodega",
  "cantidad": 50,
  "operario_email": "operario@merka.com",
  "zona_descripcion": "Estante superior"
}
```

**Response:**
```json
{
  "success": true,
  "guardado": {
    "id": "uuid-...",
    "consecutivo": "123",
    "item_id": "12345",
    "ubicacion": "bodega",
    "cantidad": 50,
    "zona_descripcion": "Estante superior"
  }
}
```

### 2. GET /api/operario/guardados-reconteo/:consecutivo/:item_id
**Response:**
```json
{
  "success": true,
  "guardados": [
    {
      "id": "uuid-1",
      "ubicacion": "bodega",
      "cantidad": 50,
      "zona_descripcion": "Estante superior",
      "created_at": "2025-01-10T10:30:00Z"
    },
    {
      "id": "uuid-2",
      "ubicacion": "punto_venta",
      "cantidad": 30,
      "zona_descripcion": "Exhibidor",
      "created_at": "2025-01-10T11:00:00Z"
    }
  ],
  "totales": {
    "bodega": 70,
    "punto_venta": 30,
    "total": 100
  }
}
```

### 3. PUT /api/operario/guardado-reconteo/:id
**Request:**
```json
{
  "cantidad": 55,
  "zona_descripcion": "Estante superior actualizado"
}
```

### 4. DELETE /api/operario/guardado-reconteo/:id
**Response:**
```json
{
  "success": true,
  "message": "Guardado eliminado"
}
```

### 5. POST /api/operario/registrar-ajuste-reconteo (MODIFICADO)
**Request:**
```json
{
  "consecutivo": "123",
  "item_id": "12345",
  "operario_email": "operario@merka.com",
  "sede": "PV001"
}
```

**Lógica:**
1. Busca todos los guardados de ese item
2. Suma las cantidades (bodega + punto_venta)
3. Registra el ajuste con el total
4. Elimina los guardados temporales

## 🎨 UI en ReconteoDiferencias.jsx

### Modal Actualizado:

```
┌────────────────────────────────────────┐
│ Ajuste de Re-conteo                    │
│                                        │
│ Item: 12345 - Producto X               │
│ Diferencia Actual: -100                │
│                                        │
│ ┌────────────────────────────────┐    │
│ │  📍 Ubicación:  [Bodega ▼]     │    │
│ └────────────────────────────────┘    │
│                                        │
│ ┌────────────────────────────────┐    │
│ │  Cantidad: [____50____]        │    │
│ └────────────────────────────────┘    │
│                                        │
│ ┌────────────────────────────────┐    │
│ │  Zona: [Estante superior]      │    │
│ └────────────────────────────────┘    │
│                                        │
│ [💾 Guardar]                           │
│                                        │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━    │
│ Guardados Previos:                     │
│                                        │
│ ┌──────────────────────────────────┐  │
│ │ 📦 Bodega: 50 (Estante superior) │  │
│ │               [✏️ Editar][🗑️ Eliminar]│
│ ├──────────────────────────────────┤  │
│ │ 🏪 PV: 30 (Exhibidor principal)  │  │
│ │               [✏️ Editar][🗑️ Eliminar]│
│ ├──────────────────────────────────┤  │
│ │ 📦 Bodega: 20 (Estante inferior) │  │
│ │               [✏️ Editar][🗑️ Eliminar]│
│ └──────────────────────────────────┘  │
│                                        │
│ Total Bodega: 70                       │
│ Total PV: 30                           │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━    │
│ TOTAL A REGISTRAR: 100                 │
│                                        │
│ [✅ Registrar Ajuste Final] [❌ Cerrar]│
└────────────────────────────────────────┘
```

## ✅ Checklist de Implementación

- [ ] Ejecutar script SQL en Supabase
- [ ] Crear endpoints backend (5 funciones)
- [ ] Actualizar UI de ReconteoDiferencias.jsx
- [ ] Agregar selector de ubicación
- [ ] Agregar campo de zona/descripción
- [ ] Agregar botón Guardar
- [ ] Mostrar tabla de guardados previos
- [ ] Implementar edición de guardados
- [ ] Implementar eliminación de guardados
- [ ] Actualizar lógica de Registrar Ajuste
- [ ] Mostrar totales por ubicación
- [ ] Probar flujo completo

## 🚨 Importante

1. Los guardados son **temporales** y se eliminan al registrar el ajuste final
2. Un operario puede tener múltiples guardados del mismo item en diferentes ubicaciones
3. Los totales se calculan automáticamente (backend y frontend)
4. La tabla de guardados es **independiente** de `ajustes_reconteo` (tabla final)
