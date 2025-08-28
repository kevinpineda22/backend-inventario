import { createClient } from "@supabase/supabase-js";

import dotenv from "dotenv";
dotenv.config();

// Configuracion de Supabase
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// Endpoint para iniciar una zona en inventario_carnesYfruver
export const iniciarZonaCarnesYFruver = async (req, res) => {
  try {
    const { inventario_id, descripcion_zona, operario_email, bodega } = req.body;
    console.log("Datos recibidos en el endpoint:", { inventario_id, descripcion_zona, operario_email, bodega });

    // Validar campos requeridos
    if (!inventario_id || !descripcion_zona || !operario_email || !bodega) {
      console.log("Error: Faltan campos requeridos", { inventario_id, descripcion_zona, operario_email, bodega });
      return res.status(400).json({
        success: false,
        message: "Faltan datos obligatorios: inventario_id, descripcion_zona, operario_email o bodega.",
      });
    }

    // Validar que inventario_id sea un número
    const inventarioIdNum = parseInt(inventario_id, 10);
    if (isNaN(inventarioIdNum)) {
      console.log("Error: inventario_id no es un número válido", { inventario_id });
      return res.status(400).json({
        success: false,
        message: "El inventario_id debe ser un número válido.",
      });
    }

    // Validar que el inventario_id existe y está activo
    const { data: inventario, error: inventarioError } = await supabase
      .from("inventario_carnesYfruver")
      .select("id, estado, tipo_inventario")
      .eq("id", inventarioIdNum)
      .single();

    if (inventarioError || !inventario) {
      console.error("Error al verificar inventario:", inventarioError);
      return res.status(404).json({
        success: false,
        message: `Inventario con ID ${inventario_id} no encontrado.`,
      });
    }

    if (inventario.estado !== "activo") {
      console.log("Error: Inventario no está activo", { inventario_id });
      return res.status(400).json({
        success: false,
        message: `El inventario con ID ${inventario_id} no está activo.`,
      });
    }

    // Validar descripcion_zona (máximo 100 caracteres)
    if (descripcion_zona.length > 100) {
      console.log("Error: Descripción de zona demasiado larga", { descripcion_zona });
      return res.status(400).json({
        success: false,
        message: "La descripción de la zona no puede exceder los 100 caracteres.",
      });
    }

    // Validar bodega (máximo 50 caracteres)
    if (bodega.length > 50) {
      console.log("Error: Bodega demasiado larga", { bodega });
      return res.status(400).json({
        success: false,
        message: "El código de bodega no puede exceder los 50 caracteres.",
      });
    }

    // Validar operario_email
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(operario_email)) {
      console.log("Error: Email inválido", { operario_email });
      return res.status(400).json({
        success: false,
        message: "El correo del operario no es válido.",
      });
    }

    console.log("Intentando insertar zona en Supabase...");

    // Insertar la nueva zona
    const { data, error } = await supabase
      .from("inventario_activoCarnesYfruver")
      .insert([
        {
          inventario_id: inventarioIdNum,
          descripcion_zona,
          operario_email,
          bodega,
          estado: "activa",
        },
      ])
      .select("id, inventario_id, descripcion_zona, operario_email, bodega, estado, creada_en");

    if (error) {
      console.error("Error al insertar zona en Supabase:", error);
      return res.status(500).json({
        success: false,
        message: `Error al crear zona: ${error.message}`,
      });
    }

    console.log("Zona creada exitosamente:", data);

    return res.status(200).json({
      success: true,
      zonaId: data[0].id,
      data: {
        id: data[0].id,
        inventario_id: data[0].inventario_id,
        descripcion_zona: data[0].descripcion_zona,
        operario_email: data[0].operario_email,
        bodega: data[0].bodega,
        estado: data[0].estado,
        creada_en: data[0].creada_en,
        tipo_inventario: inventario.tipo_inventario,
      },
      message: `Zona con descripción ${descripcion_zona} creada correctamente para el inventario ${inventario_id}.`,
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

// Backend: Endpoint para guardar el inventario (MODIFICADO)
export const guardarInventario = async (req, res) => {
  try {
    const { operario_email, inventarioId, zonaId, consecutivo, registros } = req.body;

    // Validación de campos requeridos
    if (!inventarioId || !zonaId || !consecutivo || !operario_email) { // 'registros' ya no es estrictamente necesario aquí si ya se registraron
      return res.status(400).json({
        success: false,
        message: "Faltan datos requeridos: inventarioId, zonaId, consecutivo o operario_email.",
      });
    }

    // Depuración: Imprimir datos recibidos
    console.log("Datos recibidos en guardar-inventario:", {
      inventarioId,
      zonaId,
      consecutivo,
      operario_email,
      // No necesitamos 'registros' aquí si la lógica es solo finalizar la zona
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

    // Verificar si el consecutivo es único para ESTE inventario_activoCarnesYfruver
    // (Asegura que no haya otro consecutivo para la misma zona/activo, no necesariamente globalmente único)
    const { data: consecutivoExistente, error: consecutivoUnicoError } = await supabase
      .from("inventario_activoCarnesYfruver")
      .select("id, consecutivo")
      .eq("consecutivo", consecutivo)
      .neq("id", zonaId) // Asegurarse que no sea la misma zona actual
      .single();

    if (consecutivoExistente) {
      return res.status(400).json({
        success: false,
        message: `El consecutivo "${consecutivo}" ya está en uso por otra zona de inventario.`,
      });
    }

    // --- ¡LA PARTE QUE SE SIMPLIFICA Y SE ELIMINA ES LA MANIPULACIÓN DE registro_carnesYfruver AQUÍ! ---
    // Los registros individuales ya deben haber sido insertados previamente por 'registrar-producto'.
    // Esta función solo debe actualizar la zona como finalizada y asignarle el consecutivo.

    // Actualizar inventario_activoCarnesYfruver con el consecutivo y estado
    const { error: updateZonaError } = await supabase
      .from("inventario_activoCarnesYfruver")
      .update({
        consecutivo,
        estado: "finalizado",
        operario_email, // Actualiza el operario que finaliza la zona
        actualizada_en: new Date().toISOString(),
      })
      .eq("id", zonaId);

    if (updateZonaError) {
      console.log("Error al actualizar zona a finalizado:", updateZonaError);
      return res.status(500).json({
        success: false,
        message: `Error al actualizar la zona a finalizado: ${updateZonaError.message}`,
      });
    }

    return res.status(200).json({
      success: true,
      message: "Inventario finalizado y guardado correctamente.",
    });
  } catch (error) {
    console.log("Error interno del servidor en guardarInventario:", error);
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
    console.log("Consultando inventarios...");

    // Obtener todos los inventarios de inventario_carnesYfruver
    const { data: inventarios, error: errorInventarios } = await supabase
      .from("inventario_carnesYfruver")
      .select("id, tipo_inventario, fecha, categoria, estado, created_at")
      .order("created_at", { ascending: false });

    if (errorInventarios) {
      console.error("Error al consultar inventarios:", errorInventarios);
      return res.status(500).json({
        success: false,
        message: `Error al consultar inventarios: ${errorInventarios.message}`,
      });
    }

    // Obtener zonas activas de inventario_activoCarnesYfruver con bodega y descripcion_zona
    const { data: zonas, error: errorZonas } = await supabase
      .from("inventario_activoCarnesYfruver")
      .select("id, inventario_id, consecutivo, bodega, descripcion_zona, operario_email");

    if (errorZonas) {
      console.error("Error al consultar zonas activas:", errorZonas);
      return res.status(500).json({
        success: false,
        message: `Error al consultar zonas activas: ${errorZonas.message}`,
      });
    }

    // Obtener registros de registro_carnesYfruver
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

    // Mapear zonas por inventario_id
    const zonasMap = {};
    for (const zona of zonas) {
      if (!zonasMap[zona.inventario_id]) {
        zonasMap[zona.inventario_id] = [];
      }
      zonasMap[zona.inventario_id].push(zona);
    }

    // Mapear registros por id_zona
    const registrosMap = {};
    for (const registro of registros) {
      if (!registrosMap[registro.id_zona]) {
        registrosMap[registro.id_zona] = [];
      }
      registrosMap[registro.id_zona].push(registro);
    }

    // Formatear datos para el frontend
    const formattedData = inventarios.map((inventario) => {
      const zonasInventario = zonasMap[inventario.id] || [];
      const registrosInventario = zonasInventario.flatMap((zona) => {
        const zonaRegistros = registrosMap[zona.id] || [];
        return zonaRegistros.map((registro) => ({
          item_id: registro.item_id,
          cantidad: registro.cantidad,
          fecha_registro: registro.fecha_registro,
          operario_email: registro.operario_email,
          consecutivo: zona.consecutivo || null,
          bodega: zona.bodega || null,
          descripcion_zona: zona.descripcion_zona || null,
          activo_operario_email: zona.operario_email || null,
        }));
      });

      return {
        inventario_id: inventario.id,
        tipo_inventario: inventario.tipo_inventario,
        fecha: inventario.fecha,
        categoria: inventario.categoria,
        estado: inventario.estado,
        created_at: inventario.created_at,
        registros: registrosInventario,
      };
    });

    console.log("Inventarios obtenidos exitosamente:", formattedData.length);

    return res.status(200).json({
      success: true,
      data: formattedData,
      message: formattedData.length > 0 ? "Inventarios cargados correctamente." : "No hay inventarios disponibles.",
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


// Crea un inventario de carnes o fruver desde la maestra
export const crearInventarioCarnesYFruver = async (req, res) => {
  try {
    // Extraer los datos del body (procesados por parseFormData)
    const { tipo_inventario, fecha, categoria } = req.body;
    console.log("Datos recibidos en el endpoint:", { tipo_inventario, fecha, categoria });

    // Validar campos requeridos
    if (!tipo_inventario || !fecha || !categoria) {
      console.log("Error: Faltan campos requeridos", { tipo_inventario, fecha, categoria });
      return res.status(400).json({
        success: false,
        message: "Faltan datos obligatorios: tipo_inventario, fecha o categoria.",
      });
    }

    // Validar tipo_inventario
    if (!["carnes", "fruver"].includes(tipo_inventario.toLowerCase())) {
      console.log("Error: Tipo de inventario no válido", { tipo_inventario });
      return res.status(400).json({
        success: false,
        message: "Tipo de inventario no válido. Debe ser 'carnes' o 'fruver'.",
      });
    }

    // Validar formato de fecha
    const parsedFecha = new Date(fecha);
    if (isNaN(parsedFecha)) {
      console.log("Error: Fecha no válida", { fecha });
      return res.status(400).json({
        success: false,
        message: "La fecha proporcionada no es válida. Use el formato YYYY-MM-DD.",
      });
    }

    // Validar categoria (longitud máxima de 100 caracteres)
    if (categoria.length > 100) {
      console.log("Error: Categoría demasiado larga", { categoria });
      return res.status(400).json({
        success: false,
        message: "La categoría no puede exceder los 100 caracteres.",
      });
    }

    console.log("Intentando insertar inventario en Supabase...");

    // Insertar el nuevo inventario
    const { data, error } = await supabase
      .from("inventario_carnesYfruver")
      .insert([
        {
          tipo_inventario: tipo_inventario.toLowerCase(),
          fecha: parsedFecha.toISOString().split("T")[0], // Formato YYYY-MM-DD
          categoria,
          estado: "activo", // Incluir explícitamente el estado
        },
      ])
      .select("id, tipo_inventario, fecha, categoria, estado, created_at"); // Seleccionar todos los campos relevantes

    if (error) {
      console.error("Error al insertar en Supabase:", error);
      return res.status(500).json({
        success: false,
        message: `Error al crear inventario: ${error.message}`,
      });
    }

    console.log("Inventario creado exitosamente:", data);

    // Respuesta estandarizada
    return res.status(200).json({
      success: true,
      data: data[0], // Devolver el registro completo, incluyendo id
      message: `Inventario de tipo ${tipo_inventario} para la categoría ${categoria} creado correctamente.`,
    });
  } catch (error) {
    console.error("Error interno del servidor:", error);
    return res.status(500).json({
      success: false,
      message: `Error interno del servidor: ${error.message}`,
    });
  }
};

// Nuevo endpoint para buscar producto por código de barras
export const buscarProductoPorCodigoDeBarras = async (req, res) => {
  const { codigo } = req.query; // Obtener el parámetro 'codigo' de la query
  console.log(`Buscando producto por código de barras: ${codigo}`);

  if (!codigo) {
    return res.status(400).json({ success: false, message: 'El parámetro "codigo" es requerido.' });
  }

  try {
    // Primero, buscar en maestro_codigos para obtener el item_id
    const { data: codigoData, error: codigoError } = await supabase
      .from('maestro_codigos')
      .select('item_id')
      .eq('codigo_barras', codigo)
      .eq('is_active', true) // Asegúrate de que el código de barras esté activo
      .single();

    if (codigoError && codigoError.code !== 'PGRST116') { // PGRST116 es "no rows found"
      console.error('Error al buscar en maestro_codigos:', codigoError);
      throw codigoError;
    }

    if (!codigoData) {
      // No se encontró ningún código de barras activo
      console.log(`Código de barras "${codigo}" no encontrado o inactivo.`);
      return res.status(404).json({ success: false, message: 'Producto no encontrado para el código de barras proporcionado.' });
    }

    // Una vez que tenemos el item_id, buscamos la descripción en maestro_items
    const { data: itemData, error: itemError } = await supabase
      .from('maestro_items')
      .select('item_id, descripcion, grupo') // Incluimos 'grupo' para futura validación en el frontend
      .eq('item_id', codigoData.item_id)
      .eq('is_active', true) // Asegúrate de que el item_id esté activo
      .single();

    if (itemError && itemError.code !== 'PGRST116') {
      console.error('Error al buscar en maestro_items:', itemError);
      throw itemError;
    }

    if (!itemData) {
      // El item_id asociado al código de barras no se encontró o está inactivo
      console.log(`Item ID "${codigoData.item_id}" asociado al código de barras "${codigo}" no encontrado o inactivo.`);
      return res.status(404).json({ success: false, message: 'El producto asociado al código de barras no está activo o no existe.' });
    }

    console.log(`Producto encontrado para código ${codigo}:`, itemData);
    res.json({ success: true, producto: itemData });

  } catch (err) {
    console.error('Error interno del servidor al buscar producto por código de barras:', err);
    res.status(500).json({ success: false, message: `Error interno del servidor: ${err.message}` });
  }
};

// Agregar este endpoint al archivo controllers/carnesYfruver.js

// Endpoint para obtener el historial de descargas finalizadas para un operario
export const obtenerHistorialDescargas = async (req, res) => {
  try {
    const { email } = req.params;
    if (!email) {
      return res.status(400).json({ success: false, message: 'Se requiere el email del operario.' });
    }

    const { data, error } = await supabase
      .from('inventario_activoCarnesYfruver')
      .select('id, descripcion_zona, consecutivo, bodega, actualizada_en')
      .eq('operario_email', email)
      .eq('estado', 'finalizado')
      .order('actualizada_en', { ascending: false });

    if (error) {
      throw error;
    }

    res.json({ success: true, historial: data });
  } catch (error) {
    console.error('Error en obtenerHistorialDescargas:', error);
    res.status(500).json({ success: false, message: `Error: ${error.message}` });
  }
};