import { createClient } from "@supabase/supabase-js";
import multer from "multer";
import dotenv from "dotenv";
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// Configuración de multer para subir imágenes
const storage = multer.memoryStorage();
export const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      "image/jpeg", "image/png", "image/jpg",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // .xlsx
      "application/vnd.ms-excel" // .xls
    ];

    if (!allowedTypes.includes(file.mimetype)) {
      return cb(new Error("Tipo de archivo no permitido"));
    }
    cb(null, true);
  },
}).single("file"); // Este nombre debe coincidir con el campo que envíes desde el frontend (ej. "file")


export const registrarEscaneo = async (req, res) => {
  try {
    const { inventario_id, codigo_barras, cantidad, usuario_email } = req.body;
    if (!inventario_id || !codigo_barras || !cantidad || !usuario_email) 
      return res.status(400).json({ success: false, message: "Datos incompletos." });
    
    const { data: maestroData, error: maestroError } = await supabase
      .from('maestro_codigos')
      .select('item_id, maestro_items(descripcion)')
      .eq('codigo_barras', codigo_barras)
      .single();
    if (maestroError) throw maestroError;

    const { data, error } = await supabase
      .from('detalles_inventario')
      .insert({ inventario_id, codigo_barras_escaneado: codigo_barras, cantidad, usuario: usuario_email })
      .select()
      .single();
    if (error) throw error;

    res.json({
      success: true,
      data,
      descripcion: maestroData.maestro_items.descripcion,
      item: maestroData.item_id,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: `Error: ${error.message}` });
  }
};

// ✅ Finalizar inventario
export const finalizarInventario = async (req, res) => {
  const { id } = req.params;

  try {
    const { data, error } = await supabase
      .from("inventarios")
      .update({ estado: "finalizado", fecha_fin: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single();

    if (error || !data) {
      console.error("Error al finalizar inventario:", error);
      return res.status(500).json({ success: false, message: "Error al finalizar inventario" });
    }

    res.json({ success: true, message: "Inventario finalizado correctamente" });
  } catch (error) {
    console.error("Error en finalizarInventario:", error);
    res.status(500).json({ success: false, message: `Error: ${error.message}` });
  }
};

// 🔼 Subir foto al bucket 'inventario'
export const subirFoto = async (req, res) => {
  const archivo = req.file;
  const nombreBase = req.body.filename;

  if (!archivo || !nombreBase) {
    return res.status(400).json({ success: false, message: "Archivo o nombre faltante" });
  }

  const nombreArchivo = `fotos-inventario/${Date.now()}_${nombreBase}`;

  try {
    const { error: uploadError } = await supabase.storage
      .from("inventario")
      .upload(nombreArchivo, archivo.buffer, {
        contentType: archivo.mimetype,
        upsert: true,
      });

    if (uploadError) {
      console.error("Error al subir archivo:", uploadError);
      return res.status(500).json({ success: false, message: "Error al subir archivo" });
    }

    const { data: publicUrl } = supabase.storage.from("inventario").getPublicUrl(nombreArchivo);

    res.json({ success: true, url: publicUrl.publicUrl });
  } catch (error) {
    console.error("Error en subirFoto:", error);
    res.status(500).json({ success: false, message: `Error: ${error.message}` });
  }
};

// 📄 Historial de escaneos
export const obtenerHistorialInventario = async (req, res) => {
  const { inventario_id } = req.params;
  try {
    const { data, error } = await supabase
      .from("detalles_inventario")
      .select(`id, cantidad, fecha_hora, codigo_barras_escaneado, maestro_codigos(item_id, maestro_items(descripcion))`)
      .eq("inventario_id", inventario_id)
      .order("fecha_hora", { ascending: false });
    if (error) throw error;

    const historialFormateado = data.map(d => ({
      id: d.id,
      cantidad: d.cantidad,
      fecha_hora: d.fecha_hora,
      producto: {
        descripcion: d.maestro_codigos?.maestro_items?.descripcion || 'Descripción no encontrada',
        codigo_barras: d.codigo_barras_escaneado,
        item: d.maestro_codigos?.item_id || 'N/A'
      }
    }));
    
    res.json({ success: true, historial: historialFormateado || [] });
  } catch (error) {
    res.status(500).json({ success: false, message: `Error: ${error.message}` });
  }
};

// ❌ Eliminar registro individual
export const eliminarRegistroInventario = async (req, res) => {
  const { id } = req.params;

  try {
    // Obtener el registro para restar la cantidad
    const { data: detalle, error: detalleError } = await supabase
      .from("detalles_inventario")
      .select("producto_id, cantidad")
      .eq("id", id)
      .single();

    if (!detalle) {
      return res.status(404).json({ success: false, message: "Registro no encontrado" });
    }

    // Restar la cantidad del producto
    const { data: producto, error: productoError } = await supabase
      .from("productos")
      .select("cantidad")
      .eq("id", detalle.producto_id)
      .single();

    if (!producto) {
      return res.status(404).json({ success: false, message: "Producto no encontrado" });
    }

    const nuevaCantidad = Math.max(0, producto.cantidad - detalle.cantidad);
    const { error: updateError } = await supabase
      .from("productos")
      .update({ cantidad: nuevaCantidad })
      .eq("id", detalle.producto_id);

    // Eliminar el registro
    const { error: deleteError } = await supabase
      .from("detalles_inventario")
      .delete()
      .eq("id", id);

    if (updateError || deleteError) {
      console.error("Error al eliminar registro:", updateError || deleteError);
      return res.status(500).json({ success: false, message: "Error al eliminar registro" });
    }

    res.json({ success: true, message: "Registro eliminado correctamente" });
  } catch (error) {
    console.error("Error en eliminarRegistroInventario:", error);
    res.status(500).json({ success: false, message: `Error: ${error.message}` });
  }
};

// ✅ Insertar productos desde Excel (Versión Definitiva)
export const importarProductosDesdeExcel = async (req, res) => {
  try {
    const productos = req.body;

    if (!Array.isArray(productos) || productos.length === 0) {
      return res.status(400).json({ success: false, message: "Lista de productos inválida o vacía" });
    }

    // --- LÓGICA DE CONSOLIDACIÓN MEJORADA ---
    const mapaDeProductos = new Map();

    // Usamos forEach para tener acceso al índice de cada producto.
    productos.forEach((p, index) => {
      // Si el producto tiene un código de barras, esa es su clave.
      // Si no tiene, creamos una CLAVE ÚNICA usando su posición (índice)
      // para asegurar que no se agrupe con otros productos sin código.
      const clave = p.codigo_barras ? String(p.codigo_barras).trim() : `_sin_codigo_${index}`;

      if (mapaDeProductos.has(clave)) {
        // Esta condición ahora solo se cumplirá para duplicados REALES de código de barras.
        const productoExistente = mapaDeProductos.get(clave);
        productoExistente.cantidad += parseInt(p.cantidad || 0);
      } else {
        // Si es un nuevo código de barras, o un producto sin código, se añade como entrada nueva.
        mapaDeProductos.set(clave, {
          codigo_barras: p.codigo_barras ? String(p.codigo_barras).trim() : null,
          descripcion: p.descripcion?.trim() || p["desc"]?.trim() || "",
          item: p.item || null,
          grupo: p.grupo || null,
          bodega: p.bodega || null,
          unidad: p.unidad || null,
          cantidad: parseInt(p.cantidad || 0),
          consecutivo: p.consecutivo || null,
        });
      }
    });

    // Convertimos el mapa a un array. Este array ahora contiene:
    // 1. Productos con código de barras, ya consolidados (sumadas sus cantidades).
    // 2. TODOS los productos que no tenían código de barras, como filas individuales.
    const productosFinales = Array.from(mapaDeProductos.values());

    // El comando upsert ahora funcionará correctamente.
    const { error } = await supabase
      .from("productos")
      .upsert(productosFinales, { onConflict: "codigo_barras" });

    if (error) {
      console.error("Error de Supabase al hacer upsert:", error);
      return res.status(500).json({ 
        success: false, 
        message: "Error al insertar productos", 
        details: error 
      });
    }

    res.json({ 
      success: true, 
      message: "Productos cargados y consolidados correctamente", 
      cantidad: productosFinales.length 
    });
  } catch (error) {
    console.error("Error catastrófico en importarProductosDesdeExcel:", error);
    res.status(500).json({ success: false, message: `Error: ${error.message}` });
  }
};

export const guardarAdminInventario = async (req, res) => {
  const { nombre, descripcion, fecha, consecutivo } = req.body;

  if (!nombre || !fecha) {
    return res.status(400).json({ success: false, message: "Nombre y fecha son obligatorios" });
  }

  try {
    const { data, error } = await supabase
      .from("inventario_admin")
      .insert([{ nombre, descripcion, fecha, consecutivo }])
      .select()
      .single();

    if (error) throw error;

    res.json({ success: true, data });
  } catch (error) {
    console.error("Error al guardar datos del admin:", error);
    res.status(500).json({ success: false, message: "Error al guardar los datos del administrador" });
  }
};

// Nuevo endpoint que guarda archivo y datos
export const guardarAdminInventarioConExcel = async (req, res) => {
  try {
    const { nombre, descripcion, fecha, consecutivo } = req.body;
    const archivo = req.file;
    if (!nombre || !fecha || !archivo) return res.status(400).json({ success: false, message: "Faltan campos requeridos o archivo Excel" });
    
    const extension = archivo.originalname.split(".").pop();
    const nombreArchivo = `excel-inventarios/inventario_${Date.now()}.${extension}`;
    const { error: uploadError } = await supabase.storage.from("inventario").upload(nombreArchivo, archivo.buffer, { contentType: archivo.mimetype, upsert: true });
    if (uploadError) throw new Error("Error al subir el archivo: " + uploadError.message);

    const { data: publicUrlData } = supabase.storage.from("inventario").getPublicUrl(nombreArchivo);
    const { data, error: insertError } = await supabase
      .from("inventario_admin")
      .insert([{ nombre, descripcion, fecha, consecutivo, archivo_excel: publicUrlData.publicUrl }])
      .select().single();
    if (insertError) throw insertError;
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const obtenerInventariosFinalizados = async (req, res) => {
  const { estado_aprobacion = 'pendiente' } = req.query; // Default to 'pendiente'
  try {
    const { data, error } = await supabase
      .from("inventarios")
      .select("*")
      .eq("estado", "finalizado")
      .eq("estado_aprobacion", estado_aprobacion)
      .order("fecha_fin", { ascending: false });

    if (error) throw error;

    res.json({ success: true, inventarios: data });
  } catch (error) {
    console.error("Error al obtener inventarios finalizados:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

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

    // 2. Obtener las cantidades TEÓRICAS del alcance del inventario
    const { data: productosTeoricos, error: prodError } = await supabase
      .from('productos')
      .select('item, cantidad')
      .eq('consecutivo', consecutivo);
    if (prodError) throw prodError;
    
    // Creamos un mapa para fácil acceso: { item_id => cantidad_teorica }
    const mapaTeorico = new Map(productosTeoricos.map(p => [p.item, p.cantidad]));

    // 3. Obtener TODOS los escaneos REALES y agruparlos por item
    const { data: detallesReales, error: detError } = await supabase
      .rpc('sumar_detalles_por_item', { inventario_uuid: inventarioId });
    if (detError) throw detError;
    
    // Creamos un mapa para fácil acceso: { item_id => cantidad_contada }
    const mapaReal = new Map(detallesReales.map(d => [d.item_id, d.total_contado]));
    
    // 4. Unir y construir la comparación
    const { data: itemsInfo, error: itemsError } = await supabase
      .from('maestro_items')
      .select('item_id, descripcion, grupo')
      .in('item_id', Array.from(mapaTeorico.keys()));
    if (itemsError) throw itemsError;

    const comparacion = itemsInfo.map(item => {
      const cantidadOriginal = mapaTeorico.get(item.item_id) || 0;
      const conteoTotal = parseFloat(mapaReal.get(item.item_id) || 0);
      return {
        item: item.item_id,
        descripcion: item.descripcion,
        grupo: item.grupo,
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



// 📦 Obtener productos por grupo
export const obtenerProductosPorGrupo = async (req, res) => {
  const { grupo } = req.query;

  if (!grupo) {
    return res.status(400).json({ success: false, message: "El parámetro 'grupo' es requerido" });
  }

  try {
    const { data, error } = await supabase
      .from("productos")
      .select("codigo_barras, descripcion")
      .eq("grupo", grupo)
      .neq("codigo_barras", null)
      .neq("descripcion", null); // Evitar descripciones nulas

    if (error) throw error;

    const productos = data.map(row => ({
      codigo: row.codigo_barras.trim(),
      descripcion: row.descripcion.trim()
    }));

    res.json({ success: true, productos });
  } catch (error) {
    console.error("Error en obtenerProductosPorGrupo:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// backend: /routes/inventarios.js
export const actualizarEstadoInventario = async (req, res) => {
  const { id } = req.params;
  const { usuario_email, estado_aprobacion, consecutivo } = req.body;

  // Validate required fields
  if (!id || !usuario_email || !estado_aprobacion) {
    return res.status(400).json({ success: false, message: "El 'id', 'usuario_email' y 'estado_aprobacion' son requeridos" });
  }

  if (!["aprobado", "rechazado"].includes(estado_aprobacion)) {
    return res.status(400).json({ success: false, message: "El 'estado_aprobacion' debe ser 'aprobado' o 'rechazado'" });
  }

  try {
    // Verify inventory exists and is finalized
    const { data: inventario, error: inventarioError } = await supabase
      .from("inventarios")
      .select("id, estado, estado_aprobacion")
      .eq("id", id)
      .eq("estado", "finalizado")
      .single();

    if (inventarioError || !inventario) {
      return res.status(404).json({ success: false, message: "Inventario no encontrado o no está finalizado" });
    }

    if (inventario.estado_aprobacion !== "pendiente") {
      return res.status(400).json({ success: false, message: "El inventario ya ha sido aprobado o rechazado" });
    }

    // Prepare update object
    const updateData = {
      estado_aprobacion,
      usuario_email, // Record who performed the action
      fecha_aprobacion: new Date().toISOString(), // Record action timestamp
    };

    // Include consecutivo only if provided and approving
    if (estado_aprobacion === "aprobado" && consecutivo) {
      updateData.consecutivo = consecutivo;
    }

    // Update inventory
    const { data, error } = await supabase
      .from("inventarios")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;

    res.json({
      success: true,
      message: `Inventario ${estado_aprobacion} correctamente`,
      data,
    });
  } catch (error) {
    console.error(`Error al ${estado_aprobacion === "aprobado" ? "aprobar" : "rechazar"} inventario:`, error);
    res.status(500).json({ success: false, message: `Error: ${error.message}` });
  }
};

// ✅ Endpoint para cargar el Excel y poblar las tablas maestras
export const cargarMaestroDeProductos = async (req, res) => {
  try {
    const productosDelExcel = req.body;
    if (!Array.isArray(productosDelExcel) || productosDelExcel.length === 0) {
      return res.status(400).json({ success: false, message: "El archivo Excel está vacío o es inválido." });
    }

    // --- Función de ayuda para obtener valores sin importar mayúsculas/minúsculas ---
    const getValue = (row, keys) => {
      for (const key of keys) {
        if (row[key] !== undefined) return row[key];
      }
      return undefined;
    };

    // --- 1. Preparar ITEMS únicos para la tabla `maestro_items` ---
    const itemsMap = new Map();
    productosDelExcel.forEach(p => {
      // Buscamos 'Item' o 'ITEM'
      const itemId = getValue(p, ['Item', 'ITEM']);
      if (itemId) {
        const itemIdStr = String(itemId).trim();
        if (!itemsMap.has(itemIdStr)) {
          itemsMap.set(itemIdStr, {
            item_id: itemIdStr,
            // Buscamos 'Desc. item' o 'DESC. ITEM'
            descripcion: String(getValue(p, ['Desc. item', 'DESC. ITEM']) || 'Sin descripción').trim(),
            // Buscamos 'Grupo' o 'GRUPO'
            grupo: String(getValue(p, ['Grupo', 'GRUPO']) || 'Sin Grupo').trim()
          });
        }
      }
    });
    const itemsParaInsertar = Array.from(itemsMap.values());

    // --- 2. Preparar TODOS los códigos de barras ---
    const codigosParaInsertar = productosDelExcel
      .map(p => {
        const codigo = getValue(p, ['Codigo_barras', 'Código de barras', 'CODIGO BARRAS']);
        const item = getValue(p, ['Item', 'ITEM']);
        const um = getValue(p, ['U.M', 'Unidad de Medida', 'UNIDAD DE MEDIDA']);

        if (codigo && item) {
          return {
            codigo_barras: String(codigo).trim(),
            item_id: String(item).trim(),
            unidad_medida: String(um || 'UND').trim()
          };
        }
        return null;
      })
      .filter(Boolean); // Filtra los nulos si una fila no tenía código o item

    // --- 3. Ejecutar las inserciones en Supabase (sin cambios aquí) ---
    await supabase.from('maestro_items').upsert(itemsParaInsertar, { onConflict: 'item_id' });
    await supabase.from('maestro_codigos').upsert(codigosParaInsertar, { onConflict: 'codigo_barras' });
    
    res.json({ success: true, message: `Carga completada: ${itemsParaInsertar.length} items y ${codigosParaInsertar.length} códigos actualizados/insertados.` });
  } catch (error) {
    console.error("Error en cargarMaestroDeProductos:", error);
    res.status(500).json({ success: false, message: `Error en el servidor: ${error.message}` });
  }
};

// ✅ Para buscar un producto por su código de barras en tiempo real
export const buscarProductoMaestro = async (req, res) => {
    try {
        const { codigo_barras } = req.params;
        if (!codigo_barras) return res.status(400).json({ success: false, message: 'Se requiere un código de barras.' });
        
        const { data: codigoData, error: codigoError } = await supabase
            .from('maestro_codigos')
            .select('item_id, unidad_medida, maestro_items(descripcion, grupo)')
            .eq('codigo_barras', codigo_barras)
            .single();

        if (codigoError) return res.status(404).json({ success: false, message: 'Código de barras no encontrado.' });
        
        const productoInfo = {
            item: codigoData.item_id,
            descripcion: codigoData.maestro_items.descripcion,
            grupo: codigoData.maestro_items.grupo,
            unidad_medida: codigoData.unidad_medida
        };
        res.json({ success: true, producto: productoInfo });
    } catch (error) {
        res.status(500).json({ success: false, message: `Error: ${error.message}` });
    }
};

export const obtenerInventariosActivos = async (req, res) => {
  try {
    const { data, error } = await supabase.from('inventarios').select('id, descripcion, categoria, consecutivo').eq('estado', 'activo').order('fecha_inicio', { ascending: false });
    if (error) throw error;
    res.json({ success: true, inventarios: data });
  } catch (error) {
    res.status(500).json({ success: false, message: `Error: ${error.message}` });
  }
};

export const obtenerItemsPorConsecutivo = async (req, res) => {
    try {
        const { consecutivo } = req.params;
        const { data, error } = await supabase.from('productos').select('item').eq('consecutivo', consecutivo);
        if (error) throw error;
        res.json({ success: true, items: data.map(i => i.item) });
    } catch (error) {
        res.status(500).json({ success: false, message: `Error: ${error.message}` });
    }
};

export const definirAlcanceInventario = async (req, res) => {
  try {
    const productos = req.body;
    if (!Array.isArray(productos) || productos.length === 0) return res.status(400).json({ message: "Lista de productos para alcance inválida." });
    
    const consecutivo = productos[0].consecutivo;
    if (!consecutivo) return res.status(400).json({ message: "El consecutivo es requerido." });

    const alcanceParaInsertar = productos.map(p => ({
        item: p.item,
        codigo_barras: p.codigo_barras,
        cantidad: p.cantidad || 0,
        consecutivo: p.consecutivo,
        bodega: p.bodega || null // <-- LÍNEA AÑADIDA
    }));
    
    // Borramos el alcance anterior para este consecutivo por si se recarga el archivo
    await supabase.from('productos').delete().eq('consecutivo', consecutivo);
    
    // Insertamos el nuevo alcance
    const { error } = await supabase.from('productos').insert(alcanceParaInsertar);
    if (error) throw error;

    res.json({ success: true, message: "Alcance de inventario definido correctamente." });
  } catch (error) {
    res.status(500).json({ success: false, message: `Error: ${error.message}` });
  }
};

// ✅ NUEVO: Endpoint para el autocompletado de Carnes/Fruver
// Esta función obtiene todos los items de la base de datos maestra.
export const obtenerMaestroItems = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('maestro_items')
      .select('item_id, descripcion')
      .order('descripcion', { ascending: true });

    if (error) throw error;
    
    res.json({ success: true, items: data });
  } catch (error) {
    console.error("Error en obtenerMaestroItems:", error);
    res.status(500).json({ success: false, message: `Error: ${error.message}` });
  }
};

// ✅ NUEVO Y UNIFICADO: Crea el inventario y define su alcance en una sola operación
export const crearInventarioYDefinirAlcance = async (req, res) => {
  // Obtenemos todos los datos del formulario y del archivo
  const { nombre, descripcion, fecha, consecutivo, categoria, productos, usuario_email } = req.body;
  const archivo = req.file;
  
  // Validación de datos
  if (!nombre || !fecha || !consecutivo || !categoria || !productos || !archivo) {
      return res.status(400).json({ success: false, message: "Faltan campos requeridos en el formulario." });
  }

  try {
      // --- PASO 1: Subir el archivo Excel a Supabase Storage ---
      const extension = archivo.originalname.split(".").pop();
      const nombreArchivo = `excel-inventarios/inventario_${consecutivo}_${Date.now()}.${extension}`;
      const { error: uploadError } = await supabase.storage
          .from("inventario") // Asegúrate que tu bucket se llame 'inventario'
          .upload(nombreArchivo, archivo.buffer, { contentType: archivo.mimetype });
      if (uploadError) throw uploadError;

      const { data: publicUrlData } = supabase.storage.from("inventario").getPublicUrl(nombreArchivo);
      const excelUrl = publicUrlData.publicUrl;

      // --- PASO 2: Guardar el registro administrativo en la tabla 'inventario_admin' ---
      // Esta tabla SÍ tiene la columna 'archivo_excel'
      const { error: adminError } = await supabase
          .from("inventario_admin")
          .insert({ nombre, descripcion, fecha, consecutivo, archivo_excel: excelUrl });
      if (adminError) throw adminError;

      // --- PASO 3: Crear la sesión de inventario 'activo' en la tabla 'inventarios' ---
      // Esta tabla NO tiene 'archivo_excel', por eso la quitamos de aquí.
      const { data: inventarioCreado, error: inventarioError } = await supabase
          .from("inventarios")
          .insert({
              descripcion: nombre, // Podemos usar el nombre del inventario como su descripción
              consecutivo,
              categoria,
              usuario_email, // El email del admin que lo está creando
              estado: 'activo' // Nace como un inventario activo, listo para ser contado
          })
          .select('id')
          .single();
      if (inventarioError) throw inventarioError;
      
      // --- PASO 4: Guardar el alcance (los productos del excel) en la tabla 'productos' ---
      const productosDelExcel = JSON.parse(productos);
      const alcanceParaInsertar = productosDelExcel.map(p => ({
          item: p.Item,
          codigo_barras: p['Codigo_barras'],
          cantidad: p['Cant. disponible'] || 0,
          bodega: p.Bodega || null,
          consecutivo: consecutivo,
      }));
      
      await supabase.from('productos').delete().eq('consecutivo', consecutivo);
      const { error: productosError } = await supabase.from('productos').insert(alcanceParaInsertar);
      if (productosError) throw productosError;

      // --- PASO 5: Enviar respuesta de éxito ---
      res.json({ success: true, message: `Inventario #${consecutivo} creado y listo para ser contado.` });

  } catch (error) {
      console.error("Error al crear inventario:", error);
      res.status(500).json({ success: false, message: `Error: ${error.message}` });
  }
};

// ✅ Para el dropdown de Categorías del Administrador
export const obtenerGruposMaestros = async (req, res) => {
  try {
    const { data, error } = await supabase.rpc('obtener_grupos_unicos');
    if (error) throw error;
    const gruposOrdenados = data.map(item => item.grupo).sort();
    res.json({ success: true, grupos: gruposOrdenados });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

// ✅ NUEVO: Obtiene las unidades de medida disponibles para un item específico
export const obtenerUnidadesPorItem = async (req, res) => {
  try {
    const { item_id } = req.params;
    if (!item_id) {
      return res.status(400).json({ success: false, message: "Se requiere un item_id." });
    }

    // Hacemos una consulta a la tabla maestra de códigos para encontrar las unidades únicas
    // La función 'distinct' en el select asegura que no obtengamos 'UND' repetido, por ejemplo.
    const { data, error } = await supabase
      .from('maestro_codigos')
      .select('unidad_medida') // Seleccionamos solo la columna que nos interesa
      .eq('item_id', item_id);

    if (error) throw error;
    
    // Devolvemos una lista limpia de las unidades de medida encontradas
    const unidadesUnicas = [...new Set(data.map(u => u.unidad_medida).filter(Boolean))];

    res.json({ success: true, unidades: unidadesUnicas });

  } catch (error) {
    console.error("Error en obtenerUnidadesPorItem:", error);
    res.status(500).json({ success: false, message: `Error: ${error.message}` });
  }
};

// ✅ Endpoint simplificado para eliminar un registro de escaneo
export const eliminarDetalleInventario = async (req, res) => {
  try {
    const { id } = req.params; // El ID viene de la URL
    if (!id) {
      return res.status(400).json({ success: false, message: "Se requiere el ID del registro." });
    }

    // La única operación necesaria: borrar la fila de la tabla de detalles.
    const { error } = await supabase
      .from('detalles_inventario')
      .delete()
      .eq('id', id);

    if (error) {
      console.error("Error al eliminar el detalle:", error);
      throw error;
    }

    res.json({ success: true, message: "Registro eliminado correctamente." });

  } catch (error) {
    res.status(500).json({ success: false, message: `Error en el servidor: ${error.message}` });
  }
};

// ✅ NUEVO: Obtiene un código de barras de ejemplo para un item.
export const obtenerBarcodeParaItem = async (req, res) => {
  try {
    const { item_id } = req.params;
    const { data, error } = await supabase
      .from('maestro_codigos')
      .select('codigo_barras')
      .eq('item_id', item_id)
      .limit(1)
      .single();
    
    // No es un error si no encuentra uno, simplemente devolverá null.
    if (error && error.code !== 'PGRST116') throw error;

    res.json({ success: true, codigo_barras: data?.codigo_barras || null });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ✅ Obtiene la lista de items maestros filtrados por grupos específicos.
export const obtenerMaestroItemsPorGrupo = async (req, res) => {
  try {
    // El frontend nos dirá qué grupos buscar.
    let { grupos } = req.query; // ej: ?grupos=Carnes,Fruver

    if (!grupos) {
      return res.status(400).json({ success: false, message: "Se requiere al menos un grupo." });
    }

    const gruposArray = Array.isArray(grupos) ? grupos : grupos.split(',');

    const { data, error } = await supabase
      .from('maestro_items')
      .select('item_id, descripcion')
      .in('grupo', gruposArray) // Usamos 'in' para buscar en una lista de grupos
      .order('descripcion', { ascending: true });

    if (error) throw error;
    
    res.json({ success: true, items: data });
  } catch (error) {
    console.error("Error en obtenerMaestroItemsPorGrupo:", error);
    res.status(500).json({ success: false, message: `Error: ${error.message}` });
  }
};