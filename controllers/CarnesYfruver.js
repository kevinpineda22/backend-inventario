import { createClient } from "@supabase/supabase-js";

import dotenv from "dotenv";
dotenv.config();

// Configuracion de Supabase
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// Endpoint para iniciar una zona en inventario_carnesYfruver
export const iniciarZonaCarnesYFruver = async (req, res) => {
  try {
    const { inventarioId, operario_email, descripcion_zona, bodega } = req.body;

    if (!inventarioId || !operario_email || !descripcion_zona || !bodega) {
      return res.status(400).json({
        success: false,
        message: "Faltan datos obligatorios: inventarioId, operario_email, descripcion_zona o bodega.",
      });
    }

    console.log(`Iniciando zona para inventario ID: ${inventarioId}`);

    // Verificar si el inventario existe y está activo
    const { data: inventario, error: inventarioError } = await supabase
      .from("inventario_carnesYfruver")
      .select("id, tipo_inventario, estado")
      .eq("id", inventarioId)
      .eq("estado", "activo")
      .single();

    if (inventarioError || !inventario) {
      console.log("Error al validar inventario:", inventarioError);
      return res.status(404).json({
        success: false,
        message: `El inventario con ID ${inventarioId} no existe o no está activo.`,
      });
    }

    // Verificar si el operario ya tiene una zona activa
    const { data: zonaActiva, error: zonaError } = await supabase
      .from("inventario_activoCarnesYfruver")
      .select("id")
      .eq("operario_email", operario_email)
      .eq("estado", "activa")
      .single();

    if (zonaError && zonaError.code !== "PGRST116") {
      console.log("Error al verificar zona activa:", zonaError);
      return res.status(500).json({
        success: false,
        message: `Error al verificar zona activa: ${zonaError.message}`,
      });
    }

    if (zonaActiva) {
      return res.status(400).json({
        success: false,
        message: "El operario ya tiene una zona activa.",
      });
    }

    // Generar consecutivo único
    const { data: maxConsecutivo, error: consecutivoError } = await supabase
      .from("inventario_activoCarnesYfruver")
      .select("consecutivo")
      .eq("inventario_id", inventarioId)
      .order("consecutivo", { ascending: false })
      .limit(1);

    if (consecutivoError) {
      console.log("Error al obtener consecutivo:", consecutivoError);
      return res.status(500).json({
        success: false,
        message: `Error al generar consecutivo: ${consecutivoError.message}`,
      });
    }

    const nuevoConsecutivo = (maxConsecutivo[0]?.consecutivo || 0) + 1;

    // Insertar nueva zona activa
    const { data, error } = await supabase
      .from("inventario_activoCarnesYfruver")
      .insert([
        {
          inventario_id: inventarioId,
          operario_email,
          descripcion_zona,
          bodega,
          estado: "activa",
          consecutivo: nuevoConsecutivo,
          tipo_inventario: inventario.tipo_inventario,
          creada_en: new Date().toISOString(),
        },
      ])
      .select();

    if (error) {
      console.log("Error al crear zona:", error);
      return res.status(500).json({
        success: false,
        message: `Error al crear zona: ${error.message}`,
      });
    }

    console.log("Zona creada exitosamente:", data);
    return res.status(200).json({
      success: true,
      zonaId: data[0].id,
      message: "Zona creada correctamente.",
    });
  } catch (error) {
    console.error("Error interno del servidor:", error);
    return res.status(500).json({
      success: false,
      message: `Error interno del servidor: ${error.message}`,
    });
  }
};
 
// Endpoint para obtener los inventarios que suben de carnes y fruver
export const obtenerInventariosCarnesYFruver = async (req, res) => {
  try {
    const { estado } = req.query;
    console.log(`Obteniendo inventarios de carnes y fruver con estado: ${estado || 'todos'}`);
    
    let query = supabase
      .from("inventario_carnesYfruver")
      .select("id, tipo_inventario, categoria, estado, created_at");

    if (estado) {
      query = query.eq("estado", estado);
    }

    const { data, error } = await query;

    if (error) {
      console.error("Error al consultar inventarios en Supabase:", error);
      throw error;
    }

    console.log("Inventarios obtenidos exitosamente:", data);

    res.json({
      success: true,
      inventarios: data,
      message: data.length > 0 ? "Inventarios cargados correctamente." : "No hay inventarios disponibles."
    });
  } catch (error) {
    console.error("Error al obtener inventarios carnes y fruver:", error);
    res.status(500).json({ success: false, message: `Error: ${error.message}` });
  }
};

// ✅ Endpoint para obtener ítems de la tabla maestro_items por grupo
// VERSIÓN ACTUALIZADA: Ahora solo busca entre productos ACTIVOS.
export const obtenerItemsPorGrupo = async (req, res) => {
  const { grupo } = req.query; // Obtener el parámetro 'grupo' de la query
  
  if (!grupo) {
    return res.status(400).json({
      success: false,
      message: "El parámetro 'grupo' es requerido.",
    });
  }
  
  console.log(`Obteniendo ítems ACTIVOS de maestro_items para el grupo: ${grupo}`);

  try {
    // Consultar la tabla maestro_items, añadiendo el filtro de activos
    const { data, error } = await supabase
      .from("maestro_items")
      .select("item_id, descripcion, grupo") // Seleccionar los campos necesarios
      .eq("grupo", grupo)                   // Filtrar por la columna grupo
      .eq("is_active", true);               // <-- ¡FILTRO CLAVE! Solo trae los activos.

    if (error) {
      // Si hay un error en la consulta, lo lanzamos para que el catch lo maneje
      console.error("Error al consultar maestro_items en Supabase:", error);
      throw error;
    }

    console.log(`Ítems activos obtenidos para el grupo ${grupo}:`, data.length);

    // Respuesta exitosa
    res.json({
      success: true,
      items: data || [], // Devolver la lista de ítems (o un array vacío si no hay)
    });

  } catch (error) {
    console.error("Error al obtener ítems de maestro_items:", error);
    res.status(500).json({ success: false, message: `Error en el servidor: ${error.message}` });
  }
};

// Backend: Endpoint para guardar el inventario
export const guardarInventario = async (req, res) => {
  try {
    const { operario_email, inventarioId, zonaId, consecutivo, registros } = req.body;

    // Validación de campos requeridos
    if (!inventarioId || !zonaId || !consecutivo || !registros || !Array.isArray(registros) || registros.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Faltan datos requeridos: inventarioId, zonaId, consecutivo o registros válidos.",
      });
    }

    // Depuración: Imprimir datos recibidos
    console.log("Datos recibidos en guardar-inventario:", {
      inventarioId,
      zonaId,
      consecutivo,
      registros,
    });

    // Verificar si el zonaId existe y está asociado al inventarioId
    const { data: zona, error: zonaError } = await supabase
      .from("inventario_activoCarnesYfruver")
      .select("id, inventario_id, estado")
      .eq("id", zonaId)
      .eq("inventario_id", inventarioId)
      .single();

    if (zonaError || !zona) {
      console.log("Error al validar zonaId:", zonaError);
      return res.status(400).json({
        success: false,
        message: `La zona con ID ${zonaId} no existe o no corresponde al inventario ${inventarioId}.`,
      });
    }

    // Verificar si la zona ya está finalizada
    if (zona.estado === "finalizado") {
      return res.status(400).json({
        success: false,
        message: `La zona con ID ${zonaId} ya está finalizada.`,
      });
    }

    // Verificar si el consecutivo es único
    const { data: consecutivoExistente, error: consecutivoError } = await supabase
      .from("inventario_activoCarnesYfruver")
      .select("consecutivo")
      .eq("consecutivo", consecutivo)
      .single();

    if (consecutivoExistente) {
      return res.status(400).json({
        success: false,
        message: `El consecutivo ${consecutivo} ya está en uso.`,
      });
    }

    // Agrupar registros por item_id y sumar cantidades
    const registrosAgrupados = registros.reduce((acc, registro) => {
      const { item_id, cantidad } = registro;
      if (!item_id) {
        throw new Error("Se encontró un item_id nulo en los registros.");
      }
      if (acc[item_id]) {
        acc[item_id].cantidad += cantidad;
      } else {
        acc[item_id] = { item_id, cantidad };
      }
      return acc;
    }, {});

    const registrosConsolidados = Object.values(registrosAgrupados);

    // Validar que los item_id existan en maestro_items
    const itemIds = registrosConsolidados.map((r) => r.item_id);
    const { data: itemsValidos, error: itemsError } = await supabase
      .from("maestro_items")
      .select("item_id")
      .in("item_id", itemIds);

    if (itemsError || itemsValidos.length !== itemIds.length) {
      console.log("Error al validar item_id:", itemsError);
      return res.status(400).json({
        success: false,
        message: "Uno o más item_id no son válidos.",
      });
    }

    // Consultar registros existentes para esta zona
    const { data: productosExistentes, error: productosError } = await supabase
      .from("registro_carnesYfruver")
      .select("item_id, cantidad")
      .eq("id_zona", zonaId);

    if (productosError) {
      console.log("Error al consultar productos existentes:", productosError);
      return res.status(500).json({
        success: false,
        message: `Error al consultar productos existentes: ${productosError.message}`,
      });
    }

    // Mapa de registros existentes para comparar
    const existingItemsMap = productosExistentes.reduce((acc, prod) => {
      acc[prod.item_id] = prod.cantidad;
      return acc;
    }, {});

    // Separar registros en actualizaciones e inserciones
    const registrosToUpdate = [];
    const registrosToInsert = [];

    registrosConsolidados.forEach((registro) => {
      const { item_id, cantidad } = registro;
      if (existingItemsMap[item_id]) {
        // Si el item_id existe, actualizar la cantidad
        registrosToUpdate.push({
          id_zona: zonaId,
          item_id,
          cantidad: existingItemsMap[item_id] + cantidad, // Sumar la cantidad existente con la nueva
          operario_email,
        });
      } else {
        // Si no existe, insertar un nuevo registro
        registrosToInsert.push({
          id_zona: zonaId,
          item_id,
          cantidad,
          operario_email,
        });
      }
    });

    // Actualizar registros existentes
    for (const registro of registrosToUpdate) {
      const { error: updateError } = await supabase
        .from("registro_carnesYfruver")
        .update({ cantidad: registro.cantidad, operario_email })
        .eq("id_zona", registro.id_zona)
        .eq("item_id", registro.item_id);

      if (updateError) {
        console.log("Error al actualizar registro:", updateError);
        // Revertir la actualización de la zona si falla
        await supabase
          .from("inventario_activoCarnesYfruver")
          .update({
            operario_email,
            consecutivo: null,
            estado: "activa",
            actualizada_en: null,
          })
          .eq("id", zonaId);
        return res.status(500).json({
          success: false,
          message: `Error al actualizar registro: ${updateError.message}`,
        });
      }
    }

    // Insertar nuevos registros
    if (registrosToInsert.length > 0) {
      const { error: insertError } = await supabase
        .from("registro_carnesYfruver")
        .insert(registrosToInsert);

      if (insertError) {
        console.log("Error al insertar registros:", insertError);
        // Revertir la actualización de la zona si falla
        await supabase
          .from("inventario_activoCarnesYfruver")
          .update({
            operario_email,
            consecutivo: null,
            estado: "activa",
            actualizada_en: null,
          })
          .eq("id", zonaId);
        return res.status(500).json({
          success: false,
          message: `Error al insertar registros: ${insertError.message}`,
        });
      }
    }

    // Actualizar inventario_activoCarnesYfruver con el consecutivo y estado
    const { error: updateError } = await supabase
      .from("inventario_activoCarnesYfruver")
      .update({
        consecutivo,
        estado: "finalizado",
        actualizada_en: new Date().toISOString(),
      })
      .eq("id", zonaId);

    if (updateError) {
      console.log("Error al actualizar zona:", updateError);
      return res.status(500).json({
        success: false,
        message: `Error al actualizar la zona: ${updateError.message}`,
      });
    }

    return res.status(200).json({
      success: true,
      message: "Inventario finalizado y guardado correctamente.",
    });
  } catch (error) {
    console.log("Error interno del servidor:", error);
    return res.status(500).json({
      success: false,
      message: `Error al guardar el inventario: ${error.message}`,
    });
  }
};

// Backend: Endpoint para registrar un producto en tiempo real, si necesidad de finalizar la zona
export const registrarProductoZonaActiva = async (req, res) => {
  try {
    const { zona_id, item_id, cantidad, operario_email } = req.body;
    if (!zona_id || !item_id || !cantidad || !operario_email) {
      return res.status(400).json({ success: false, message: 'Se requieren zona_id, item_id, cantidad y operario_email.' });
    }

    // Validar que la zona activa existe
    const { data: zona, error: zonaError } = await supabase
      .from('inventario_activoCarnesYfruver')
      .select('id, estado')
      .eq('id', zona_id)
      .eq('estado', 'activa')
      .single();

    if (zonaError || !zona) {
      return res.status(400).json({ success: false, message: 'Zona activa no encontrada.' });
    }

    // Validar que el item_id existe en maestro_items
    const { data: item, error: itemError } = await supabase
      .from('maestro_items')
      .select('item_id')
      .eq('item_id', item_id)
      .single();

    if (itemError || !item) {
      return res.status(400).json({ success: false, message: `El item_id ${item_id} no es válido.` });
    }

    // Insertar el producto
    const { data, error } = await supabase
      .from('registro_carnesYfruver')
      .insert({
        id_zona: zona_id,
        item_id,
        cantidad,
        operario_email,
        fecha_registro: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      throw error;
    }

    res.json({ success: true, producto: data });
  } catch (error) {
    console.error('Error en registrarProductoZonaActiva:', error);
    res.status(500).json({ success: false, message: `Error: ${error.message}` });
  }
};

// Backend: Endpoint para obtener productos registrados para una zona activa
export const obtenerProductosZonaActiva = async (req, res) => {
  try {
    const { zona_id } = req.params;
    if (!zona_id) {
      return res.status(400).json({ success: false, message: 'Se requiere el zona_id.' });
    }

    const { data, error } = await supabase
      .from('registro_carnesYfruver')
      .select('id, item_id, cantidad, fecha_registro')
      .eq('id_zona', zona_id)
      .order('fecha_registro', { ascending: false });

    if (error) {
      throw error;
    }

    res.json({ success: true, productos: data });
  } catch (error) {
    console.error('Error en obtenerProductosZonaActiva:', error);
    res.status(500).json({ success: false, message: `Error: ${error.message}` });
  }
};



// Endpoint para consultar registros de inventario
export const consultarInventario = async (req, res) => {
  try {
    console.log("Consultando registros de inventario...");

    // Obtener registros de la tabla registro_carnesYfruver
    const { data: registros, error: errorRegistros } = await supabase
      .from("registro_carnesYfruver")
      .select("id, id_zona, item_id, cantidad, fecha_registro, operario_email");

    if (errorRegistros) {
      console.error("Error al consultar registros:", errorRegistros);
      return res.status(500).json({
        success: false,
        message: `Error al consultar registros: ${errorRegistros.message}`,
      });
    }

    // Si no hay registros, devolver array vacío
    if (!registros.length) {
      console.log("No se encontraron registros.");
      return res.status(200).json({
        success: true,
        data: [],
        message: "No se encontraron registros de inventario.",
      });
    }

    // Obtener zonas activas de inventario_activoCarnesYfruver
    const { data: inventarios, error: errorInv } = await supabase
      .from("inventario_activoCarnesYfruver")
      .select("id, inventario_id, consecutivo");

    if (errorInv) {
      console.error("Error al consultar zonas activas:", errorInv);
      return res.status(500).json({
        success: false,
        message: `Error al consultar zonas activas: ${errorInv.message}`,
      });
    }

    // Obtener detalles de inventario_carnesYfruver
    const { data: inventarioDetails, error: errorInvDetails } = await supabase
      .from("inventario_carnesYfruver")
      .select("id, categoria, estado, created_at");

    if (errorInvDetails) {
      console.error("Error al consultar detalles de inventario:", errorInvDetails);
      return res.status(500).json({
        success: false,
        message: `Error al consultar detalles de inventario: ${errorInvDetails.message}`,
      });
    }

    // Mapear inventarios por id_zona
    const inventarioMap = {};
    for (const inv of inventarios) {
      const invDetail = inventarioDetails.find((detail) => detail.id === inv.inventario_id);
      inventarioMap[inv.id] = {
        consecutivo: inv.consecutivo,
        categoria: invDetail?.categoria || null,
        estado: invDetail?.estado || "activo",
        inventario_id: inv.inventario_id,
        created_at: invDetail?.created_at || null,
      };
    }

    // Formatear datos para el frontend
    const formattedData = registros.map((registro) => ({
      item_id: registro.item_id,
      cantidad: registro.cantidad,
      fecha_registro: registro.fecha_registro,
      operario_email: registro.operario_email,
      consecutivo: inventarioMap[registro.id_zona]?.consecutivo || null,
      categoria: inventarioMap[registro.id_zona]?.categoria || null,
      estado: inventarioMap[registro.id_zona]?.estado || "activo",
      inventario_id: inventarioMap[registro.id_zona]?.inventario_id || null,
      created_at: inventarioMap[registro.id_zona]?.created_at || null,
    }));

    console.log("Registros obtenidos exitosamente:", formattedData.length);

    return res.status(200).json({
      success: true,
      data: formattedData,
      message: formattedData.length > 0 ? "Registros cargados correctamente." : "No hay registros disponibles.",
    });
  } catch (error) {
    console.error("Error al consultar inventario:", error);
    return res.status(500).json({
      success: false,
      message: `Error interno del servidor: ${error.message}`,
    });
  }
};

// ✅ Endpoint para buscar una sesión de zona activa para un operario específico
export const obtenerZonaActivaCarnes = async (req, res) => {
  try {
    const { email } = req.params;
    if (!email) {
      return res.status(400).json({ success: false, message: 'Se requiere el email del operario.' });
    }

    // Buscamos en la tabla inventario_activoCarnesYfruver y traemos información del inventario relacionado
    const { data, error } = await supabase
      .from('inventario_activoCarnesYfruver')
      .select(`
        id,
        inventario_id,
        operario_email,
        bodega,
        descripcion_zona,
        estado,
        creada_en
        inventario:inventario_carnesYfruver (categoria, tipo_inventario)
      `)
      .eq('operario_email', email)
      .eq('estado', 'activa') // Solo buscamos sesiones no finalizadas
      .limit(1)
      .single();

    // Si no encuentra nada (código PGRST116), no es un error, simplemente no hay sesión activa
    if (error && error.code !== 'PGRST116') {
      throw error;
    }

    res.json({ success: true, zonaActiva: data });
  } catch (error) {
    console.error('Error en obtenerZonaActiva:', error);
    res.status(500).json({ success: false, message: `Error: ${error.message}` });
  }
}


// Endpoint para eliminar un producto de la zona activa
export const eliminarProductoCarnesYFruver = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({ success: false, message: 'El ID es obligatorio.' });
    }

    const { data, error } = await supabase
      .from('registro_carnesYfruver')
      .delete()
      .eq('id', id);

    if (error) {
      throw error;
    }

    res.status(200).json({ success: true, message: 'Producto eliminado exitosamente.' });
  } catch (error) {
    console.error('Error al eliminar producto:', error.message);
    res.status(500).json({ success: false, message: `Error al eliminar: ${error.message}` });
  }
};

// Endpoint para actualizar el estado de un inventario
export const actualizarEstadoInventarioCarnesYFruver = async (req, res) => {
  try {
    const { id } = req.params;
    const { estado } = req.body;

    if (!id || !estado || !['activo', 'inactivo'].includes(estado)) {
      return res.status(400).json({
        success: false,
        message: "Se requiere el ID del inventario y un estado válido ('activo' o 'inactivo').",
      });
    }

    console.log(`Actualizando estado del inventario con ID: ${id} a ${estado}`);

    // Verificar si el inventario existe
    const { data: inventario, error: inventarioError } = await supabase
      .from("inventario_carnesYfruver")
      .select("id, categoria")
      .eq("id", id)
      .single();

    if (inventarioError || !inventario) {
      console.log("Error al validar inventario:", inventarioError);
      return res.status(404).json({
        success: false,
        message: `El inventario con ID ${id} no existe.`,
      });
    }

    // Si se intenta desactivar, verificar que no haya zonas activas
    if (estado === 'inactivo') {
      const { data: zonasActivas, error: zonasError } = await supabase
        .from("inventario_activoCarnesYfruver")
        .select("id, estado")
        .eq("inventario_id", id)
        .eq("estado", "activa");

      if (zonasError) {
        console.log("Error al verificar zonas activas:", zonasError);
        return res.status(500).json({
          success: false,
          message: `Error al verificar zonas activas: ${zonasError.message}`,
        });
      }

      if (zonasActivas.length > 0) {
        return res.status(400).json({
          success: false,
          message: "No se puede desactivar el inventario porque tiene zonas activas en curso.",
        });
      }
    }

    // Actualizar el estado del inventario
    const { error: updateError } = await supabase
      .from("inventario_carnesYfruver")
      .update({ estado })
      .eq("id", id);

    if (updateError) {
      console.log("Error al actualizar estado del inventario:", updateError);
      return res.status(500).json({
        success: false,
        message: `Error al actualizar el estado: ${updateError.message}`,
      });
    }

    console.log(`Estado del inventario ${id} actualizado a ${estado} exitosamente.`);
    return res.status(200).json({
      success: true,
      message: `Inventario con ID ${id} actualizado a estado ${estado} correctamente.`,
    });
  } catch (error) {
    console.error("Error interno del servidor:", error);
    return res.status(500).json({
      success: false,
      message: `Error interno del servidor: ${error.message}`,
    });
  }
};