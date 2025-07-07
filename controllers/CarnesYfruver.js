import { createClient } from "@supabase/supabase-js";

import dotenv from "dotenv";
dotenv.config();

// Configuracion de Supabase
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// Endpoint para iniciar una zona en inventario_carnesYfruver
export const iniciarZonaCarnesYFruver = async (req, res) => {
  try {
    const { inventarioId, operario_email, descripcion_zona, bodega } = req.body;

    // Validación básica
    if (!inventarioId || !operario_email || !descripcion_zona || !bodega) {
      return res.status(400).json({ success: false, message: "Faltan datos requeridos." });
    }

    // Insertar la nueva zona en la tabla zonas_carnesYfruver
    const { data, error } = await supabase
      .from("inventario_activoCarnesYfruver")
      .insert([{
        inventario_id: inventarioId,
        operario_email,
        descripcion_zona,
        bodega,
        estado: "activa",
        creada_en: new Date().toISOString()
      }])
      .select()
      .single();

    if (error) {
      return res.status(500).json({ success: false, message: error.message });
    }

    res.json({ success: true, zonaId: data.id });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

