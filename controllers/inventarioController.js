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

// 🚀 Registrar escaneo
export const registrarEscaneo = async (req, res) => {
  const { codigo, descripcion, cantidad, inventario_id, usuario_email, item } = req.body;

  if (!descripcion || !cantidad || !inventario_id || !usuario_email) {
    return res.status(400).json({
      success: false,
      message: "Datos incompletos: descripción, cantidad, inventario_id y usuario_email son requeridos",
    });
  }

  const cantidadSumar = parseFloat(cantidad); // Cambiado a parseFloat para soportar decimales
  if (isNaN(cantidadSumar) || cantidadSumar <= 0) {
    return res.status(400).json({ success: false, message: "Cantidad inválida" });
  }

  try {
    console.log("Registrando escaneo:", {
      codigo,
      descripcion,
      cantidad: cantidadSumar,
      inventario_id,
      usuario_email,
      item,
    });

    // Verificar que exista el inventario
    const { data: inventario, error: inventarioError } = await supabase
      .from("inventarios")
      .select("id, estado")
      .eq("id", inventario_id)
      .single();

    if (inventarioError || !inventario) {
      return res.status(404).json({ success: false, message: "Inventario no encontrado" });
    }

    if (inventario.estado === "finalizado") {
      return res.status(400).json({ success: false, message: "El inventario ya está finalizado" });
    }

    // Buscar el producto por código de barras o descripción
    let productoQuery = supabase.from("productos").select("id, codigo_barras, descripcion, item, conteo_cantidad");
    
    if (codigo) {
      productoQuery = productoQuery.eq("codigo_barras", codigo);
    } else {
      productoQuery = productoQuery.eq("descripcion", descripcion.trim());
    }

    const { data: producto, error: productoError } = await productoQuery.single();

    if (productoError || !producto) {
      return res.status(404).json({
        success: false,
        message: "Producto no encontrado",
      });
    }

    // Sumar a conteo_cantidad
    const nuevaConteo = (producto.conteo_cantidad || 0) + cantidadSumar;
    const { error: updateError } = await supabase
      .from("productos")
      .update({ conteo_cantidad: nuevaConteo })
      .eq("id", producto.id);

    // Insertar en detalles_inventario
    const { error: insertError, data: insertData } = await supabase
      .from("detalles_inventario")
      .insert([
        {
          inventario_id,
          producto_id: producto.id,
          cantidad: cantidadSumar,
          usuario: usuario_email,
        },
      ])
      .select();

    console.log("Inserción en detalles_inventario:", { insertData, insertError });

    if (updateError || insertError) {
      console.error("❌ Error al actualizar o insertar:", updateError || insertError);
      return res.status(500).json({ success: false, message: "Error al registrar escaneo" });
    }

    // Devolver item en la respuesta
    res.json({
      success: true,
      descripcion: producto.descripcion,
      item: producto.item || "N/A",
      cantidad: nuevaConteo,
    });
  } catch (error) {
    console.error("Error en registrarEscaneo:", error);
    res.status(500).json({ success: false, message: `Error: ${error.message}` });
  }
};

// 🟢 Iniciar inventario
export const iniciarInventario = async (req, res) => {
  const { categoria, descripcion, foto_url, usuario_email } = req.body;

  if (!categoria) {
    return res.status(400).json({ success: false, message: "El campo 'categoria' es requerido" });
  }
  if (!descripcion) {
    return res.status(400).json({ success: false, message: "El campo 'descripcion' es requerido" });
  }
  if (!usuario_email) {
    return res.status(400).json({ success: false, message: "El campo 'usuario_email' es requerido" });
  }

  try {
    const { data, error } = await supabase
      .from("inventarios")
      .insert([{ categoria, descripcion, foto_url, usuario_email, estado: "activo" }])
      .select()
      .single();

    if (error) {
      console.error("Error al insertar inventario:", error);
      return res.status(500).json({ success: false, message: `Error al insertar inventario: ${error.message}` });
    }

    res.json({ success: true, inventario_id: data.id });
  } catch (error) {
    console.error("Error en iniciarInventario:", error);
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
  console.log("Solicitando historial para inventario_id:", inventario_id);

  try {
    const { data, error } = await supabase
      .from("detalles_inventario")
      .select("id, cantidad, fecha_hora, producto:producto_id(descripcion, codigo_barras)")
      .eq("inventario_id", inventario_id)
      .order("fecha_hora", { ascending: false });

    console.log("Resultado de Supabase:", { data, error });

    if (error) {
      console.error("Error al obtener historial:", error);
      return res.status(500).json({ success: false, message: `Error al obtener historial: ${error.message}` });
    }

    res.json({ success: true, historial: data || [] });
  } catch (error) {
    console.error("Error en obtenerHistorialInventario:", error);
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

// 📂 Obtener categorías
export const obtenerGrupos = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("productos")
      .select("grupo")
      .neq("grupo", null);

    if (error) throw error;

    const gruposUnicos = [...new Set(data.map((row) => row.grupo).filter(Boolean))].sort();

    res.json({ success: true, grupos: gruposUnicos });
  } catch (error) {
    console.error("Error en obtenerGrupos:", error);
    res.status(500).json({ success: false, message: error.message });
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

    // Convertimos el mapa de nuevo a un array de productos, ahora sin duplicados.
    const productosConsolidados = Array.from(mapaDeProductos.values());
    // --- FIN DE LA LÓGICA DE CONSOLIDACIÓN ---


    // Ahora usamos el array limpio y consolidado para el upsert.
    const { error } = await supabase
      .from("productos")
      .upsert(productosConsolidados, { onConflict: "codigo_barras" });

    if (error) {
      console.error("Error de Supabase al hacer upsert:", error); 
      // Devolvemos el error detallado de la base de datos para facilitar la depuración.
      return res.status(500).json({ 
        success: false, 
        message: "Error al insertar productos", 
        details: error 
      });
    }

    res.json({ 
      success: true, 
      message: "Productos cargados y consolidados correctamente", 
      cantidad: productosConsolidados.length 
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

    if (!nombre || !fecha || !archivo) {
      return res.status(400).json({ success: false, message: "Faltan campos requeridos o archivo Excel" });
    }

    const extension = archivo.originalname.split(".").pop();
    const nombreArchivo = `excel-inventarios/inventario_${Date.now()}.${extension}`;

    const { error: uploadError } = await supabase.storage
      .from("inventario")
      .upload(nombreArchivo, archivo.buffer, {
        contentType: archivo.mimetype,
        upsert: true,
      });

    if (uploadError) {
      throw new Error("Error al subir el archivo: " + uploadError.message);
    }

    const { data: publicUrlData } = supabase.storage
      .from("inventario")
      .getPublicUrl(nombreArchivo);

    const { data, error: insertError } = await supabase
      .from("inventario_admin")
      .insert([{ nombre, descripcion, fecha, consecutivo, archivo_excel: publicUrlData.publicUrl }])
      .select()
      .single();

    if (insertError) throw insertError;

    res.json({ success: true, data });
  } catch (error) {
    console.error("Error al guardar datos del admin con archivo Excel:", error);
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
  const { id } = req.params;

  try {
    // 1. Obtener todos los productos escaneados en este inventario
    const { data: detalles, error: errorDetalles } = await supabase
      .from("detalles_inventario")
      .select("producto_id, cantidad")
      .eq("inventario_id", id);

    if (errorDetalles) throw errorDetalles;

    // 2. Agrupar conteo por producto_id
    const conteosPorProducto = {};
    detalles.forEach((detalle) => {
      if (!conteosPorProducto[detalle.producto_id]) {
        conteosPorProducto[detalle.producto_id] = 0;
      }
      conteosPorProducto[detalle.producto_id] += detalle.cantidad;
    });

    const productoIds = Object.keys(conteosPorProducto);

    if (productoIds.length === 0) {
      return res.json({ success: true, comparacion: [] });
    }

    // 3. Consultar productos originales, incluyendo el campo item
    const { data: productos, error: errorProductos } = await supabase
      .from("productos")
      .select("id, codigo_barras, item, descripcion, cantidad") // Agregamos 'item'
      .in("id", productoIds);

    if (errorProductos) throw errorProductos;

    // 4. Construir la respuesta comparativa
    const comparacion = productos.map((p) => ({
      codigo_barras: p.codigo_barras,
      item: p.item || "N/A", // Aseguramos un valor por defecto
      descripcion: p.descripcion,
      cantidad_original: p.cantidad || 0,
      conteo_total: conteosPorProducto[p.id] || 0,
      diferencia: (conteosPorProducto[p.id] || 0) - (p.cantidad || 0),
    }));

    res.json({ success: true, comparacion });
  } catch (error) {
    console.error("Error en compararInventario:", error);
    res.status(500).json({ success: false, message: "Error al comparar inventario" });
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