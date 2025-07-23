import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// --- Controladores para el Scanner del Operario ---

// Obtiene la lista de inventarios con estado 'activo'
export const obtenerInventariosActivos = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("inventarios")
      .select(`
        *,
        inventario_zonas (
          id,
          operario_email,
          descripcion_zona,
          estado,
          creada_en,
          detalles_inventario (
            cantidad,
            zona_id
          )
        )
      `)
      .eq("estado", "activo")
      .order("fecha_inicio", { ascending: false });

    if (error) throw error;

    const inventariosConConteo = data.map(inventario => {
      const zonasConConteo = inventario.inventario_zonas.map(zona => {
        const conteo_total = zona.detalles_inventario
          ? zona.detalles_inventario.reduce((sum, detalle) => sum + (parseFloat(detalle.cantidad) || 0), 0)
          : 0;
        return { ...zona, conteo_total };
      });
      return { ...inventario, inventario_zonas: zonasConConteo };
    });

    res.json({ success: true, inventarios: inventariosConConteo });
  } catch (error) {
    console.error("Error al obtener inventarios activos:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Obtiene los items permitidos para un inventario, una vez seleccionado
export const obtenerItemsPorConsecutivo = async (req, res) => {
  try {
    const { consecutivo } = req.params;
    if (!consecutivo) {
      return res.status(400).json({ success: false, message: "El consecutivo es requerido." });
    }
    
    const { data, error } = await supabase
      .from('productos')
      .select('item')
      .eq('consecutivo', consecutivo)
      .limit(5000); // El límite que ya tienes

    if (error) throw error;
    
    // ✅ CAMBIO CLAVE: Añadimos una propiedad "count" a la respuesta
    res.json({ 
      success: true, 
      items: data.map(i => String(i.item)),
      // Esta es nuestra "señal" para saber si el nuevo código está activo
      count: data.length 
    });

  } catch (error) {
    console.error("Error en obtenerItemsPorConsecutivo:", error);
    res.status(500).json({ success: false, message: `Error: ${error.message}` });
  }
};

// Registra un nuevo conteo en `detalles_inventario`
export const registrarEscaneo = async (req, res) => {
  try {
    // 1. Recibimos los datos del escaneo desde el frontend.
    const { inventario_id, zona_id, codigo_barras, cantidad, usuario_email, item_id } = req.body;

    // 2. Validamos que todos los datos necesarios estén presentes.
    if (!inventario_id || !zona_id || !cantidad || !usuario_email || !item_id) {
      return res.status(400).json({ success: false, message: "Datos incompletos para el registro. Falta el zona_id." });
    }

    // 3. Insertamos el registro del conteo directamente en la tabla de detalles.
    //    Ya no actualizamos la tabla 'productos' en este paso.
    const { error: insertError } = await supabase
      .from('detalles_inventario')
      .insert({
        inventario_id,
        zona_id,
        codigo_barras_escaneado: codigo_barras,
        item_id_registrado: item_id,
        cantidad,
        usuario: usuario_email
      });

    // Si hay un error al insertar, lo lanzamos para que sea capturado por el bloque catch.
    if (insertError) {
        throw new Error(`Error al insertar en historial: ${insertError.message}`);
    }

    // 4. Enviamos una respuesta de éxito.
    res.json({ success: true, message: "Registro de conteo exitoso" });

  } catch (error) {
    console.error("Error completo en registrarEscaneo:", error);
    res.status(500).json({ success: false, message: `Error en el servidor: ${error.message}` });
  }
};


export const obtenerHistorialInventario = async (req, res) => {
  const { inventario_id } = req.params;
  try {
    const { data, error } = await supabase
      .from("detalles_inventario")
      .select(`
        id,
        cantidad,
        fecha_hora,
        codigo_barras_escaneado,
        item_id_registrado,
        zona_id, 
        maestro_items!detalles_inventario_item_id_registrado_fkey(descripcion)
      `)
      .eq("inventario_id", inventario_id)
      .order("fecha_hora", { ascending: false });

    if (error) throw error;

    const historialFormateado = data.map(d => ({
      id: d.id,
      cantidad: d.cantidad,
      fecha_hora: d.fecha_hora,
      zona_id: d.zona_id,
      producto: {
        descripcion: d.maestro_items?.descripcion || 'Descripción no encontrada',
        codigo_barras: d.codigo_barras_escaneado || 'N/A',
        item: d.item_id_registrado || 'N/A'
      }
    }));

    res.json({ success: true, historial: historialFormateado || [] });
  } catch (error) {
    console.error("Error en obtenerHistorialInventario:", error);
    res.status(500).json({ success: false, message: `Error: ${error.message}` });
  }
};

// Elimina un registro de escaneo específico
export const eliminarDetalleInventario = async (req, res) => {
  try {
    // 1. Obtenemos el ID del registro a eliminar desde los parámetros de la URL.
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ success: false, message: "Se requiere el ID del registro." });
    }

    // 2. Eliminamos el registro directamente de la tabla de detalles.
    //    Ya no necesitamos restar de la tabla 'productos' porque esa suma
    //    solo ocurrirá cuando el administrador apruebe la zona.
    const { error: deleteError } = await supabase
      .from('detalles_inventario')
      .delete()
      .eq('id', id);

    // Si hay un error al eliminar, lo lanzamos.
    if (deleteError) {
        throw deleteError;
    }

    // 3. Enviamos una respuesta de éxito.
    res.json({ success: true, message: "Registro eliminado correctamente." });

  } catch (error) {
    console.error("Error en eliminarDetalleInventario:", error);
    res.status(500).json({ success: false, message: `Error en el servidor: ${error.message}` });
  }
};

// Asigna un inventario a un operario
export const asignarInventario = async (req, res) => {
  try {
    const { inventarioId } = req.params;
    const { operario_email } = req.body;

    if (!inventarioId || !operario_email) {
      return res.status(400).json({ success: false, message: "Faltan datos para la asignación." });
    }

    // Actualizamos el registro para asignar el operario, PERO SIN CAMBIAR EL ESTADO
    const { data, error } = await supabase
      .from('inventarios')
      .update({
        operario_email: operario_email
        // La línea "estado: 'en_proceso'" ha sido eliminada.
      })
      .eq('id', inventarioId)
      .select()
      .single();

    if (error) throw error;

    res.json({ success: true, inventario: data });

  } catch (error) {
    console.error("Error en asignarInventario:", error);
    res.status(500).json({ success: false, message: `Error: ${error.message}` });
  }
};

export const obtenerProductosPorConsecutivo = async (req, res) => {
  try {
    const { consecutivo } = req.params;
    if (!consecutivo) {
      return res.status(400).json({ success: false, message: "El consecutivo es requerido." });
    }

    const { data, error } = await supabase
      .from('productos')
      .select('item, descripcion, codigo_barras')
      .eq('consecutivo', consecutivo);

    if (error) throw error;

    // Asegurar que codigo_barras sea null si es vacío o solo espacios
    const productos = data.map(producto => ({
      item: String(producto.item), // Asegurar texto para item
      descripcion: producto.descripcion,
      codigo_barras: producto.codigo_barras && producto.codigo_barras.trim() !== "" ? producto.codigo_barras.trim() : null
    }));

    console.log("Productos devueltos:", productos.slice(0, 5)); // Depuración
    res.json({ success: true, productos });
  } catch (error) {
    console.error("Error en obtenerProductosPorConsecutivo:", error);
    res.status(500).json({ success: false, message: `Error: ${error.message}` });
  }
};

// ✅ NUEVO: Crea una sesión de zona para un operario dentro de un inventario
export const iniciarSesionDeZona = async (req, res) => {
  try {
    const { inventarioId, operario_email, descripcion_zona, foto_url } = req.body;

    if (!inventarioId || !operario_email) {
      return res.status(400).json({ success: false, message: "Faltan datos para iniciar la sesión de zona." });
    }

    const { data, error } = await supabase
      .from('inventario_zonas')
      .insert({
        inventario_id: inventarioId,
        operario_email,
        descripcion_zona,
        foto_zona_url: foto_url
      })
      .select('id') // Devolvemos el ID de la nueva zona creada
      .single();

    if (error) throw error;

    res.json({ success: true, zonaId: data.id });

  } catch (error) {
    console.error("Error en iniciarSesionDeZona:", error);
    res.status(500).json({ success: false, message: `Error: ${error.message}` });
  }
};

// ✅ NUEVO: Permite a un operario marcar su sesión de zona como finalizada
export const finalizarSesionDeZona = async (req, res) => {
  try {
    const { zonaId } = req.params;
    if (!zonaId) return res.status(400).json({ success: false, message: "Se requiere el ID de la zona." });
    const { data, error } = await supabase.from('inventario_zonas').update({ estado: 'finalizada' }).eq('id', zonaId).select().single();
    if (error) throw error;
    res.json({ success: true, message: `Zona ${data.descripcion_zona} finalizada.` });
  } catch (error) {
    res.status(500).json({ success: false, message: `Error: ${error.message}` });
  }
};

// ✅ NUEVO: Busca una sesión de zona activa para un operario específico
export const obtenerZonaActiva = async (req, res) => {
  try {
    const { email } = req.params;
    if (!email) {
      return res.status(400).json({ success: false, message: "Se requiere el email del operario." });
    }

    // Buscamos en la tabla de zonas y traemos la información del inventario padre
    const { data, error } = await supabase
      .from('inventario_zonas')
      .select(`
        id, 
        descripcion_zona,
        inventario:inventarios (id, descripcion, consecutivo)
      `)
      .eq('operario_email', email)
      .eq('estado', 'en_proceso') // Solo buscamos las que no se han finalizado
      .limit(1)
      .single();

    // Si no encuentra nada (código PGRST116), no es un error, simplemente no hay sesión activa.
    if (error && error.code !== 'PGRST116') throw error;

    res.json({ success: true, zonaActiva: data });

  } catch (error) {
    console.error("Error en obtenerZonaActiva:", error);
    res.status(500).json({ success: false, message: `Error: ${error.message}` });
  }
};