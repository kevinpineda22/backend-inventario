import { createClient } from "@supabase/supabase-js";

import dotenv from "dotenv";
dotenv.config();

// Configuracion de Supabase
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// Endpoint para iniciar una zona en inventario_carnesYfruver
export const iniciarZonaCarnesYFruver = async (req, res) => {
  try {
    const { inventarioId, operario_email, descripcion_zona, bodega } = req.body;

    // Validación de campos requeridos
    if (!inventarioId || !operario_email || !descripcion_zona || !bodega) {
      return res.status(400).json({
        success: false,
        message: "Faltan datos requeridos: inventarioId, operario_email, descripcion_zona o bodega.",
      });
    }

    // Depuración: Imprimir datos recibidos
    console.log("Datos recibidos en el backend:", {
      inventarioId,
      operario_email,
      descripcion_zona,
      bodega,
    });

    // Verificar si el inventarioId existe en la tabla inventario_carnesYfruver
    const { data: inventario, error: inventarioError } = await supabase
      .from("inventario_carnesYfruver")
      .select("categoria")
      .eq("categoria", inventarioId)
      .single();

    if (inventarioError || !inventario) {
      console.log("Error al validar inventarioId:", inventarioError);
      return res.status(400).json({
        success: false,
        message: `El inventario con categoría ${inventarioId} no existe.`,
      });
    }

    // Insertar la nueva zona
    const { data, error } = await supabase
      .from("inventario_activoCarnesYfruver")
      .insert([
        {
          inventario_id: inventarioId,
          operario_email,
          descripcion_zona,
          bodega,
          estado: "activa",
          creada_en: new Date().toISOString(),
          consecutivo: null, // El consecutivo se asigna al finalizar
        },
      ])
      .select()
      .single();

    if (error) {
      console.log("Error al insertar zona:", error);
      return res.status(500).json({
        success: false,
        message: `Error al crear la zona: ${error.message}`,
      });
    }

    return res.status(201).json({
      success: true,
      zonaId: data.id,
      message: "Zona creada exitosamente.",
    });
  } catch (error) {
    console.log("Error interno del servidor:", error);
    return res.status(500).json({
      success: false,
      message: `Error interno del servidor: ${error.message}`,
    });
  }
};
 
// Endpoint para obtener los inventarios que suben de carnes y fruver
export const obtenerInventariosCarnesYFruver = async (req, res) => {
  try {
    console.log("Obteniendo inventarios de carnes y fruver desde Supabase...");
    
    // Consultar la tabla inventario_carnesYfruver
    const { data, error } = await supabase
      .from("inventario_carnesYfruver")
      .select(" tipo_inventario, categoria") // Seleccionar los campos necesarios

    if (error) {
      console.error("Error al consultar inventarios en Supabase:", error);
      throw error;
    }

    console.log("Inventarios obtenidos exitosamente:", data);

    // Respuesta exitosa
    res.json({
      success: true,
      inventarios: data, // Devolver la lista de inventarios
      message: data.length > 0 ? "Inventarios cargados correctamente." : "No hay inventarios disponibles."
    });
  } catch (error) {
    console.error("Error al obtener inventarios carnes y fruver:", error);
    res.status(500).json({ success: false, message: `Error: ${error.message}` });
  }
};

// Endpoint para obtener ítems de la tabla maestro_items por grupo
export const obtenerItemsPorGrupo = async (req, res) => {
  try {
    const { grupo } = req.query; // Obtener el parámetro 'grupo' de la query
    console.log(`Obteniendo ítems de maestro_items para el grupo: ${grupo}`);

    if (!grupo) {
      return res.status(400).json({
        success: false,
        message: "El parámetro 'grupo' es requerido.",
      });
    }

    // Consultar la tabla maestro_items
    const { data, error } = await supabase
      .from("maestro_items")
      .select("item_id, descripcion, grupo") // Seleccionar los campos necesarios
      .eq("grupo", grupo); // Filtrar por la columna grupo

    if (error) {
      console.error("Error al consultar maestro_items en Supabase:", error);
      throw error;
    }

    console.log("Ítems obtenidos exitosamente:", data);

    // Respuesta exitosa
    res.json({
      success: true,
      items: data, // Devolver la lista de ítems
      message: data.length > 0 ? "Ítems cargados correctamente." : "No hay ítems disponibles para este grupo.",
    });
  } catch (error) {
    console.error("Error al obtener ítems de maestro_items:", error);
    res.status(500).json({ success: false, message: `Error: ${error.message}` });
  }
};

// Endpoint para guardar el inventario
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

    // Convertir el objeto agrupado a un array
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

    // Insertar los registros consolidados en registro_carnesYfruver
    const registrosToInsert = registrosConsolidados.map((registro) => ({
      operario_email,
      id_zona: zonaId,
      item_id: registro.item_id,
      cantidad: registro.cantidad,
    }));

    const { error: insertError } = await supabase
      .from("registro_carnesYfruver")
      .insert(registrosToInsert);

    if (insertError) {
      console.log("Error al insertar registros:", insertError);
      // Revertir la actualización de la zona si falla la inserción
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


// Endpoint para consultar registros de inventario

export const consultarInventario = async (req, res) => {
  try {
    // Paso 1: Consultar todos los registros
    const { data: registros, error: errorRegistros } = await supabase
      .from("registro_carnesYfruver")
      .select("*");

    if (errorRegistros) throw errorRegistros;
    if (!registros.length) {
      return res.status(404).json({ success: false, message: "No se encontraron registros." });
    }

    // Paso 2: Consultar inventarios activos
    const { data: inventarios, error: errorInv } = await supabase
      .from("inventario_activoCarnesYfruver")
      .select("id, consecutivo");

    if (errorInv) throw errorInv;

    // Paso 3: Mapear por id → el mismo que se guarda como id_zona
    const inventarioMap = {};
    for (const inv of inventarios) {
      inventarioMap[inv.id] = inv.consecutivo;
    }

    // Paso 4: Relacionar por id_zona
    const formattedData = registros.map(registro => ({
      item_id: registro.item_id,
      cantidad: registro.cantidad,
      fecha_registro: registro.fecha_registro,
      operario_email: registro.operario_email,
      consecutivo: inventarioMap[registro.id_zona] || null,
    }));

    return res.status(200).json({ success: true, data: formattedData });
  } catch (error) {
    console.error("Error:", error);
    return res.status(500).json({ success: false, message: error.message });
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
      .eq('estado', 'en_proceso') // Solo buscamos sesiones no finalizadas
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
