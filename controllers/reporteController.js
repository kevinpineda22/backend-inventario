import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// --- Controladores para Reportes ---

export const compararInventario = async (req, res) => {
  const { id: inventarioId } = req.params;

  try {
    // 1. Obtener el consecutivo del inventario
    const { data: inventario, error: invError } = await supabase
      .from('inventarios')
      .select('consecutivo')
      .eq('id', inventarioId)
      .single();
    if (invError) throw new Error("Inventario no encontrado.");
    const { consecutivo } = inventario;

    // 2. Obtener las cantidades TEÓRICAS del alcance (Excel del admin)
    const { data: productosTeoricos, error: prodError } = await supabase
      .from('productos')
      .select('item, descripcion, codigo_barras, cantidad')
      .eq('consecutivo', consecutivo);
    if (prodError) throw prodError;

    // 3. Llamar a nuestra función de la BD para obtener los conteos REALES
    // Esta función ahora es mucho más simple.
    const { data: detallesReales, error: detError } = await supabase
      .rpc('sumar_detalles_por_item', { inventario_uuid: inventarioId });
    if (detError) throw detError;

    // Creamos un mapa para los conteos reales, usando el NÚMERO del item como clave.
    const mapaReal = new Map(detallesReales.map(d => [parseInt(d.item_id, 10), d.total_contado]));

    // 4. Construir el reporte final uniendo toda la información
    const comparacion = productosTeoricos.map(productoTeorico => {
      const itemNum = parseInt(productoTeorico.item, 10);
      const cantidadOriginal = parseFloat(productoTeorico.cantidad) || 0;
      const conteoTotal = parseFloat(mapaReal.get(itemNum) || 0);

      return {
        item: productoTeorico.item,
        codigo_barras: productoTeorico.codigo_barras,
        descripcion: productoTeorico.descripcion,
        cantidad_original: cantidadOriginal,
        conteo_total: conteoTotal,
        diferencia: conteoTotal - cantidadOriginal,
      };
    });

    res.json({ success: true, comparacion });
  } catch (error) {
    console.error("Error en compararInventario:", error);
    res.status(500).json({ success: false, message: "Error al comparar inventario: " + error.message });
  }
};

export const getInventarioDetalle = async (req, res) => {
  try {
    console.log("🔄 Consultando inventario_admin...");
    const { data: inventarios, error: errorInv } = await supabase
      .from('inventario_admin')
      .select('*');

    if (errorInv) {
      console.error("❌ Error en inventario_admin:", errorInv);
      return res.status(500).json({ error: errorInv.message });
    }

    console.log("✅ Inventarios cargados:", inventarios.length);

    console.log("🔄 Consultando productos...");
    const { data: productos, error: errorProd } = await supabase
      .from('productos')
      .select('codigo_barras, descripcion, cantidad, item, grupo, bodega, conteo_cantidad, consecutivo');

    if (errorProd) {
      console.error("❌ Error en productos:", errorProd);
      return res.status(500).json({ error: errorProd.message });
    }

    console.log("✅ Productos cargados:", productos.length);

    const detalle = inventarios.map(inv => {
      const relacionados = productos.filter(prod => prod.consecutivo === inv.consecutivo);
      return {
        nombre: inv.nombre,
        descripcion: inv.descripcion,
        fecha: inv.fecha,
        consecutivo: inv.consecutivo,
        productos: relacionados,
        total_productos: relacionados.length
      };
    });

    console.log("✅ Detalle generado:", detalle.length);
    res.json(detalle);
  } catch (error) {
    console.error("❌ Error general:", error);
    res.status(500).json({ error: 'Error al obtener el detalle del inventario' });
  }
};

// ✅ FUNCIÓN REQUERIDA: Obtiene solo los productos con diferencia notable para re-conteo
export const obtenerDiferenciasNotables = async (req, res) => {
    const { consecutivo } = req.params;
    const UMBRAL_UNIDADES = 5; 
    const UMBRAL_PORCENTAJE = 0.10; 

    try {
        // 1. Obtener el ID del inventario del consecutivo (necesario para la RPC)
        const { data: inventario, error: invError } = await supabase
          .from('inventarios')
          .select('id')
          .eq('consecutivo', consecutivo)
          // Filtrar por estados que permitan el re-conteo
          .in('estado', ['activo', 'en_proceso', 'finalizada']) 
          .single();
          
        if (invError || !inventario) {
            return res.status(404).json({ success: false, message: "Inventario activo/en proceso no encontrado con ese consecutivo." });
        }
        const inventarioId = inventario.id;

        // 2. Obtener las cantidades TEÓRICAS (alcance)
        const { data: productosTeoricos, error: prodError } = await supabase
          .from('productos')
          .select('item, descripcion, cantidad')
          .eq('consecutivo', consecutivo);
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
                    diferencia_porcentaje: (porcentaje * 100).toFixed(2)
                });
            }
            return acc;
        }, []);

        res.json({ success: true, diferencias: diferenciasNotables });
        
    } catch (error) {
        console.error("Error en obtenerDiferenciasNotables:", error);
        res.status(500).json({ success: false, message: "Error al obtener diferencias notables: " + error.message });
    }
};