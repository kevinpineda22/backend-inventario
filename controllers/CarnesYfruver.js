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

