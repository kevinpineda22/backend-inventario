import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// --- Controladores para el Scanner del Operario ---

// Obtiene la lista de inventarios con estado 'activo'
export const obtenerInventariosActivos = async (req, res) => {
  try {
    const { sede } = req.query;
    let query = supabase
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
      .not('sede', 'is', null)
      .neq('sede', '')
      .neq('sede', ' ') // ✅ Agregar filtro para espacios en blanco
      .order("fecha_inicio", { ascending: false });

    // ✅ Filtrar por sede si se proporciona
    if (sede) {
      query = query.eq('sede', sede);
    }

    const { data, error } = await query;

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
    const { sede } = req.query; // ✅ Agregar sede como query param
    if (!consecutivo || !sede || sede.trim() === '') { // ✅ Validar que sede no sea vacía
      return res.status(400).json({ success: false, message: "Se requieren consecutivo y sede válidos." });
    }
    
    const { data, error } = await supabase
      .from('productos')
      .select('item')
      .eq('consecutivo', consecutivo)
      .eq('sede', sede)
      .limit(5000);

    if (error) throw error;

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
    const { inventario_id, zona_id, codigo_barras, cantidad, usuario_email, item_id, ubicacion } = req.body;

    // 2. Validamos que todos los datos necesarios estén presentes.
    if (!inventario_id || !zona_id || !cantidad || !usuario_email || !item_id) {
      return res.status(400).json({ success: false, message: "Datos incompletos para el registro. Falta el zona_id." });
    }

    // ✅ NUEVO: Validar ubicacion (solo si viene en el body)
    let ubicacionValida = null; // Por defecto NULL para registros sin ubicación
    if (ubicacion && ['punto_venta', 'bodega'].includes(ubicacion)) {
      ubicacionValida = ubicacion;
    }

    // 3. Insertamos el registro del conteo directamente en la tabla de detalles.
    const { error: insertError } = await supabase
      .from('detalles_inventario')
      .insert({
        inventario_id,
        zona_id,
        codigo_barras_escaneado: codigo_barras,
        item_id_registrado: item_id,
        cantidad,
        usuario: usuario_email,
        ubicacion: ubicacionValida // ✅ NUEVO: NULL si no viene, o el valor validado
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

// Para el autocompletado del scanner de Carnes/Fruver
export const obtenerProductosPorConsecutivo = async (req, res) => {
  try {
    const { consecutivo } = req.params;
    const { sede } = req.query; // ✅ Agregar sede
    if (!consecutivo || !sede) { // ✅ Validar sede
      return res.status(400).json({ success: false, message: "Se requieren consecutivo y sede." });
    }

    const { data, error } = await supabase
      .from('productos')
      .select('item, descripcion, codigo_barras')
      .eq('consecutivo', consecutivo)
      .eq('sede', sede); // ✅ Filtrar por sede

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
        inventario:inventarios (*)
      `)
      .eq('operario_email', email)
      .eq('estado', 'en_proceso')      .limit(1)
      .single();

    // Si no encuentra nada (código PGRST116), no es un error, simplemente no hay sesión activa.
    if (error && error.code !== 'PGRST116') throw error;

    res.json({ success: true, zonaActiva: data });

  } catch (error) {
    console.error("Error en obtenerZonaActiva:", error);
    res.status(500).json({ success: false, message: `Error: ${error.message}` });
  }
};

// ✅ NUEVO ENDPOINT: Obtener productos sin conteo con existencia, filtrado por sede y consecutivo
export const getProductosSinConteoConExistenciaGlobal = async (req, res) => {
  const { zonaId } = req.params;
  const { sede, consecutivo } = req.query;

  if (!sede || !consecutivo) {
    return res.status(400).json({ success: false, message: "Se requieren parámetros 'sede' y 'consecutivo'." });
  }

  try {
    // Verificar que la zona pertenece al inventario correcto
    const { data: zona, error: zonaError } = await supabase
      .from('inventario_zonas')
      .select('inventario_id')
      .eq('id', zonaId)
      .single();

    if (zonaError || !zona) {
      return res.status(404).json({ success: false, message: "Zona no encontrada." });
    }

    // 1. Obtener productos del inventario con existencia > 0
    const { data: productos, error: prodError } = await supabase
      .from('productos')
      .select('item, descripcion, cantidad')
      .eq('consecutivo', consecutivo)
      .eq('sede', sede)
      .gt('cantidad', 0);

    if (prodError) throw prodError;

    // ✅ CAMBIO: Obtener items ya contados en TODAS las zonas del inventario (global)
    const { data: itemsContados, error: contError } = await supabase
      .from('detalles_inventario')
      .select('item_id_registrado')
      .eq('inventario_id', zona.inventario_id); // Usar inventario_id para global

    if (contError) throw contError;

    // 3. Crear set de items contados para filtrar
    const itemsContadosSet = new Set(itemsContados.map(d => d.item_id_registrado));

    // 4. Filtrar productos que no han sido contados en el inventario completo
    const productosFaltantes = productos.filter(p => !itemsContadosSet.has(p.item));

    res.json({ success: true, itemsFaltantes: productosFaltantes });
  } catch (error) {
    console.error("Error en getProductosSinConteoConExistenciaGlobal:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ✅ Filtra por 'activo' para permitir el re-conteo antes de la aprobación final del Admin.
export const obtenerInventariosParaReconteo = async (req, res) => {
    try {
        const { sede } = req.query; // ✅ Agregar filtro por sede (opcional)
        let query = supabase
            .from("inventarios")
            .select(`id, descripcion, consecutivo, estado, sede`) // ✅ Agregar sede al select
            .in("estado", ["activo", "en_proceso", "finalizada"])
            .order("fecha_inicio", { ascending: false });

        if (sede) {
            query = query.eq("sede", sede); // ✅ Filtrar por sede si se proporciona
        }

        const { data, error } = await query;
        if (error) throw error;

        res.json({ success: true, inventarios: data || [] });
    } catch (error) {
        console.error("Error al obtener inventarios para re-conteo:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// ✅ NUEVO: Registra un ajuste de re-conteo
export const registrarAjusteReconteo = async (req, res) => {
    try {
        // Datos enviados desde el frontend (ReconteoDiferencias.jsx)
        const { 
            consecutivo,
            item_id,
            cantidad_ajustada, 
            cantidad_anterior, // Para trazabilidad
            operario_email,
            sede
        } = req.body;

        // Validación básica
        if (!consecutivo || !item_id || !operario_email) {
            return res.status(400).json({ success: false, message: "Datos incompletos para registrar el ajuste." });
        }

        // ✅ NUEVO: Si no se proporciona cantidad_ajustada, buscar y sumar los guardados temporales
        let cantidadFinal = cantidad_ajustada;
        
        if (typeof cantidad_ajustada === 'undefined' || cantidad_ajustada === null) {
            // Obtener todos los guardados temporales para este item
            const { data: guardados, error: guardadosError } = await supabase
                .from('guardados_reconteo')
                .select('cantidad')
                .eq('consecutivo', consecutivo)
                .eq('item_id', item_id)
                .eq('operario_email', operario_email);

            if (guardadosError) {
                console.error("Error al obtener guardados:", guardadosError);
                throw new Error(`Error al obtener guardados: ${guardadosError.message}`);
            }

            if (!guardados || guardados.length === 0) {
                return res.status(400).json({ 
                    success: false, 
                    message: "No hay guardados temporales para registrar el ajuste." 
                });
            }

            // Sumar todas las cantidades guardadas
            cantidadFinal = guardados.reduce((sum, g) => sum + parseFloat(g.cantidad || 0), 0);
        }

        // 1. Insertar el registro en la tabla de ajustes de re-conteo
        const { error: insertError } = await supabase
            .from('ajustes_reconteo')
            .insert({
                consecutivo,
                item_id,
                cantidad_nueva: parseFloat(cantidadFinal),
                cantidad_anterior: parseFloat(cantidad_anterior) || 0,
                operario_email,
                sede: sede || null
            });

        if (insertError) {
            console.error("Error al insertar ajuste de reconteo:", insertError);
            throw new Error(`Error de base de datos: ${insertError.message}`);
        }

        // ✅ NUEVO: Eliminar los guardados temporales de este item
        const { error: deleteError } = await supabase
            .from('guardados_reconteo')
            .delete()
            .eq('consecutivo', consecutivo)
            .eq('item_id', item_id)
            .eq('operario_email', operario_email);

        if (deleteError) {
            console.warn("Advertencia al eliminar guardados temporales:", deleteError);
            // No lanzamos error porque el ajuste ya se registró correctamente
        }

        // 2. Respuesta de éxito
        res.json({ 
            success: true, 
            message: "Ajuste de re-conteo registrado exitosamente.",
            cantidad_registrada: cantidadFinal
        });

    } catch (error) {
        console.error("Error en registrarAjusteReconteo:", error);
        res.status(500).json({ success: false, message: `Error en el servidor: ${error.message}` });
    }
};


// ✅ NUEVO ENDPOINT: Buscar producto por descripción (para inventarios sin código de barras)
export const buscarProductoPorDescripcion = async (req, res) => {
  try {
    const { consecutivo, sede, descripcion } = req.query;
    
    if (!consecutivo || !sede || !descripcion) {
      return res.status(400).json({ 
        success: false, 
        message: "Se requieren consecutivo, sede y descripción." 
      });
    }

    // Buscar en la tabla productos con búsqueda parcial (ILIKE para case-insensitive)
    const { data, error } = await supabase
      .from('productos')
      .select('item, descripcion, codigo_barras, cantidad, unidad')
      .eq('consecutivo', consecutivo)
      .eq('sede', sede)
      .ilike('descripcion', `%${descripcion}%`) // Búsqueda parcial
      .limit(20); // Limitar resultados

    if (error) throw error;

    res.json({ 
      success: true, 
      productos: data || [],
      total: data?.length || 0
    });
  } catch (error) {
    console.error("Error en buscarProductoPorDescripcion:", error);
    res.status(500).json({ 
      success: false, 
      message: `Error: ${error.message}` 
    });
  }
};

// ========================================================================
// NUEVOS ENDPOINTS: Guardados Temporales de Reconteo
// ========================================================================

// Guardar un conteo temporal (antes del ajuste final)
export const guardarReconteoTemporal = async (req, res) => {
  try {
    const {
      consecutivo,
      item_id,
      ubicacion,
      cantidad,
      operario_email,
      zona_descripcion
    } = req.body;

    // Validación
    if (!consecutivo || !item_id || !ubicacion || typeof cantidad === 'undefined' || !operario_email) {
      return res.status(400).json({ 
        success: false, 
        message: "Datos incompletos. Se requieren: consecutivo, item_id, ubicacion, cantidad, operario_email" 
      });
    }

    // Validar ubicación
    if (!['punto_venta', 'bodega'].includes(ubicacion)) {
      return res.status(400).json({ 
        success: false, 
        message: "Ubicación debe ser 'punto_venta' o 'bodega'" 
      });
    }

    // Insertar guardado
    const { data, error } = await supabase
      .from('guardados_reconteo')
      .insert({
        consecutivo,
        item_id,
        ubicacion,
        cantidad: parseFloat(cantidad),
        operario_email,
        zona_descripcion: zona_descripcion || null
      })
      .select()
      .single();

    if (error) {
      console.error("Error al guardar reconteo temporal:", error);
      throw new Error(`Error de base de datos: ${error.message}`);
    }

    res.json({ 
      success: true, 
      message: "Conteo guardado exitosamente",
      guardado: data 
    });

  } catch (error) {
    console.error("Error en guardarReconteoTemporal:", error);
    res.status(500).json({ success: false, message: `Error: ${error.message}` });
  }
};

// Obtener todos los guardados de un item específico
export const obtenerGuardadosReconteo = async (req, res) => {
  try {
    const { consecutivo, item_id } = req.params;
    const { operario_email } = req.query;

    if (!consecutivo || !item_id) {
      return res.status(400).json({ 
        success: false, 
        message: "Se requieren consecutivo e item_id" 
      });
    }

    // Construir query
    let query = supabase
      .from('guardados_reconteo')
      .select('*')
      .eq('consecutivo', consecutivo)
      .eq('item_id', item_id)
      .order('created_at', { ascending: true });

    // Filtrar por operario si se proporciona
    if (operario_email) {
      query = query.eq('operario_email', operario_email);
    }

    const { data, error } = await query;

    if (error) {
      console.error("Error al obtener guardados:", error);
      throw new Error(`Error de base de datos: ${error.message}`);
    }

    // Calcular totales por ubicación
    const totales = {
      bodega: 0,
      punto_venta: 0,
      total: 0
    };

    if (data && data.length > 0) {
      data.forEach(g => {
        const cant = parseFloat(g.cantidad) || 0;
        if (g.ubicacion === 'bodega') {
          totales.bodega += cant;
        } else if (g.ubicacion === 'punto_venta') {
          totales.punto_venta += cant;
        }
        totales.total += cant;
      });
    }

    res.json({ 
      success: true, 
      guardados: data || [],
      totales
    });

  } catch (error) {
    console.error("Error en obtenerGuardadosReconteo:", error);
    res.status(500).json({ success: false, message: `Error: ${error.message}` });
  }
};

// Actualizar un guardado temporal
export const actualizarGuardadoReconteo = async (req, res) => {
  try {
    const { id } = req.params;
    const { cantidad, zona_descripcion } = req.body;

    if (!id) {
      return res.status(400).json({ success: false, message: "ID requerido" });
    }

    if (typeof cantidad === 'undefined' && typeof zona_descripcion === 'undefined') {
      return res.status(400).json({ 
        success: false, 
        message: "Debe proporcionar al menos cantidad o zona_descripcion para actualizar" 
      });
    }

    // Preparar datos a actualizar
    const updateData = {};
    if (typeof cantidad !== 'undefined') {
      updateData.cantidad = parseFloat(cantidad);
    }
    if (typeof zona_descripcion !== 'undefined') {
      updateData.zona_descripcion = zona_descripcion;
    }

    const { data, error } = await supabase
      .from('guardados_reconteo')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error("Error al actualizar guardado:", error);
      throw new Error(`Error de base de datos: ${error.message}`);
    }

    res.json({ 
      success: true, 
      message: "Guardado actualizado exitosamente",
      guardado: data 
    });

  } catch (error) {
    console.error("Error en actualizarGuardadoReconteo:", error);
    res.status(500).json({ success: false, message: `Error: ${error.message}` });
  }
};

// Eliminar un guardado temporal
export const eliminarGuardadoReconteo = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({ success: false, message: "ID requerido" });
    }

    const { error } = await supabase
      .from('guardados_reconteo')
      .delete()
      .eq('id', id);

    if (error) {
      console.error("Error al eliminar guardado:", error);
      throw new Error(`Error de base de datos: ${error.message}`);
    }

    res.json({ 
      success: true, 
      message: "Guardado eliminado exitosamente"
    });

  } catch (error) {
    console.error("Error en eliminarGuardadoReconteo:", error);
    res.status(500).json({ success: false, message: `Error: ${error.message}` });
  }
};