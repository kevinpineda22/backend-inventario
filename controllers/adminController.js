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


// Crea un inventario de carnes o fruver desde la maestra
export const crearInventarioCarnesYFruver = async (req, res) => {
  // Extraer los datos enviados desde el frontend
  const { tipo_inventario, fecha, consecutivo, categoria } = req.body;
  console.log("Datos recibidos en el endpoint:", { tipo_inventario, fecha, consecutivo, categoria });

  // Validar campos requeridos
  if (!tipo_inventario || !fecha || !consecutivo || !categoria) {
    console.log("Error: Faltan campos requeridos", { tipo_inventario, fecha, consecutivo, categoria });
    return res.status(400).json({ success: false, message: "Faltan campos requeridos: tipo_inventario, fecha, consecutivo o categoria." });
  }

  // Validar que tipo_inventario sea válido
  if (tipo_inventario !== "carnes" && tipo_inventario !== "fruver") {
    console.log("Error: Tipo de inventario no válido", { tipo_inventario });
    return res.status(400).json({ success: false, message: "Tipo de inventario no válido." });
  }

  try {
    // Insertar el nuevo inventario en la tabla 'inventario_carnesYfruver' de Supabase
    console.log("Intentando insertar registro en Supabase...");
    const { data, error } = await supabase
      .from("inventario_carnesYfruver")
      .insert([
        {
          tipo_inventario,
          fecha: new Date(fecha), // Asegurar que fecha sea un objeto Date
          consecutivo,
          categoria,

          
        }
      ])
      .select(); // Devuelve el registro insertado

    if (error) {
      console.error("Error al insertar en Supabase:", error);
      throw error;
    }

    console.log("Registro creado exitosamente en Supabase:", data);

    // Respuesta exitosa
    res.json({
      success: true,
      message: `Inventario #${consecutivo} de tipo ${tipo_inventario} para la categoría ${categoria} creado correctamente.`,
      data: data[0] // Devolver el primer registro insertado
    });
  } catch (error) {
    console.error("Error al crear inventario carnes y fruver:", error);
    res.status(500).json({ success: false, message: `Error: ${error.message}` });
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
      .order("consecutivo", { ascending: true }); // Ordenar por consecutivo (opcional)

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

// Obtiene los inventarios ya finalizados para la aprobación
export const obtenerInventariosFinalizados = async (req, res) => {
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
          estado_verificacion,
          detalles_inventario (
            cantidad
          )
        )
      `)
      
      .order("fecha_inicio", { ascending: false });

    if (error) throw error;

    // Calcular conteo total para cada zona
    const inventariosConZonas = data.map(inventario => {
      const zonas = inventario.inventario_zonas.map(zona => {
        const conteo_total = zona.detalles_inventario.reduce((sum, detalle) => sum + (detalle.cantidad || 0), 0);
        return { ...zona, conteo_total };
      });
      return { ...inventario, inventario_zonas: zonas };
    });

    res.json({ success: true, inventarios: inventariosConZonas });
  } catch (error) {
    console.error("Error al obtener inventarios finalizados:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Verifica (aprueba o rechaza) una zona de inventario
export const verificarZonaInventario = async (req, res) => {
  const { zona_id } = req.params;
  const { estado_verificacion, admin_email } = req.body;

  // Validar campos requeridos
  if (!zona_id || !estado_verificacion || !admin_email) {
    return res.status(400).json({ success: false, message: "Faltan datos requeridos (zona_id, estado_verificacion, admin_email)." });
  }

  // Validar estado_verificacion
  if (!["aprobado", "rechazado", "pendiente"].includes(estado_verificacion)) {
    return res.status(400).json({ success: false, message: "Estado de verificación inválido. Debe ser 'aprobado', 'rechazado' o 'pendiente'." });
  }

  try {
    // Verificar que la zona exista y esté finalizada
    const { data: zona, error: zonaError } = await supabase
      .from("inventario_zonas")
      .select("id, estado, estado_verificacion")
      .eq("id", zona_id)
      .eq("estado", "finalizada")
      .single();

    if (zonaError || !zona) {
      return res.status(404).json({ success: false, message: "Zona no encontrada o no está finalizada." });
    }

    // Actualizar solo si el estado_verificacion actual es 'pendiente' (evitar sobrescribir)
    if (zona.estado_verificacion !== "pendiente" && estado_verificacion !== "pendiente") {
      return res.status(400).json({ success: false, message: "La zona ya ha sido verificada." });
    }

    // Preparar datos de actualización
    const updateData = {
      estado_verificacion,
      admin_email,
      fecha_verificacion: new Date().toISOString(),
    };

    // Actualizar la zona
    const { data, error } = await supabase
      .from("inventario_zonas")
      .update(updateData)
      .eq("id", zona_id)
      .select()
      .single();

    if (error) throw error;

    res.json({
      success: true,
      message: `Zona ${estado_verificacion} correctamente`,
      data,
    });
  } catch (error) {
    console.error("Error al verificar zona:", error);
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

export const obtenerDetallesZona = async (req, res) => {
  const { zona_id } = req.params;

  if (!zona_id) {
    return res.status(400).json({ success: false, message: "Falta el parámetro zona_id." });
  }

  try {
    console.log(`Consultando detalles para zona_id: ${zona_id}`); // Depuración
    const { data, error } = await supabase
      .from("detalles_inventario")
      .select(`
        id,
        cantidad,
        codigo_barras_escaneado,
        item_id_registrado,
        maestro_items (
          descripcion,
          item_id
        )
      `)
      .eq("zona_id", zona_id);

    console.log("Datos crudos de Supabase:", data); // Depuración
    if (error) throw error;

    if (!data || data.length === 0) {
      console.log(`No se encontraron detalles para zona_id: ${zona_id}`);
      return res.json({ success: true, detalles: [] });
    }

    res.json({
      success: true,
      detalles: data
    });
  } catch (error) {
    console.error("Error al obtener detalles de zona:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Permite al admin finalizar el inventario completo
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

export const aplicarConteoDeZonaAprobada = async (req, res) => {
  const { zona_id } = req.params;

  if (!zona_id) {
    return res.status(400).json({ success: false, message: "Falta el parámetro zona_id." });
  }

  try {
    // Llamamos a la función RPC que creamos en la base de datos
    const { error } = await supabase.rpc('aplicar_conteo_aprobado', {
      p_zona_id: zona_id
    });

    if (error) {
      // Si la función de la BD devuelve un error, lo capturamos
      console.error("Error al ejecutar RPC aplicar_conteo_aprobado:", error);
      throw error;
    }

    console.log(`Conteo de la zona ${zona_id} aplicado correctamente a la tabla productos.`);
    res.json({ success: true, message: "Conteo de la zona aprobado y aplicado correctamente." });

  } catch (error) {
    res.status(500).json({ success: false, message: `Error en el servidor: ${error.message}` });
  }
};
