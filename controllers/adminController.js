import { createClient } from "@supabase/supabase-js";
import multer from "multer";
import dotenv from "dotenv";
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// --- MIDDLEWARES DE SUBIDA DE ARCHIVOS ESPECIALIZADOS ---

// Configuración de multer para subir imágenes
const storage = multer.memoryStorage();

// ✅ Middleware 1: Solo para imágenes
export const uploadImage = multer({
  storage: storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true); // Acepta cualquier tipo de imagen (jpeg, png, webp, gif, etc.)
    } else {
      cb(new Error("Tipo de archivo no permitido. Solo se aceptan imágenes."), false);
    }
  },
}).single("file");

// ✅ Middleware 2: Solo para archivos de Excel
export const uploadExcel = multer({
  storage: storage,
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // .xlsx
      "application/vnd.ms-excel" // .xls
    ];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Tipo de archivo no permitido. Solo se aceptan archivos Excel (.xls, .xlsx)."), false);
    }
  },
}).single("file");


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

// Middleware para procesar campos de formulario aunque no haya archivos
export const parseFormData = multer().none();

// --- Controladores para el Panel de Administrador ---

// Crea la sesión de inventario y define su alcance
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
    await supabase
      .from("inventario_admin")
      .insert({ nombre, descripcion, fecha, consecutivo, archivo_excel: excelUrl });

    // --- PASO 3: Crear la sesión de inventario 'activo' en la tabla 'inventarios' ---
   await supabase
      .from("inventarios")
      .insert({
          descripcion: nombre,
          consecutivo,
          categoria,
          admin_email: usuario_email, // Guardamos en la nueva columna
          estado: 'activo'
      });

    // --- PASO 4: Guardar el ALCANCE COMPLETO del Excel en la tabla 'productos' ---
    const productosDelExcel = JSON.parse(productos);

    // Función de ayuda para leer los encabezados sin importar mayúsculas/minúsculas o tildes
    const getValue = (row, keys) => {
      for (const key of keys) {
        if (row[key] !== undefined) return row[key];
      }
      return undefined;
    };

    const alcanceParaInsertar = productosDelExcel.map(p => {
      // ✅ CORRECCIÓN: Limpiamos y convertimos la cantidad a un formato numérico válido
      const rawCantidad = getValue(p, ['Cant. disponible', 'cantidad']);
      let cantidadNumerica = 0;
      if (typeof rawCantidad === 'string') {
        // Elimina las comas (separadores de miles) y convierte a número
        cantidadNumerica = parseFloat(rawCantidad.replace(/,/g, ''));
      } else if (typeof rawCantidad === 'number') {
        cantidadNumerica = rawCantidad;
      }

      return {
        // Mapeamos cada columna de la tabla 'productos' con los datos del Excel
        item: String(getValue(p, ['Item', 'item', 'ITEM']) || ''),
        codigo_barras: String(getValue(p, ['Código barra principal', 'Codigo_barras', 'Código de barras']) || ''),
        descripcion: String(getValue(p, ['Desc. item', 'desc. item', 'DESC. ITEM']) || 'Sin Descripción'),
        grupo: String(getValue(p, ['GRUPO', 'Grupo', 'grupo']) || 'Sin Grupo'),
        bodega: String(getValue(p, ['Bodega', 'bodega', 'BODEGA']) || ''),
        unidad: String(getValue(p, ['U.M.', 'U.M', 'Unidad de Medida']) || 'UND'),
        cantidad: isNaN(cantidadNumerica) ? 0 : cantidadNumerica, // Usamos el valor numérico limpio
        consecutivo: consecutivo,
        conteo_cantidad: 0 // El conteo físico siempre empieza en 0
      };
    }).filter(p => p.item && p.item.trim() !== ''); // Ignorar filas completamente vacías

    // Borramos el alcance anterior y guardamos el nuevo
    await supabase.from('productos').delete().eq('consecutivo', consecutivo);
    const { error: productosError } = await supabase.from('productos').insert(alcanceParaInsertar);
    if (productosError) throw productosError;

    res.json({ success: true, message: `Inventario #${consecutivo} creado y listo.` });

  } catch (error) {
    console.error("Error al crear inventario:", error);
    res.status(500).json({ success: false, message: `Error: ${error.message}` });
  }
};

// Nuevo endpoint para crear inventario de carnes y fruver desde la maestra

export const crearInventarioCarnesYFruver = async (req, res) => {
  // Extraer los datos enviados desde el frontend
  const { tipo_inventario, fecha, consecutivo, categoria } = req.body;
  console.log("req.body:", req.body);

  // Validar campos requeridos
  if (!tipo_inventario || !fecha || !consecutivo || !categoria) {
    return res.status(400).json({ success: false, message: "Faltan campos requeridos: tipo_inventario, fecha, consecutivo o categoria." });
  }

  // Validar que tipo_inventario sea válido (por ejemplo, "carnes" o "fruver")
  if (tipo_inventario !== "carnes" && tipo_inventario !== "fruver") {
    return res.status(400).json({ success: false, message: "Tipo de inventario no válido." });
  }

  try {
    // ...aquí puedes agregar la lógica que necesites para crear el inventario...
    // Por ahora solo responde con éxito para confirmar que los datos llegan bien.
    res.json({
      success: true,
      message: `Inventario #${consecutivo} de tipo ${tipo_inventario} para la categoría ${categoria} recibido correctamente.`,
      data: { tipo_inventario, fecha, consecutivo, categoria }
    });
  } catch (error) {
    console.error("Error al crear inventario carnes y fruver:", error);
    res.status(500).json({ success: false, message: `Error: ${error.message}` });
  }
};

// Obtiene los inventarios ya finalizados para la aprobación
export const obtenerInventariosFinalizados = async (req, res) => {
  const { estado_aprobacion = 'pendiente' } = req.query; // Default to 'pendiente'
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
            cantidad
          )
        )
      `)
      .eq("estado", "finalizado")
      .eq("estado_aprobacion", estado_aprobacion)
      .order("fecha_fin", { ascending: false });

    if (error) throw error;

    // Calcular conteo_total por zona y operario
    const inventariosConConteo = data.map(inventario => {
      const zonasConConteo = inventario.inventario_zonas.map(zona => {
        const conteo_total = zona.detalles_inventario.reduce((sum, detalle) => sum + (detalle.cantidad || 0), 0);
        return { ...zona, conteo_total };
      });
      return { ...inventario, inventario_zonas: zonasConConteo };
    });

    res.json({ success: true, inventarios: inventariosConConteo });
  } catch (error) {
    console.error("Error al obtener inventarios finalizados:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Aprueba o rechaza un inventario finalizado
export const actualizarEstadoInventario = async (req, res) => {
  const { id } = req.params;
   const { admin_email, estado_aprobacion, consecutivo } = req.body;

  // Validate required fields
  if (!id || !admin_email || !estado_aprobacion) {
    return res.status(400).json({ success: false, message: "Faltan datos requeridos (id, admin_email, estado_aprobacion)." });
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
      admin_email, // Usamos la columna correcta para registrar quién aprueba/rechaza
      fecha_aprobacion: new Date().toISOString(),
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

// 🔼 Subir foto al bucket 'inventario'
export const subirFoto = async (req, res) => {
  const archivo = req.file;
  const nombreBase = req.body.filename;

  if (!archivo || !nombreBase) {
    return res.status(400).json({ success: false, message: "Archivo o nombre faltante" });
  }

  const nombreArchivo = `fotos-zona/${Date.now()}_${nombreBase}`;

  try {
    const { error: uploadError } = await supabase.storage
      .from("inventario")
      .upload(nombreArchivo, archivo.buffer, { contentType: archivo.mimetype });

    if (uploadError) throw uploadError;

    const { data: publicUrl } = supabase.storage.from("inventario").getPublicUrl(nombreArchivo);
    res.json({ success: true, url: publicUrl.publicUrl });
  } catch (error) {
    res.status(500).json({ success: false, message: `Error: ${error.message}` });
  }
};

// ✅ Obtiene los inventarios y anida todas sus zonas de conteo asociadas
export const obtenerInventariosConZonas = async (req, res) => {
  try {
    // Usamos la magia de Supabase para traer los inventarios y, dentro de cada uno,
    // un array con todas sus zonas correspondientes.
    const { data, error } = await supabase
      .from('inventarios')
      .select(`
        *,
        inventario_zonas (
          id,
          descripcion_zona,
          operario_email,
          estado,
          creada_en
        )
      `)
      .order('fecha_inicio', { ascending: false });

    if (error) throw error;
    
    res.json({ success: true, inventarios: data });
  } catch (error) {
    console.error("Error en obtenerInventariosConZonas:", error);
    res.status(500).json({ success: false, message: `Error: ${error.message}` });
  }
};