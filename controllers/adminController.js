import * as XLSX from 'xlsx';
import { createClient } from "@supabase/supabase-js";
import multer from "multer";
import dotenv from "dotenv";
import { sendEmail } from './emailService.js';


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
  const { nombre, descripcion, fecha, consecutivo, categoria, sede, productos, usuario_email } = req.body; // ✅ Agregar sede
  const archivo = req.file;

  // Validación de datos
  if (!nombre || !fecha || !consecutivo || !categoria || !sede || !productos || !archivo) { // ✅ Validar sede
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
        sede, // ✅ Agregar sede
        admin_email: usuario_email,
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
        codigo_barras: String(getValue(p, [
          'Código barras',           // ← El que aparece en tu imagen (CON TILDE Y ESPACIO)
          'codigo_barras',           // ← El campo de la base de datos
          'Código barra principal',
          'Codigo_barras',
          'Código de barras',
          'codigo barras'            // Sin tilde pero con espacio
        ]) || ''), 
        descripcion: String(getValue(p, ['Desc. item', 'desc. item', 'DESC. ITEM']) || 'Sin Descripción'),
        grupo: String(getValue(p, ['GRUPO', 'Grupo', 'grupo']) || 'Sin Grupo'),
        bodega: String(getValue(p, ['Bodega', 'bodega', 'BODEGA']) || ''),
        unidad: String(getValue(p, ['U.M.', 'U.M', 'Unidad de Medida']) || 'UND'),
        cantidad: isNaN(cantidadNumerica) ? 0 : cantidadNumerica, // Usamos el valor numérico limpio
        consecutivo: consecutivo,
        sede: sede, // ✅ Agregar sede
        conteo_cantidad: 0 // El conteo físico siempre empieza en 0
      };
    }).filter(p => p.item && p.item.trim() !== ''); // Ignorar filas completamente vacías

    // Borramos el alcance anterior y guardamos el nuevo
    await supabase.from('productos').delete().eq('consecutivo', consecutivo).eq('sede', sede); // ✅ Filtrar por sede
    const { error: productosError } = await supabase.from('productos').insert(alcanceParaInsertar);
    if (productosError) throw productosError;

    res.json({ success: true, message: `Inventario #${consecutivo} creado y listo.` });

  } catch (error) {
    console.error("Error al crear inventario:", error);
    res.status(500).json({ success: false, message: `Error: ${error.message}` });
  }
};


// Obtiene los inventarios ya finalizados para la aprobación
export const obtenerInventariosFinalizados = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 12,
      search = "",
      categoria = "",
      fechaInicio = "",
      fechaFin = "",
      sortBy = "fecha_inicio",
      sortOrder = "desc",
      vista = "",
      consecutivo = "",
      sede = "" // ✅ Agregar filtro por sede
    } = req.query;

    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 12;
    const offset = (pageNum - 1) * limitNum;

    // Build the base query
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
          estado_verificacion,
          detalles_inventario (
            cantidad
          )
        )
      `, { count: 'exact' });

    // Apply filters
    if (search) {
      query = query.ilike('descripcion', `%${search}%`);
    }
    if (categoria) {
      query = query.eq('categoria', categoria);
    }
    if (consecutivo) {
      query = query.eq('consecutivo', parseInt(consecutivo, 10));
    }
    if (sede) { // ✅ Filtrar por sede
      query = query.eq('sede', sede);
    }
    if (fechaInicio) {
      query = query.gte('fecha_inicio', fechaInicio);
    }
    if (fechaFin) {
      query = query.lte('fecha_inicio', fechaFin);
    }

    // Apply sorting
    const ascending = sortOrder === 'asc';
    query = query.order(sortBy, { ascending });

    // Apply pagination
    query = query.range(offset, offset + limitNum - 1);

    const { data, error, count } = await query;

    if (error) throw error;

    // Filter by vista (approved, pending, rejected zones)
    let filteredData = data.map(inventario => {
      const zonasFiltradas = inventario.inventario_zonas.filter(zona => {
        if (vista === "finalizados_pendientes") return zona.estado_verificacion === "pendiente" && zona.estado === "finalizada";
        if (vista === "finalizados_aprobados") return zona.estado_verificacion === "aprobado" && zona.estado === "finalizada";
        if (vista === "finalizados_rechazados") return zona.estado_verificacion === "rechazado" && zona.estado === "finalizada";
        return zona.estado === "finalizada";
      });
      return { ...inventario, inventario_zonas: zonasFiltradas };
    }).filter(inv => inv.inventario_zonas.length > 0);

    // Calculate pagination info
    const totalRecords = count || 0;
    const totalPages = Math.ceil(totalRecords / limitNum);

    res.json({
      success: true,
      inventarios: filteredData,
      pagination: {
        currentPage: pageNum,
        totalPages,
        totalRecords,
        limit: limitNum
      }
    });
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
  console.log(`[Backend] Iniciando proceso para aplicar conteo de zona: ${zona_id}`);

  if (!zona_id) {
    return res.status(400).json({ success: false, message: "Falta el parámetro zona_id." });
  }

  try {
    // Llamamos a la función RPC que creamos en la base de datos
    console.log(`[Backend] Ejecutando RPC 'aplicar_conteo_aprobado' para zona_id: ${zona_id}`);
    const { error } = await supabase.rpc('aplicar_conteo_aprobado', {
      p_zona_id: zona_id
    });

    if (error) {
      // Si la función de la BD devuelve un error, lo capturamos y lo mostramos en los logs
      console.error("[Backend] Error al ejecutar RPC aplicar_conteo_aprobado:", error);
      // Lanzamos el error para que sea capturado por el bloque catch
      throw error;
    }

    console.log(`[Backend] Conteo de la zona ${zona_id} aplicado correctamente a la tabla productos.`);
    res.json({ success: true, message: "Conteo de la zona aprobado y aplicado correctamente." });

  } catch (error) {
    console.error(`[Backend] Error final en el catch para aplicarConteoDeZonaAprobada:`, error);
    res.status(500).json({ success: false, message: `Error en el servidor: ${error.message}` });
  }
};


// ... (resto de tus importaciones)
// Asegúrate de que tienes 'Buffer' disponible en tu entorno de Node.js

export const notificarOperariosAprobados = async (req, res) => {
  const { inventarioId } = req.params;

  try {
    // Paso 1: Obtener datos del inventario y productos
    const { data: inventario, error: invError } = await supabase
      .from('inventarios')
      .select('consecutivo, descripcion')
      .eq('id', inventarioId)
      .single();

    if (invError) throw invError;
    const { consecutivo, descripcion } = inventario;

    const { data: productosDelInventario, error: prodError } = await supabase
      .from('productos')
      .select('item, bodega, conteo_cantidad')
      .eq('consecutivo', consecutivo);

    if (prodError) throw prodError;

    const conteosAprobados = productosDelInventario.filter(p => parseFloat(p.conteo_cantidad) > 0);

    if (conteosAprobados.length === 0) {
      return res.status(400).json({ success: false, message: "No hay productos con conteos aprobados para generar el reporte." });
    }

    // --- 🚨 MODIFICACIÓN: LÓGICA COMPLETA DEL TXT DEL FRONTEND AHORA EN EL BACKEND ---
    const txtLines = ["000000100000001001"];
    let lineNumber = 2;

    conteosAprobados.forEach((producto) => {
      // 1. Obtener las partes del número y formatearlas
      const num = parseFloat(producto.conteo_cantidad) || 0;
      const [integerPart, decimalPart = '0000'] = num.toFixed(4).split(".");

      // 2. Construir la línea completa con formato de ancho fijo preciso
      const line =
        `${lineNumber.toString().padStart(7, '0')}` +
        `04120001001` +
        `${(consecutivo || "").toString().padStart(8, '0')}` +
        `${(producto.item || "").toString().padStart(7, '0')}` +
        `${" ".repeat(48)}` +
        `${(producto.bodega || "").toString().padEnd(5, " ")}` +
        `${" ".repeat(25)}` +
        `00000000000000000000.000000000000000.` +
        `${integerPart.padStart(10, "0")}` +
        `,${decimalPart.padEnd(4, "0")}` +
        `.000000000000000.000000000000000.000000000000000.0000`;

      txtLines.push(line);
      lineNumber++;
    });

    txtLines.push(`${lineNumber.toString().padStart(7, "0")}99990001001`);
    const txtContent = txtLines.join("\r\n");

    const txtBuffer = Buffer.from(txtContent, 'utf-8');
    // --- 🚨 FIN DE LA MODIFICACIÓN ---

    // Paso 2: Generar el buffer del archivo Excel (sin cambios)
    const formatQuantityExcel = (quantity) => {
      const num = parseFloat(quantity) || 0;
      return num.toFixed(2).replace(".", ",");
    };

    const excelRows = conteosAprobados.map(producto => ({
      NRO_INVENTARIO_BODEGA: consecutivo ?? "",
      ITEM: producto.item ?? "",
      BODEGA: producto.bodega ?? "",
      CANT_11ENT_PUNTO_4DECIMALES: formatQuantityExcel(producto.conteo_cantidad),
    }));

    const ws = XLSX.utils.json_to_sheet(excelRows, {
      header: ["NRO_INVENTARIO_BODEGA", "ITEM", "BODEGA", "CANT_11ENT_PUNTO_4DECIMALES"],
    });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Físico");
    const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' });

    // Paso 3: Obtener la lista de correos de operarios con zonas aprobadas
    const { data: zonasAprobadas, error: zonasError } = await supabase
      .from('inventario_zonas')
      .select('operario_email')
      .eq('inventario_id', inventarioId)
      .eq('estado_verificacion', 'aprobado');

    if (zonasError) throw zonasError;

    const emailsOperariosAprobados = [...new Set(zonasAprobadas.map(z => z.operario_email).filter(Boolean))];

    if (emailsOperariosAprobados.length === 0) {
      return res.status(400).json({ success: false, message: "No hay operarios con zonas aprobadas a quienes notificar." });
    }

    // Paso 4: Usar el servicio de email con la nueva plantilla HTML y los adjuntos
    for (const email of emailsOperariosAprobados) {
      const emailHtml = `
        <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 20px auto; border: 1px solid #ddd; border-radius: 8px; overflow: hidden;">
          <div style="background-color: #210d65; color: white; padding: 20px; text-align: center;">
            <h1 style="margin: 0; font-size: 24px;">Sistema de Inventarios</h1>
          </div>
          <div style="padding: 20px 30px;">
            <h2 style="color: #210d65; font-size: 20px;">¡Reporte de Inventario Aprobado!</h2>
            <p>Hola,</p>
            <p>¡Excelente trabajo! Tus conteos para el inventario <strong>${descripcion} (#${consecutivo})</strong> han sido aprobados y procesados.</p>
            <p>Adjunto a este correo encontrarás el reporte general en formato Excel y TXT con los conteos totales del inventario.</p>
            <p>Gracias por tu dedicación y esfuerzo.</p>
            <p>Saludos,<br>El equipo de Administración</p>
          </div>
          <div style="background-color: #f4f4f4; color: #666; padding: 15px 30px; text-align: center; font-size: 12px;">
            <p style="margin: 0;">Este es un correo automático, por favor no respondas a este mensaje.</p>
            <p style="margin: 5px 0 0 0;">&copy; ${new Date().getFullYear()} Tu Compañía. Todos los derechos reservados.</p>
          </div>
        </div>
      `;

      await sendEmail({
        to: email,
        subject: `Reporte de Inventario Aprobado #${consecutivo}`,
        html: emailHtml,
        attachments: [
          {
            filename: `Reporte_General_Inventario_${consecutivo}.xlsx`,
            content: excelBuffer,
            contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          },
          {
            filename: `inventario_consecutivo_${consecutivo}_siesa.txt`,
            content: txtBuffer,
            contentType: 'text/plain',
          },
        ],
      });
    }

    res.json({ success: true, message: `Notificaciones enviadas a ${emailsOperariosAprobados.length} operarios.` });

  } catch (error) {
    console.error("Error al notificar a operarios:", error);
    res.status(500).json({ success: false, message: `Error en el servidor: ${error.message}` });
  }
};

export const actualizarConteoCantidadProducto = async (req, res) => {
  const { consecutivoId, itemId } = req.params; // Capturamos consecutivoId e itemId de la URL
  const { conteo_cantidad } = req.body; // Capturamos conteo_cantidad del cuerpo de la solicitud

  // 1. Validación de los datos de entrada
  if (!consecutivoId || !itemId || typeof conteo_cantidad === 'undefined' || isNaN(parseFloat(conteo_cantidad))) {
    return res.status(400).json({
      success: false,
      message: "Datos incompletos o inválidos. Se requieren consecutivoId, itemId y conteo_cantidad numérico."
    });
  }

  const cantidadNumerica = parseFloat(conteo_cantidad);

  try {
    // 2. Actualizar el registro en la tabla 'productos'
    // Identificamos el producto usando 'consecutivo' e 'item'
    const { data, error } = await supabase
      .from('productos')
      .update({ conteo_cantidad: cantidadNumerica })
      .eq('consecutivo', consecutivoId)
      .eq('item', itemId)
      .select() // Solicitamos los datos actualizados
      .single(); // Esperamos que solo un registro sea afectado

    if (error) {
      console.error("Error al actualizar conteo_cantidad en Supabase:", error);
      // Mapear errores específicos de Supabase si es necesario, por ejemplo, si no se encontró el producto.
      if (error.code === 'PGRST116') { // Código de error si no se encuentra el recurso
        return res.status(404).json({ success: false, message: "Producto no encontrado en el consecutivo especificado." });
      }
      throw error; // Propagar otros errores.
    }

    if (!data) {
      // Esto podría ocurrir si la query fue exitosa pero no encontró un registro para actualizar
      return res.status(404).json({ success: false, message: "Producto no encontrado o no se pudo actualizar." });
    }

    // 3. Respuesta exitosa
    res.status(200).json({
      success: true,
      message: "Conteo de cantidad actualizado exitosamente.",
      updatedProduct: data
    });

  } catch (error) {
    console.error(`Error en actualizarConteoCantidadProducto:`, error);
    res.status(500).json({ success: false, message: `Error interno del servidor: ${error.message}` });
  }
};

// ✅ NUEVA FUNCIÓN: Eliminar consecutivo completo
export const eliminarConsecutivo = async (req, res) => {
  const { consecutivo } = req.params;
  console.log(`[DEBUG] Eliminando consecutivo: ${consecutivo}`);

  if (!consecutivo) {
    return res.status(400).json({ 
      success: false, 
      message: "Se requiere el número de consecutivo." 
    });
  }

  try {
    // 1. Verificar que el consecutivo existe
    console.log(`[DEBUG] Buscando productos con consecutivo: ${consecutivo}`);
    const { data: productos, error: productosError } = await supabase
      .from('productos')
      .select('consecutivo')
      .eq('consecutivo', consecutivo)
      .limit(1);

    if (productosError) {
      console.error(`[DEBUG] Error al buscar productos:`, productosError);
      throw productosError;
    }

    console.log(`[DEBUG] Productos encontrados:`, productos?.length || 0);

    if (!productos || productos.length === 0) {
      console.log(`[DEBUG] No se encontraron productos para consecutivo ${consecutivo}`);
      return res.status(404).json({ 
        success: false, 
        message: `Consecutivo ${consecutivo} no encontrado.` 
      });
    }

    // 2. Eliminar todos los productos del consecutivo
    console.log(`[DEBUG] Eliminando productos del consecutivo: ${consecutivo}`);
    const { error: deleteProductosError } = await supabase
      .from('productos')
      .delete()
      .eq('consecutivo', consecutivo);

    if (deleteProductosError) {
      console.error("Error eliminando productos:", deleteProductosError);
      throw deleteProductosError;
    }
    console.log(`[DEBUG] Productos eliminados exitosamente`);

    // 3. Eliminar ajustes de reconteo relacionados
    const { error: deleteAjustesError } = await supabase
      .from('ajustes_reconteo')
      .delete()
      .eq('consecutivo', consecutivo);

    if (deleteAjustesError) {
      console.error("Error eliminando ajustes:", deleteAjustesError);
      // No es crítico si falla, continuamos
    }

    // 4. Eliminar registro de inventario_admin si existe
    const { error: deleteAdminError } = await supabase
      .from('inventario_admin')
      .delete()
      .eq('consecutivo', consecutivo);

    if (deleteAdminError) {
      console.error("Error eliminando inventario_admin:", deleteAdminError);
      // No es crítico si falla, continuamos
    }

    // 5. Eliminar inventario principal si existe
    const { error: deleteInventarioError } = await supabase
      .from('inventarios')
      .delete()
      .eq('consecutivo', consecutivo);

    if (deleteInventarioError) {
      console.error("Error eliminando inventario:", deleteInventarioError);
      // No es crítico si falla, continuamos
    }

    console.log(`[DEBUG] Consecutivo ${consecutivo} eliminado completamente`);
    res.json({ 
      success: true, 
      message: `Consecutivo ${consecutivo} eliminado completamente.` 
    });

  } catch (error) {
    console.error("[DEBUG] Error eliminando consecutivo:", error);
    res.status(500).json({ 
      success: false, 
      message: `Error al eliminar consecutivo: ${error.message}` 
    });
  }
};

// ✅ NUEVA FUNCIÓN: Verificar consecutivo único por sede
export const verificarConsecutivoExistente = async (consecutivo, sede) => {
  try {
    // Verificar en inventarios activos por sede
    const { data: activos, error: errorActivos } = await supabase
      .from("inventarios")
      .select("id")
      .eq("consecutivo", parseInt(consecutivo))
      .eq("sede", sede)
      .eq("estado", "activo");

    if (errorActivos) throw errorActivos;

    // Verificar en inventarios finalizados, aprobados o rechazados por sede
    const { data: finalizados, error: errorFinalizados } = await supabase
      .from("inventarios")
      .select("id")
      .eq("consecutivo", parseInt(consecutivo))
      .eq("sede", sede)
      .in("estado", ["finalizado", "aprobado", "rechazado"]);

    if (errorFinalizados) throw errorFinalizados;

    return (activos.length > 0 || finalizados.length > 0);
  } catch (error) {
    console.error("Error verificando consecutivo por sede:", error);
    return false;
  }
};