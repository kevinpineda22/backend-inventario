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
    if (!file.mimetype.startsWith("image/")) {
      return cb(new Error("Solo se permiten imágenes"));
    }
    cb(null, true);
  },
}).single("file");

// 🚀 Registrar escaneo
export const registrarEscaneo = async (req, res) => {
  const { codigo, cantidad, inventario_id, usuario_email } = req.body;

  if (!codigo || !cantidad || !inventario_id || !usuario_email) {
    return res.status(400).json({ success: false, message: "Datos incompletos: código, cantidad, inventario_id y usuario_email son requeridos" });
  }

  const cantidadSumar = parseInt(cantidad);
  if (isNaN(cantidadSumar) || cantidadSumar <= 0) {
    return res.status(400).json({ success: false, message: "Cantidad inválida" });
  }

  try {
    console.log("Registrando escaneo:", { codigo, cantidad: cantidadSumar, inventario_id, usuario_email });

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

    // Buscar el producto
    const { data: producto, error: productoError } = await supabase
      .from("productos")
      .select("*")
      .eq("codigo_barras", codigo)
      .single();

    if (productoError || !producto) {
      return res.status(404).json({ success: false, message: "Producto no encontrado" });
    }

    // Actualizar cantidad
    const nuevaCantidad = (producto.cantidad || 0) + cantidadSumar;
    const { error: updateError } = await supabase
      .from("productos")
      .update({ cantidad: nuevaCantidad })
      .eq("id", producto.id);

    // Insertar en detalles_inventario
    const { error: insertError, data: insertData } = await supabase
      .from("detalles_inventario")
      .insert([{ inventario_id, producto_id: producto.id, cantidad: cantidadSumar, usuario: usuario_email }])
      .select();

    console.log("Inserción en detalles_inventario:", { insertData, insertError });

    if (updateError || insertError) {
      console.error("❌ Error al actualizar o insertar:", updateError || insertError);
      return res.status(500).json({ success: false, message: "Error al registrar escaneo" });
    }

    res.json({
      success: true,
      descripcion: producto.descripcion,
      cantidad: nuevaCantidad,
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

// ✅ Insertar productos desde Excel
export const importarProductosDesdeExcel = async (req, res) => {
  try {
    const productos = req.body;

    if (!Array.isArray(productos) || productos.length === 0) {
      return res.status(400).json({ success: false, message: "Lista de productos inválida o vacía" });
    }

    const productosFormateados = productos.map((p) => ({
      codigo_barras: String(p.codigo).trim(),
      descripcion: p.descripcion?.trim() || p["desc"]?.trim() || "",
      item: p.item || "",
      grupo: p.grupo || "",
      bodega: p.bodega || "",
      unidad: p.unidad || "",
      cantidad: parseInt(p.cantidad || 0),
    }));

    // Upsert por codigo_barras
    const { error } = await supabase
      .from("productos")
      .upsert(productosFormateados, { onConflict: "codigo_barras" });

    if (error) {
      console.error("Error al insertar productos:", error);
      return res.status(500).json({ success: false, message: "Error al insertar productos" });
    }

    res.json({ success: true, message: "Productos cargados correctamente", cantidad: productosFormateados.length });
  } catch (error) {
    console.error("Error en importarProductosDesdeExcel:", error);
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