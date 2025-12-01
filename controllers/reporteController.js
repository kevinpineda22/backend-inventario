import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// --- Controladores para Reportes ---

export const compararInventario = async (req, res) => {
  const { id: inventarioId } = req.params;
  const { sede } = req.query; // ✅ Agregar sede como query param

  try {
    // 1. Obtener el consecutivo del inventario
    const { data: inventario, error: invError } = await supabase
      .from('inventarios')
      .select('consecutivo')
      .eq('id', inventarioId)
      .single();
    if (invError) throw new Error("Inventario no encontrado.");
    const { consecutivo } = inventario;

    // 2. Obtener las cantidades TEÓRICAS del alcance
    const { data: productosTeoricos, error: prodError } = await supabase
      .from('productos')
      .select('item, descripcion, codigo_barras, cantidad')
      .eq('consecutivo', consecutivo)
      .eq('sede', sede); // ✅ Filtrar por sede
    if (prodError) throw prodError;

    // 3. Obtener los conteos REALES (Primer Conteo Total)
    const { data: detallesReales, error: detError } = await supabase
      .rpc('sumar_detalles_por_item', { inventario_uuid: inventarioId });
    if (detError) throw detError;

    // ✅ NUEVO: Obtener los conteos por ubicación
    const { data: detallesPorUbicacion, error: ubicError } = await supabase
      .from('detalles_inventario')
      .select('item_id_registrado, cantidad, ubicacion, inventario_zonas!inner(inventario_id)')
      .eq('inventario_zonas.inventario_id', inventarioId);
    if (ubicError) throw ubicError;

    // 4. Obtener los AJUSTES DE RE-CONTEO
    const { data: ajustesReconteo, error: ajustesError } = await supabase
      .from('ajustes_reconteo')
      .select('item_id, cantidad_nueva')
      .eq('consecutivo', consecutivo);
    if (ajustesError) throw ajustesError;


    // --- Mapear y combinar la información ---

    // Mapa 1: Primer Conteo Físico Total
    const mapaPrimerConteo = new Map(detallesReales.map(d => [String(d.item_id), d.total_contado]));

    // ✅ NUEVO: Mapa 2: Conteos por ubicación
    const conteoPorUbicacionMap = new Map();
    detallesPorUbicacion.forEach(detalle => {
      const itemId = String(detalle.item_id_registrado);
      const cantidad = parseFloat(detalle.cantidad) || 0;
      const ubicacion = detalle.ubicacion;

      if (!conteoPorUbicacionMap.has(itemId)) {
        conteoPorUbicacionMap.set(itemId, { punto_venta: 0, bodega: 0 });
      }
      const conteos = conteoPorUbicacionMap.get(itemId);
      if (ubicacion === 'punto_venta') {
        conteos.punto_venta += cantidad;
      } else if (ubicacion === 'bodega') {
        conteos.bodega += cantidad;
      }
    });

    // Mapa 3: Ajuste de Re-conteo (tomamos solo el último ajuste si hay varios, o el único)
    // Agrupamos en el servidor Node.js por simplicidad, usando el último registro.
    const mapaAjustes = ajustesReconteo.reduce((map, ajuste) => {
      // En un sistema real se buscaría el registro más reciente. Aquí simplemente sobrescribimos (last-one wins)
      map.set(String(ajuste.item_id), ajuste.cantidad_nueva);
      return map;
    }, new Map());


    // 5. Construir el reporte final con todas las columnas
    const comparacion = productosTeoricos.map(productoTeorico => {
      const itemStr = String(productoTeorico.item);
      const cantidadOriginal = parseFloat(productoTeorico.cantidad) || 0;

      // Primer Conteo Físico (Suma de detalles_inventario)
      const fisico_1er_conteo = parseFloat(mapaPrimerConteo.get(itemStr) || 0);

      // Segundo Conteo (Ajuste). Será null/undefined si no se re-contó.
      const segundo_conteo_ajuste = mapaAjustes.get(itemStr);

      // ✅ NUEVO: Obtener conteos por ubicación
      const conteosPorUbicacion = conteoPorUbicacionMap.get(itemStr) || { punto_venta: 0, bodega: 0 };

      // Conteo Final (El valor que se considerará para los reportes finales)
      const conteoFinal = (segundo_conteo_ajuste !== undefined) ? segundo_conteo_ajuste : fisico_1er_conteo;

      // ✅ CÁLCULO CLAVE: Diferencia vs. Primer Conteo (Lo que el Admin auditará inicialmente)
      const diferenciaPrimerConteo = fisico_1er_conteo - cantidadOriginal;

      return {
        item: itemStr,
        codigo_barras: productoTeorico.codigo_barras,
        descripcion: productoTeorico.descripcion,
        cantidad_original: cantidadOriginal, // Cant. Teórica

        // Nuevos campos para la tabla del Admin:
        fisico_1er_conteo: fisico_1er_conteo,
        segundo_conteo_ajuste: segundo_conteo_ajuste,
        conteo_final: conteoFinal, // El valor que se usa para determinar la diferencia final

        // ✅ NUEVO: Conteos por ubicación
        conteo_punto_venta: conteosPorUbicacion.punto_venta,
        conteo_bodega: conteosPorUbicacion.bodega,

        // La diferencia que el Admin quiere ver: Teórico vs 1er Conteo Físico
        diferencia_final: diferenciaPrimerConteo,
      };
    });

    res.json({ success: true, comparacion });
  } catch (error) {
    console.error("Error en compararInventario:", error);
    res.status(500).json({ success: false, message: "Error al comparar inventario: " + error.message });
  }
};

// --- NUEVO Endpoint para obtener el estado actual de la DB ---
export const getInventarioDetalle = async (req, res) => {
  try {
    console.log("🔄 Consultando inventarios...");
    const { data: inventarios, error: errorInv } = await supabase
      .from('inventarios')
      .select('id, consecutivo, descripcion, fecha_inicio, sede');

    if (errorInv) {
      console.error("❌ Error en inventarios:", errorInv);
      return res.status(500).json({ error: errorInv.message });
    }

    console.log("✅ Inventarios cargados:", inventarios.length);

    // ✅ NUEVO: Procesar cada inventario y obtener sus detalles con ubicación
    const detalle = await Promise.all(inventarios.map(async (inv) => {
      
      // 1. Fetch Productos for this inventory
      const { data: relacionados, error: errorProd } = await supabase
        .from('productos')
        .select('codigo_barras, descripcion, cantidad, item, grupo, bodega, conteo_cantidad, consecutivo, sede')
        .eq('consecutivo', inv.consecutivo)
        .eq('sede', inv.sede)
        .limit(10000); // Increased limit to ensure all products are fetched

      if (errorProd) {
         console.error(`❌ Error al obtener productos del inventario ${inv.consecutivo}:`, errorProd);
         return null;
      }

      // 2. Fetch Ajustes for this inventory
      const { data: ajustes, error: ajustesError } = await supabase
        .from('ajustes_reconteo')
        .select('consecutivo, item_id, cantidad_nueva')
        .eq('consecutivo', inv.consecutivo)
        .limit(5000);

      if (ajustesError) {
        console.error(`❌ Error al obtener ajustes del inventario ${inv.consecutivo}:`, ajustesError);
        return null;
      }
      
      // Create map for adjustments
      const ajustesMap = new Map();
      ajustes.forEach(ajuste => {
        ajustesMap.set(String(ajuste.item_id), ajuste.cantidad_nueva);
      });

      // 3. Obtener detalles_inventario para ESTE inventario específico
      const { data: detallesInventario, error: detallesError } = await supabase
        .from('detalles_inventario')
        .select('item_id_registrado, cantidad, ubicacion, inventario_zonas!inner(inventario_id)')
        .eq('inventario_zonas.inventario_id', inv.id)
        .limit(10000); // Increased limit

      if (detallesError) {
        console.error(`❌ Error al obtener detalles del inventario ${inv.consecutivo}:`, detallesError);
        return null;
      }

      // Crear mapa de conteos por ubicación para ESTE inventario
      const conteoPorUbicacionMap = new Map();
      detallesInventario.forEach(detalle => {
        const itemId = String(detalle.item_id_registrado);
        const cantidad = parseFloat(detalle.cantidad) || 0;
        const ubicacion = detalle.ubicacion;

        if (!conteoPorUbicacionMap.has(itemId)) {
          conteoPorUbicacionMap.set(itemId, { punto_venta: 0, bodega: 0 });
        }
        const conteos = conteoPorUbicacionMap.get(itemId);
        if (ubicacion === 'punto_venta') {
          conteos.punto_venta += cantidad;
        } else if (ubicacion === 'bodega') {
          conteos.bodega += cantidad;
        }
      });

      // Agregar segundo_conteo_ajuste y conteos por ubicación a cada producto
      const productosConAjustes = relacionados.map(producto => {
        const segundo_conteo_ajuste = ajustesMap.get(String(producto.item));
        
        // Obtener conteos por ubicación
        const conteosPorUbicacion = conteoPorUbicacionMap.get(String(producto.item)) || { punto_venta: 0, bodega: 0 };
        
        return {
          ...producto,
          segundo_conteo_ajuste,
          conteo_punto_venta: conteosPorUbicacion.punto_venta,
          conteo_bodega: conteosPorUbicacion.bodega
        };
      });

      return {
        nombre: `${inv.descripcion} (${inv.sede})`,
        descripcion: inv.descripcion,
        fecha: inv.fecha_inicio,
        consecutivo: inv.consecutivo,
        sede: inv.sede,
        productos: productosConAjustes,
        total_productos: productosConAjustes.length
      };
    }));

    console.log("✅ Detalle generado:", detalle.filter(d => d !== null).length);
    res.json(detalle.filter(d => d !== null));
  } catch (error) {
    console.error("❌ Error general:", error);
    res.status(500).json({ error: 'Error al obtener el detalle del inventario' });
  }
};

// ✅ FUNCIÓN REQUERIDA: Obtiene solo los productos con diferencia notable para re-conteo
export const obtenerDiferenciasNotables = async (req, res) => {
  const { consecutivo } = req.params;
  const { sede } = req.query; // ✅ Agregar sede como query param
  const UMBRAL_UNIDADES = 5;
  const UMBRAL_PORCENTAJE = 0.10;

  console.log(`[DEBUG] obtenerDiferenciasNotables - Consecutivo: ${consecutivo}, Sede: ${sede}`);

  try {
    // 1. Obtener el ID del inventario del consecutivo (necesario para la RPC)
    const { data: inventario, error: invError } = await supabase
      .from('inventarios')
      .select('id')
      .eq('consecutivo', consecutivo)
      .eq('sede', sede) // ✅ Filtrar por sede
      // Filtrar por estados que permitan el re-conteo
      .in('estado', ['activo', 'en_proceso', 'finalizada'])
      .single();

    if (invError) {
      console.log(`[DEBUG] Error al buscar inventario:`, invError);
      return res.status(404).json({ success: false, message: "Inventario activo/en proceso no encontrado con ese consecutivo." });
    }

    if (!inventario) {
      console.log(`[DEBUG] No se encontró inventario para consecutivo ${consecutivo} y sede ${sede}`);
      return res.status(404).json({ success: false, message: "Inventario activo/en proceso no encontrado con ese consecutivo." });
    }

    console.log(`[DEBUG] Inventario encontrado:`, inventario);
    const inventarioId = inventario.id;

    // 2. Obtener las cantidades TEÓRICAS (alcance)
    const { data: productosTeoricos, error: prodError } = await supabase
      .from('productos')
      .select('item, descripcion, cantidad')
      .eq('consecutivo', consecutivo)
      .eq('sede', sede); // ✅ Filtrar por sede
    if (prodError) throw prodError;

    // 3. Obtener los conteos REALES totales (usando tu RPC sumar_detalles_por_item)
    const { data: detallesReales, error: detError } = await supabase
      .rpc('sumar_detalles_por_item', { inventario_uuid: inventarioId });
    if (detError) throw detError;

    // Crear un mapa para los conteos reales (Físico)
    const mapaReal = new Map(detallesReales.map(d => [String(d.item_id), d.total_contado]));

    // 4. Calcular y filtrar las diferencias notables
    const diferenciasNotables = productosTeoricos.reduce((acc, productoTeorico) => {
      const itemStr = String(productoTeorico.item);
      const cantidadOriginal = parseFloat(productoTeorico.cantidad) || 0;
      const conteoTotal = parseFloat(mapaReal.get(itemStr) || 0);

      const diferenciaAbsoluta = Math.abs(conteoTotal - cantidadOriginal);
      const diferenciaNumerica = conteoTotal - cantidadOriginal;

      const porcentaje = cantidadOriginal > 0 ? (diferenciaAbsoluta / cantidadOriginal) : (diferenciaAbsoluta > 0 ? 1 : 0);

      // Aplicar la regla de 'Diferencia Notable'
      if (diferenciaAbsoluta >= UMBRAL_UNIDADES || porcentaje >= UMBRAL_PORCENTAJE) {
        acc.push({
          item_id: itemStr,
          descripcion: productoTeorico.descripcion,
          teorico: cantidadOriginal,
          fisico: conteoTotal,
          diferencia_unidades: diferenciaNumerica,
          diferencia_porcentaje: (porcentaje * 100).toFixed(2),
          // ✅ AÑADIMOS LA MAGNITUD ABSOLUTA PARA ORDENAR
          magnitud_error: diferenciaAbsoluta
        });
      }
      return acc;
    }, []);

    // ✅ NUEVO PASO: Ordenar por la magnitud_error de forma descendente (más grande primero)
    diferenciasNotables.sort((a, b) => b.magnitud_error - a.magnitud_error);

    res.json({ success: true, diferencias: diferenciasNotables });

  } catch (error) {
    console.error("Error en obtenerDiferenciasNotables:", error);
    res.status(500).json({ success: false, message: "Error al obtener diferencias notables: " + error.message });
  }
};