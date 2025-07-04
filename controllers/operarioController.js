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
      .eq('consecutivo', consecutivo);
    if (error) throw error;
    res.json({ success: true, items: data.map(i => String(i.item)) });
  } catch (error) {
    console.error("Error en obtenerItemsPorConsecutivo:", error);
    res.status(500).json({ success: false, message: `Error: ${error.message}` });
  }
};

// Registra un nuevo conteo en `detalles_inventario`
export const registrarEscaneo = async (req, res) => {
  try {
    const { inventario_id, zona_id, codigo_barras, cantidad, usuario_email, item_id } = req.body;

    // 1. Validar datos requeridos
    if (!inventario_id || !zona_id || !cantidad || !usuario_email || !item_id) {
      return res.status(400).json({
        success: false,
        message: "Datos incompletos. Asegúrate de incluir inventario_id, zona_id, codigo_barras, cantidad, usuario_email e item_id.",
      });
    }

    // 2. Obtener el consecutivo del inventario
    const { data: inventarioData, error: inventarioError } = await supabase
      .from('inventarios')
      .select('consecutivo')
      .eq('id', inventario_id)
      .single();
    if (inventarioError) {
      console.error("Error al obtener inventario:", inventarioError);
      throw new Error("No se pudo encontrar el inventario activo.");
    }

    // 3. Validar que el item_id existe en maestro_codigos
    const { data: maestroData, error: maestroError } = await supabase
      .from('maestro_codigos')
      .select('item_id, codigo_barras, unidad_medida, maestro_items(descripcion, grupo)')
      .eq('item_id', item_id)
      .maybeSingle();

    if (maestroError || !maestroData) {
      return res.status(400).json({
        success: false,
        message: `El item ${item_id} no existe en la base maestra.`,
      });
    }

    // 4. Buscar coincidencia en productos
    let productoData = null;
    let { data: productoExacto, error: productoError } = await supabase
      .from('productos')
      .select('item, codigo_barras, descripcion, cantidad, conteo_cantidad')
      .eq('consecutivo', inventarioData.consecutivo)
      .eq('item', item_id)
      .maybeSingle();

    if (productoError) {
      console.error("Error al buscar en productos:", productoError);
      throw new Error("Error al consultar productos.");
    }

    productoData = productoExacto;

    // 5. Si no hay coincidencia exacta, buscar ítems similares por descripción
    if (!productoData) {
      const { data: productosSimilares, error: similaresError } = await supabase
        .from('productos')
        .select('item, codigo_barras, descripcion, cantidad, conteo_cantidad')
        .eq('consecutivo', inventarioData.consecutivo)
        .ilike('descripcion', `%${maestroData.maestro_items.descripcion}%`);

      if (similaresError) {
        console.error("Error al buscar productos similares:", similaresError);
        throw new Error("Error al buscar productos similares.");
      }

      // Elegir el más parecido (por ejemplo, el primero que coincida parcialmente)
      if (productosSimilares && productosSimilares.length > 0) {
        productoData = productosSimilares[0]; // Seleccionar el primer ítem similar
        console.log(`Coincidencia aproximada encontrada: ${productoData.item}`);
      } else {
        // 6. Si no hay coincidencias, insertar nuevo producto
        const { error: insertProductoError } = await supabase
          .from('productos')
          .insert({
            item: item_id,
            codigo_barras: codigo_barras || maestroData.codigo_barras || null,
            descripcion: maestroData.maestro_items.descripcion || 'Sin descripción',
            grupo: maestroData.maestro_items.grupo || 'Sin grupo',
            unidad: maestroData.unidad_medida || 'UND',
            cantidad: 0, // Cantidad base inicial
            conteo_cantidad: 0, // Conteo inicial
            consecutivo: inventarioData.consecutivo,
          });

        if (insertProductoError) {
          console.error("Error al insertar en productos:", insertProductoError);
          throw new Error(`Error al agregar el item a productos: ${insertProductoError.message}`);
        }

        // Obtener el nuevo producto insertado
        const { data: nuevoProducto, error: nuevoProductoError } = await supabase
          .from('productos')
          .select('item, codigo_barras, descripcion, cantidad, conteo_cantidad')
          .eq('consecutivo', inventarioData.consecutivo)
          .eq('item', item_id)
          .single();

        if (nuevoProductoError) {
          throw new Error("Error al obtener el nuevo producto insertado.");
        }
        productoData = nuevoProducto;
      }
    }

    // 7. Actualizar conteo en productos
    const { error: rpcError } = await supabase.rpc('incrementar_conteo_producto', {
      cantidad_a_sumar: parseFloat(cantidad),
      item_a_actualizar: productoData.item, // Usar el item_id del producto (coincidencia exacta o similar)
      consecutivo_inventario: inventarioData.consecutivo,
    });
    if (rpcError) {
      console.error("Error en RPC incrementar_conteo_producto:", rpcError);
      throw new Error(`Error al actualizar conteo: ${rpcError.message}`);
    }

    // 8. Insertar registro en detalles_inventario
    const { error: insertError } = await supabase
      .from('detalles_inventario')
      .insert({
        inventario_id,
        zona_id,
        codigo_barras_escaneado: codigo_barras || null,
        item_id_registrado: productoData.item, // Usar el item_id del producto
        cantidad: parseFloat(cantidad),
        usuario: usuario_email,
      });
    if (insertError) {
      console.error("Error al insertar en detalles_inventario:", insertError);
      throw new Error(`Error al insertar en historial: ${insertError.message}`);
    }

    // 9. Devolver información del producto para el frontend
    res.json({
      success: true,
      message: "Registro exitoso",
      producto: {
        item: productoData.item,
        descripcion: productoData.descripcion,
        cantidad_base: productoData.cantidad || 0,
        conteo_actual: (productoData.conteo_cantidad || 0) + parseFloat(cantidad),
      },
    });
  } catch (error) {
    console.error("Error completo en registrarEscaneo:", error);
    res.status(500).json({ success: false, message: `Error en el servidor: ${error.message}` });
  }
};

//Endpoint para registrar escaneo de carnes y fruver en detalles_inventario
export const registrarEscaneoCarnesFruver = async (req, res) => {
  try {
    // 1. Recibir datos del frontend
    const { inventario_id, codigo_barras_escaneado, cantidad, usuario_email, item_id_registrado, zona_id } = req.body;

    // 2. Validar datos requeridos
    if (!inventario_id || cantidad == null || !usuario_email || !item_id_registrado || !zona_id) {
      return res.status(400).json({
        success: false,
        message: "Datos incompletos. Se requieren inventario_id, cantidad, usuario_email, item_id_registrado y zona_id.",
      });
    }

    // 3. Convertir cantidad a número de forma segura
    let cantidadNumerica;
    if (typeof cantidad === "string") {
      cantidadNumerica = parseFloat(cantidad.replace(",", ".")) || 0;
    } else if (typeof cantidad === "number") {
      cantidadNumerica = cantidad;
    } else {
      return res.status(400).json({
        success: false,
        message: "La cantidad debe ser un número o una cadena numérica válida.",
      });
    }
    if (cantidadNumerica <= 0) {
      return res.status(400).json({
        success: false,
        message: "La cantidad debe ser mayor que 0.",
      });
    }

    // 4. Validar que item_id_registrado exista
    const { data: itemExistente, error: itemError } = await supabase
      .from("maestro_items")
      .select("item_id")
      .eq("item_id", item_id_registrado)
      .single();

    if (itemError || !itemExistente) {
      return res.status(400).json({
        success: false,
        message: `El item ${item_id_registrado} no existe en maestro_items.`,
      });
    }

    // 5. Validar que zona_id exista, esté activa y pertenezca al inventario
    // 5. Validar que zona_id exista y pertenezca al inventario
    const { data: zonaExistente, error: zonaError } = await supabase
      .from("inventario_zonas")
      .select("id, estado, inventario_id")
      .eq("id", zona_id)
      .eq("inventario_id", inventario_id)
      .single();

    if (zonaError || !zonaExistente) {
      console.log("Zona no encontrada:", { error: zonaError, zona_id, inventario_id });
      return res.status(400).json({
        success: false,
        message: `La zona ${zona_id} no existe para este inventario.`,
      });
    }
    if (zonaExistente.estado === "finalizada") {
      console.log("Zona finalizada:", zona_id);
      return res.status(400).json({
        success: false,
        message: `La zona ${zona_id} está finalizada y no permite registros.`,
      });
    }
    // Permitir 'en_proceso' y 'activo'

    // 6. Obtener el consecutivo del inventario
    const { data: inventarioData, error: inventarioError } = await supabase
      .from("inventarios")
      .select("consecutivo")
      .eq("id", inventario_id)
      .single();

    if (inventarioError) {
      console.error("Error al obtener inventario:", inventarioError);
      throw new Error("No se pudo encontrar el inventario activo.");
    }

    // 7. Ejecutar la función RPC
    const { error: rpcError } = await supabase.rpc("incrementar_conteo_producto", {
      cantidad_a_sumar: cantidadNumerica,
      item_a_actualizar: item_id_registrado,
      consecutivo_inventario: inventarioData.consecutivo,
    });

    if (rpcError) {
      console.error("Error en RPC 'incrementar_conteo_producto':", rpcError);
      throw new Error(`Error en incrementar_conteo_producto: ${rpcError.message}`);
    }

    // 8. Insertar el registro
    const { error: insertError } = await supabase
      .from("detalles_inventario")
      .insert({
        inventario_id,
        zona_id,
        codigo_barras_escaneado,
        item_id_registrado,
        cantidad: cantidadNumerica,
        usuario: usuario_email,
      });

    if (insertError) {
      console.error("Error al insertar en detalles_inventario:", insertError);
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