# Actualización: Selector de Ubicación (Punto de Venta / Bodega)

## 📋 Resumen de Cambios

Se agregó la funcionalidad para que los operarios puedan seleccionar si están haciendo el conteo en **Punto de Venta** o en **Bodega**. Este campo se captura en cada registro y puede cambiarse en cualquier momento durante el conteo sin necesidad de finalizar la zona.

## 🔧 Cambios Realizados

### 1. Frontend - Componentes Actualizados

#### ScannerInventario.jsx
- ✅ Agregado estado `ubicacionActual` (por defecto: "punto_venta")
- ✅ Agregado selector visual con opciones "🏪 Punto de Venta" y "📦 Bodega"
- ✅ El selector aparece cuando hay un inventario activo
- ✅ Se pasa la prop `ubicacion` a los componentes de escaneo (Camara, LectorScanner, BusquedaDescripcion)

#### Operario.jsx (CarnesFruverForm)
- ✅ Agregado estado `ubicacionActual`
- ✅ Agregado selector visible durante el escaneo de Carnes/Fruver
- ✅ Se pasa la prop `ubicacion` al componente CarneoFruverScanner
- ✅ Se resetea la ubicación al finalizar la zona

#### Componentes de Escaneo Actualizados
- ✅ **LectorScanner** (ScannerFisico.jsx): Acepta prop `ubicacion` y la envía en cada registro
- ✅ **CamaraScanner** (Camara.jsx): Acepta prop `ubicacion` y la envía en cada registro
- ✅ **BusquedaDescripcion**: Acepta prop `ubicacion` y la envía en cada registro
- ✅ **CarneoFruverScanner** (CarnesYfruver.jsx): Acepta prop `ubicacion` y la envía en cada registro

### 2. Backend - Controladores Actualizados

#### operarioController.js
- ✅ Función `registrarEscaneo`: Recibe el campo `ubicacion` del body
- ✅ Validación de valores permitidos: 'punto_venta' o 'bodega' (por defecto: 'punto_venta')
- ✅ Se inserta el campo `ubicacion` en la tabla `detalles_inventario`

#### CarnesYfruver.js
- ✅ Función `registrarProductoZonaActiva`: Recibe el campo `ubicacion` del body
- ✅ Validación de valores permitidos: 'punto_venta' o 'bodega' (por defecto: 'punto_venta')
- ✅ Se inserta el campo `ubicacion` en la tabla `registro_carnesYfruver`

## 🗄️ Actualización de Base de Datos Requerida

### ⚠️ IMPORTANTE: Ejecutar estos comandos en Supabase

Debes agregar la columna `ubicacion` a las siguientes tablas:

#### 1. Tabla: `detalles_inventario`
```sql
-- Agregar columna sin valor por defecto (permite NULL para registros antiguos)
ALTER TABLE detalles_inventario 
ADD COLUMN ubicacion TEXT CHECK (ubicacion IN ('punto_venta', 'bodega'));

-- Agregar comentario para documentación
COMMENT ON COLUMN detalles_inventario.ubicacion IS 'Ubicación donde se realizó el conteo: punto_venta o bodega. NULL para inventarios anteriores a esta funcionalidad';
```

#### 2. Tabla: `registro_carnesYfruver`
```sql
-- Agregar columna sin valor por defecto (permite NULL para registros antiguos)
ALTER TABLE registro_carnesYfruver 
ADD COLUMN ubicacion TEXT CHECK (ubicacion IN ('punto_venta', 'bodega'));

-- Agregar comentario para documentación
COMMENT ON COLUMN registro_carnesYfruver.ubicacion IS 'Ubicación donde se realizó el conteo: punto_venta o bodega. NULL para inventarios anteriores a esta funcionalidad';
```

### Verificación de las columnas
Después de ejecutar los comandos, verifica que las columnas se crearon correctamente:

```sql
-- Verificar columna en detalles_inventario
SELECT column_name, data_type, column_default 
FROM information_schema.columns 
WHERE table_name = 'detalles_inventario' AND column_name = 'ubicacion';

-- Verificar columna en registro_carnesYfruver
SELECT column_name, data_type, column_default 
FROM information_schema.columns 
WHERE table_name = 'registro_carnesYfruver' AND column_name = 'ubicacion';
```

## 🎯 Funcionalidad

### Comportamiento del Usuario
1. El operario elige un inventario y le da "Iniciar Conteo de Zona"
2. Aparece un selector con dos opciones:
   - 🏪 Punto de Venta
   - 📦 Bodega
3. El operario elige el modo de escaneo (Cámara, PDA, o Búsqueda)
4. **Durante el conteo**, el operario puede cambiar la ubicación en cualquier momento
5. Cada registro guardado incluye la ubicación seleccionada en ese momento
6. Al finalizar la zona, la ubicación se resetea a "Punto de Venta" para la próxima sesión

### Ejemplo de Uso
- Un operario comienza contando en **Bodega** usando el PDA
- Termina de contar los productos de bodega
- Cambia el selector a **Punto de Venta** (sin finalizar la zona)
- Continúa contando productos del punto de venta
- Todos los registros quedan marcados según la ubicación que tenía el selector al momento del registro

## 📊 Datos Guardados

Cada registro en `detalles_inventario` y `registro_carnesYfruver` ahora incluye:

**Registros nuevos (a partir de ahora):**
```json
{
  "inventario_id": 123,
  "zona_id": 456,
  "item_id": "789",
  "cantidad": 10,
  "ubicacion": "punto_venta", // ← NUEVO CAMPO (punto_venta o bodega)
  // ... otros campos
}
```

**Registros antiguos (antes de esta funcionalidad):**
```json
{
  "inventario_id": 100,
  "zona_id": 200,
  "item_id": "300",
  "cantidad": 5,
  "ubicacion": null, // ← NULL para inventarios anteriores
  // ... otros campos
}
```

## 🔍 Consultas de Ejemplo

### Ver conteos por ubicación
```sql
-- Cuántos productos se contaron en cada ubicación
SELECT 
  COALESCE(ubicacion, 'sin_especificar') as ubicacion, 
  COUNT(*) as total_registros, 
  SUM(cantidad) as cantidad_total
FROM detalles_inventario
WHERE inventario_id = [ID_INVENTARIO]
GROUP BY ubicacion;
```

### Ver registros de una zona específica por ubicación
```sql
SELECT ubicacion, item_id_registrado, cantidad, fecha_hora
FROM detalles_inventario
WHERE zona_id = [ID_ZONA]
ORDER BY ubicacion, fecha_hora;
```

## ✅ Checklist de Implementación

- [x] Actualizar ScannerInventario.jsx con selector de ubicación
- [x] Actualizar Operario.jsx (CarnesFruverForm) con selector de ubicación
- [x] Actualizar LectorScanner para enviar ubicación
- [x] Actualizar CamaraScanner para enviar ubicación
- [x] Actualizar BusquedaDescripcion para enviar ubicación
- [x] Actualizar CarneoFruverScanner para enviar ubicación
- [x] Actualizar operarioController.js para recibir y guardar ubicación
- [x] Actualizar CarnesYfruver.js para recibir y guardar ubicación
- [ ] **Ejecutar comandos SQL en Supabase** (PENDIENTE)
- [ ] Probar registro con ubicación "punto_venta"
- [ ] Probar registro con ubicación "bodega"
- [ ] Probar cambio de ubicación durante el conteo
- [ ] Verificar que los datos se guardan correctamente en la BD

## 🚨 Importante

**ANTES DE USAR EN PRODUCCIÓN:**
1. Ejecuta los comandos SQL en Supabase para agregar las columnas
2. Verifica que las columnas se crearon correctamente
3. Realiza pruebas completas en un entorno de desarrollo
4. Verifica que los registros antiguos mantienen `ubicacion = NULL` (sin valor)

## 📝 Notas Adicionales

- **Los registros antiguos tendrán `ubicacion = NULL`** (sin información de ubicación)
- **Los nuevos registros siempre tendrán** 'punto_venta' o 'bodega' (enviado desde el frontend)
- La validación en el backend garantiza que solo se acepten valores válidos ('punto_venta' o 'bodega')
- El frontend proporciona retroalimentación visual al cambiar la ubicación
- No es necesario finalizar la zona para cambiar de ubicación
- La ubicación se resetea automáticamente al finalizar una zona
- En consultas SQL, usa `COALESCE(ubicacion, 'sin_especificar')` para manejar valores NULL
