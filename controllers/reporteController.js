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

export const getDashboardInventarioCiclico = async (req, res) => {
    try {
        console.log("🔄 Obteniendo datos para el dashboard de inventarios cíclicos...");

        // 1. Obtener los inventarios de inventario_admin con la categoría 'ciclico'
        const { data: inventariosCiclicos, error: errorInv } = await supabase
            .from('inventario_admin')
            .select('consecutivo, nombre, categoria')
            .eq('categoria', 'ciclico');

        if (errorInv) {
            console.error("❌ Error al obtener inventarios cíclicos:", errorInv);
            return res.status(500).json({ success: false, message: errorInv.message });
        }

        const consecutivos = inventariosCiclicos.map(inv => inv.consecutivo);

        // 2. Obtener los datos de productos correspondientes a esos inventarios
        const { data: productos, error: errorProd } = await supabase
            .from('productos')
            .select('consecutivo, cantidad, conteo_cantidad')
            .in('consecutivo', consecutivos);

        if (errorProd) {
            console.error("❌ Error al obtener productos para inventarios cíclicos:", errorProd);
            return res.status(500).json({ success: false, message: errorProd.message });
        }

        // 3. Agrupar y calcular totales por inventario
        const dashboardData = inventariosCiclicos.map(inv => {
            const productosRelacionados = productos.filter(p => p.consecutivo === inv.consecutivo);
            
            const valorTeoricoTotal = productosRelacionados.reduce((sum, p) => sum + (p.cantidad || 0), 0);
            const valorRealTotal = productosRelacionados.reduce((sum, p) => sum + (p.conteo_cantidad || 0), 0);
            const diferenciaTotal = valorRealTotal - valorTeoricoTotal;

            return {
                id: inv.consecutivo, // Usamos el consecutivo como ID único
                nombre: inv.nombre,
                categoria: inv.categoria,
                valor_real_total: valorRealTotal,
                valor_teorico_total: valorTeoricoTotal,
                diferencia_total: diferenciaTotal
            };
        });

        console.log(`✅ Datos para dashboard de cíclicos generados. Registros: ${dashboardData.length}`);
        res.status(200).json({ success: true, data: dashboardData });

    } catch (error) {
        console.error("❌ Error en el dashboard de inventarios cíclicos:", error);
        res.status(500).json({ success: false, message: `Error interno del servidor: ${error.message}` });
    }
};