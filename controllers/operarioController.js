import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// --- Controladores para el Scanner del Operario ---

// Obtiene la lista de inventarios con estado 'activo'
export const obtenerInventariosActivos = async (req, res) => {
  try {
    const { data, error } = await supabase.from('inventarios').select('id, descripcion, categoria, consecutivo').eq('estado', 'activo').order('fecha_inicio', { ascending: false });
    if (error) throw error;
    res.json({ success: true, inventarios: data });
  } catch (error) {
    res.status(500).json({ success: false, message: `Error: ${error.message}` });
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
      .eq('consecutivo', consecutivo);
    if (error) throw error;
    console.log("Items devueltos:", data.map(i => i.item)); // Depuración
    res.json({ success: true, items: data.map(i => String(i.item)) }); // Asegurar texto
  } catch (error) {
    console.error("Error en obtenerItemsPorConsecutivo:", error);
    res.status(500).json({ success: false, message: `Error: ${error.message}` });
  }
};

// Registra un nuevo conteo en `detalles_inventario`
export const registrarEscaneo = async (req, res) => {
  try {
    // 1. Ahora también esperamos recibir el 'zona_id' desde el frontend.
    const { inventario_id, zona_id, codigo_barras, cantidad, usuario_email, item_id } = req.body;
    
    // 2. La validación ahora incluye el 'zona_id'.
    if (!inventario_id || !zona_id || !cantidad || !usuario_email || !item_id) {
      return res.status(400).json({ success: false, message: "Datos incompletos para el registro. Falta el zona_id." });
    }
    
    // 3. Obtenemos el consecutivo del inventario para la actualización del conteo.
    const { data: inventarioData, error: inventarioError } = await supabase
        .from('inventarios')
        .select('consecutivo')
        .eq('id', inventario_id)
        .single();
    if (inventarioError) throw new Error("No se pudo encontrar el inventario activo.");

    // 4. Actualizamos el conteo en vivo en la tabla 'productos'.
    const { error: rpcError } = await supabase.rpc('incrementar_conteo_producto', {
      cantidad_a_sumar: cantidad,
      item_a_actualizar: item_id,
      consecutivo_inventario: inventarioData.consecutivo
    });
    if (rpcError) throw new Error(`Error al actualizar conteo: ${rpcError.message}`);
    
    // 5. Insertamos el registro en el historial, AHORA INCLUYENDO EL ZONA_ID.
    const { error: insertError } = await supabase
      .from('detalles_inventario')
      .insert({ 
        inventario_id, 
        zona_id, // <-- Guardamos la referencia a la zona
        codigo_barras_escaneado: codigo_barras, 
        item_id_registrado: item_id, 
        cantidad, 
        usuario: usuario_email 
      });
    if (insertError) throw new Error(`Error al insertar en historial: ${insertError.message}`);

    res.json({ success: true, message: "Registro exitoso" });
  } catch (error) {
    console.error("Error completo en registrarConteo:", error);
    res.status(500).json({ success: false, message: `Error en el servidor: ${error.message}` });
  }
};

//Endpoint para registrar escaneo de carnes y fruver en detalles_inventario
export const registrarEscaneoCarnesFruver = async (req, res) => {
  try {
    // 1. Recibir datos del frontend con nombres correctos
    const { inventario_id, codigo_barras_escaneado, cantidad, usuario_email, item_id_registrado } = req.body;

    // 2. Validar datos requeridos
    if (!inventario_id || !cantidad || !usuario_email || !item_id_registrado) {
      return res.status(400).json({ 
        success: false, 
        message: "Datos incompletos para el registro. Se requieren inventario_id, cantidad, usuario_email e item_id_registrado." 
      });
    }

    // 3. Validar que item_id_registrado exista en maestro_items
    const { data: itemExistente, error: itemError } = await supabase
      .from('maestro_items')
      .select('item_id')
      .eq('item_id', item_id_registrado)
      .single();

    if (itemError || !itemExistente) {
      return res.status(400).json({ 
        success: false, 
        message: `El item ${item_id_registrado} no existe en maestro_items.` 
      });
    }

    // 4. Obtener el consecutivo del inventario
    const { data: inventarioData, error: inventarioError } = await supabase
      .from('inventarios')
      .select('consecutivo')
      .eq('id', inventario_id)
      .single();

    if (inventarioError) {
      console.error('Error al obtener inventario:', inventarioError);
      throw new Error("No se pudo encontrar el inventario activo.");
    }

    // 5. Ejecutar la función RPC para actualizar el conteo
    const { error: rpcError } = await supabase.rpc('incrementar_conteo_producto', {
      cantidad_a_sumar: cantidad,
      item_a_actualizar: item_id_registrado,
      consecutivo_inventario: inventarioData.consecutivo
    });

    if (rpcError) {
      console.error("Error en RPC 'incrementar_conteo_producto':", rpcError);
      throw new Error(`Error en incrementar_conteo_producto: ${rpcError.message}`);
    }

    // 6. Insertar el registro en detalles_inventario
    const { error: insertError } = await supabase
      .from('detalles_inventario')
      .insert({
        inventario_id,
        codigo_barras_escaneado,
        item_id_registrado,
        cantidad,
        usuario: usuario_email
      });

    if (insertError) {
      console.error('Error al insertar en detalles_inventario:', insertError);
      throw new Error(`Error al insertar en detalles_inventario: ${insertError.message}`);
    }

    res.json({ success: true, message: "Registro exitoso" });
  } catch (error) {
    console.error("Error completo en registrarEscaneoCarnesFruver:", error);
    res.status(500).json({ success: false, message: `Error en el servidor: ${error.message}` });
  }
};

// Obtiene el historial de escaneos para mostrarlo en la app
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
        maestro_items!detalles_inventario_item_id_registrado_fkey(descripcion)
      `)
      .eq("inventario_id", inventario_id)
      .order("fecha_hora", { ascending: false });

    if (error) throw error;

    const historialFormateado = data.map(d => ({
      id: d.id,
      cantidad: d.cantidad,
      fecha_hora: d.fecha_hora,
      producto: {
        descripcion: d.maestro_items?.descripcion || 'Descripción no encontrada',
        codigo_barras: d.codigo_barras_escaneado || 'N/A',
        item: d.item_id_registrado || 'N/A'
      }
    }));

    console.log("Historial devuelto:", historialFormateado.slice(0, 5)); // Depuración
    res.json({ success: true, historial: historialFormateado || [] });
  } catch (error) {
    console.error("Error en obtenerHistorialInventario:", error);
    res.status(500).json({ success: false, message: `Error: ${error.message}` });
  }
};

// Elimina un registro de escaneo específico
export const eliminarDetalleInventario = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ success: false, message: "Se requiere el ID del registro." });
    }

    // 1. Primero, obtenemos los datos del registro que se va a borrar
    // para saber qué item y qué cantidad debemos restar.
    const { data: detalle, error: detalleError } = await supabase
      .from('detalles_inventario')
      .select('cantidad, item_id_registrado, inventario:inventarios(consecutivo)')
      .eq('id', id)
      .single();

    if (detalleError) {
      throw new Error("No se encontró el registro de detalle a eliminar.");
    }

    // 2. Llamamos a nuestra nueva función de la BD para restar el conteo de forma segura.
    const { error: rpcError } = await supabase.rpc('decrementar_conteo_producto', {
        cantidad_a_restar: detalle.cantidad,
        item_a_actualizar: detalle.item_id_registrado,
        consecutivo_inventario: detalle.inventario.consecutivo
    });

    if (rpcError) {
        console.error("Error en RPC 'decrementar_conteo_producto':", rpcError);
        throw rpcError;
    }
    
    // 3. Finalmente, eliminamos el registro del historial.
    const { error: deleteError } = await supabase.from('detalles_inventario').delete().eq('id', id);
    if (deleteError) throw deleteError;

    res.json({ success: true, message: "Registro eliminado correctamente." });

  } catch (error) {
    console.error("Error en eliminarDetalleInventario:", error);
    res.status(500).json({ success: false, message: `Error en el servidor: ${error.message}` });
  }
};

// Permite al operario finalizar su sesión de conteo
export const finalizarInventarioCompleto = async (req, res) => {
  try {
    const { inventarioId } = req.params;
    if (!inventarioId) {
      return res.status(400).json({ success: false, message: "Se requiere el ID del inventario." });
    }

    // Actualizamos el estado del inventario principal a 'finalizado'
    const { data, error } = await supabase
      .from('inventarios')
      .update({ 
        estado: 'finalizado',
        fecha_fin: new Date().toISOString() 
      })
      .eq('id', inventarioId)
      .select()
      .single();

    if (error) throw error;
    
    res.json({ success: true, message: `Inventario finalizado y movido a pendientes de aprobación.` });
  } catch (error) {
    console.error("Error en finalizarInventarioCompleto:", error);
    res.status(500).json({ success: false, message: `Error: ${error.message}` });
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