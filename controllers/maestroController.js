import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// --- Controladores para la Base de Datos Maestra ---
// ✅ Endpoint para SINCRONIZAR el Excel con las tablas maestras (VERSIÓN CORREGIDA)
export const cargarMaestroDeProductos = async (req, res) => {
  try {
    const productosDelExcel = req.body;
    if (!Array.isArray(productosDelExcel) || productosDelExcel.length === 0) {
      return res.status(400).json({ success: false, message: "El archivo Excel está vacío o es inválido." });
    }

    // --- OBTENCIÓN DE DATOS EXISTENTES ---
    const { data: itemsActuales, error: fetchItemsError } = await supabase.from('maestro_items').select('item_id');
    if (fetchItemsError) throw fetchItemsError;
    const itemIdsEnDB = new Set(itemsActuales.map(i => i.item_id));

    const { data: codigosActuales, error: fetchCodigosError } = await supabase.from('maestro_codigos').select('codigo_barras');
    if (fetchCodigosError) throw fetchCodigosError;
    const codigosEnDB = new Set(codigosActuales.map(c => c.codigo_barras));

    // --- PROCESAMIENTO DEL EXCEL ---
    const getValue = (row, keys) => {
      for (const key of keys) {
        if (row[key] !== undefined && row[key] !== null) return String(row[key]).trim();
      }
      return '';
    };

    const itemsMap = new Map();
    const itemIdsEnExcel = new Set();
    const codigosEnExcel = new Set();

    productosDelExcel.forEach(p => {
      const itemId = getValue(p, ['Item', 'ITEM', 'Código']);
      if (itemId) {
        itemIdsEnExcel.add(itemId);
        if (!itemsMap.has(itemId)) {
          itemsMap.set(itemId, {
            item_id: itemId,
            descripcion: getValue(p, ['Desc. item', 'DESC. ITEM', 'descripcion']) || 'Sin descripción',
            grupo: getValue(p, ['GRUPO', 'Grupo', 'grupo']) || 'Sin Grupo',
            is_active: true
          });
        }
      }
      const codigo = getValue(p, ['Código', 'Codigo', 'CÓDIGO', 'barcode']);
      if (codigo) {
        codigosEnExcel.add(codigo);
      }
    });

    const itemsParaUpsert = Array.from(itemsMap.values());
    const codigosParaUpsert = productosDelExcel.map(p => {
        const codigo = getValue(p, ['Código', 'Codigo', 'CÓDIGO', 'barcode']);
        const item = getValue(p, ['Item', 'ITEM']);
        if (codigo && item) return { codigo_barras: codigo, item_id: item, unidad_medida: getValue(p, ['U.M.']) || 'UND', is_active: true };
        return null;
    }).filter(Boolean);

    // --- DETERMINAR QUÉ DESACTIVAR ---
    const itemsParaDesactivar = [...itemIdsEnDB].filter(id => !itemIdsEnExcel.has(id));
    const codigosParaDesactivar = [...codigosEnDB].filter(codigo => !codigosEnExcel.has(codigo));

    // --- EJECUTAR OPERACIONES EN LA DB ---

    // Upserts (ya son eficientes)
    if (itemsParaUpsert.length > 0) {
      const { error } = await supabase.from('maestro_items').upsert(itemsParaUpsert, { onConflict: 'item_id' });
      if (error) throw new Error(`Error en upsert de items: ${error.message}`);
    }
    if (codigosParaUpsert.length > 0) {
      const { error } = await supabase.from('maestro_codigos').upsert(codigosParaUpsert, { onConflict: 'codigo_barras' });
      if (error) throw new Error(`Error en upsert de códigos: ${error.message}`);
    }

    // --- CORRECCIÓN: Desactivación por lotes ---
    const BATCH_SIZE = 200; // Un tamaño seguro para los filtros .in()

    // Desactivar items obsoletos por lotes
    for (let i = 0; i < itemsParaDesactivar.length; i += BATCH_SIZE) {
      const batch = itemsParaDesactivar.slice(i, i + BATCH_SIZE);
      if (batch.length > 0) {
        const { error } = await supabase.from('maestro_items').update({ is_active: false }).in('item_id', batch);
        if (error) throw new Error(`Error desactivando lote de items: ${error.message}`);
      }
    }

    // Desactivar códigos obsoletos por lotes
    for (let i = 0; i < codigosParaDesactivar.length; i += BATCH_SIZE) {
        const batch = codigosParaDesactivar.slice(i, i + BATCH_SIZE);
        if (batch.length > 0) {
            const { error } = await supabase.from('maestro_codigos').update({ is_active: false }).in('codigo_barras', batch);
            if (error) throw new Error(`Error desactivando lote de códigos: ${error.message}`);
        }
    }
    // --- FIN DE LA CORRECCIÓN ---

    res.json({
      success: true,
      message: 'Sincronización completada con éxito.',
      resumen: { /* ... */ }
    });

  } catch (error) {
    console.error("Error en cargarMaestroDeProductos:", error);
    res.status(500).json({ success: false, message: `Error en el servidor: ${error.message}` });
  }
};

// ✅ Para buscar un producto por su código de barras en tiempo real
// Busca un producto con lógica de 3 pasos: exacta en códigos, exacta en items y por similitud.
export const buscarProductoMaestro = async (req, res) => {
  const { codigo_barras: codigoEscaneado } = req.params;
  const umbralSimilitud = 0.6;

  if (!codigoEscaneado) {
    return res.status(400).json({ success: false, message: 'Se requiere un código.' });
  }

  try {
    let itemId = null;
    let productoPrincipal = null;

    // --- PASO 1: Identificar el Item ID ---
    
    // Intento A: Buscar el código de barras en maestro_codigos
    const { data: codigoInfo } = await supabase
      .from('maestro_codigos')
      .select('item_id')
      .eq('codigo_barras', codigoEscaneado)
      .single();

    if (codigoInfo) {
      itemId = codigoInfo.item_id;
    } else {
      // Intento B: Si no se encontró, verificar si el código escaneado es un item_id válido
      const { data: itemInfo } = await supabase
        .from('maestro_items')
        .select('item_id')
        .eq('item_id', codigoEscaneado)
        .single();
      
      if (itemInfo) {
        itemId = itemInfo.item_id;
      }
    }

    // --- PASO 2: Si encontramos un Item ID, obtenemos todos sus detalles ---
    if (itemId) {
      // Obtenemos la información principal del producto
      const { data: itemDetails, error: itemError } = await supabase
        .from('maestro_items')
        .select('descripcion, grupo')
        .eq('item_id', itemId)
        .single();

      if (itemError) throw itemError;

      // Obtenemos TODAS las unidades de medida y sus códigos de barras asociados
      const { data: unidades, error: unidadesError } = await supabase
        .from('maestro_codigos')
        .select('unidad_medida, codigo_barras')
        .eq('item_id', itemId);

      if (unidadesError) throw unidadesError;

      // Construimos la respuesta final
      productoPrincipal = {
        item: itemId,
        descripcion: itemDetails.descripcion,
        grupo: itemDetails.grupo,
      };
      
      console.log(`Búsqueda Exitosa (match exacto): ${codigoEscaneado}`);
      return res.json({
        success: true,
        matchType: 'exact',
        producto: productoPrincipal,
        unidades: unidades || [] // Devolvemos la lista de unidades
      });
    }

    // --- PASO 3: Si no hubo coincidencia exacta, buscar por similitud ---
    console.log(`No hubo coincidencia exacta para "${codigoEscaneado}". Buscando por similitud...`);
    
    const { data: sugerencias, error: errSimilitud } = await supabase.rpc('buscar_codigos_similares', {
        termino_busqueda: codigoEscaneado,
        umbral: umbralSimilitud
    });

    if (errSimilitud) throw errSimilitud;

    if (sugerencias && sugerencias.length > 0) {
      console.log(`Búsqueda Exitosa (match por similitud): Se encontraron ${sugerencias.length} sugerencias.`);
      return res.json({ success: true, matchType: 'similar', sugerencias: sugerencias });
    }

    // --- FIN: Si después de todos los intentos no hay nada ---
    console.log(`Búsqueda Fallida: No se encontró ninguna coincidencia para "${codigoEscaneado}".`);
    return res.status(404).json({ success: false, message: 'Código no reconocido en la base de datos.' });

  } catch (error) {
    console.error("Error en buscarProductoMaestro:", error);
    res.status(500).json({ success: false, message: `Error en el servidor: ${error.message}` });
  }
};

// Para el autocompletado del scanner de Carnes/Fruver
export const obtenerMaestroItems = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('maestro_items')
      .select('item_id, descripcion, grupo') // <-- CORREGIDO: Añadimos 'grupo'
      .order('descripcion', { ascending: true });
    if (error) throw error;
    res.json({ success: true, items: data });
  } catch (error) {
    console.error("Error en obtenerMaestroItems:", error);
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