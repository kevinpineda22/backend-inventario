import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// --- Controladores para la Base de Datos Maestra ---

// ✅ Endpoint para cargar el Excel y poblar las tablas maestras
export const cargarMaestroDeProductos = async (req, res) => {
  try {
    const productosDelExcel = req.body;
    if (!Array.isArray(productosDelExcel) || productosDelExcel.length === 0) {
      return res.status(400).json({ success: false, message: "El archivo Excel está vacío o es inválido." });
    }

    // --- Función de ayuda para obtener valores como texto ---
    const getValue = (row, keys) => {
      for (const key of keys) {
        if (row[key] !== undefined && row[key] !== null) {
          return String(row[key]).trim();
        }
      }
      return '';
    };

    // --- 1. Preparar ITEMS únicos para la tabla `maestro_items` ---
    const itemsMap = new Map();
    productosDelExcel.forEach((p, index) => {
      const itemId = getValue(p, ['Item', 'ITEM', 'Código']);
      if (itemId !== '') {
        const itemIdStr = itemId;
        if (!itemsMap.has(itemIdStr)) {
          itemsMap.set(itemIdStr, {
            item_id: itemIdStr,
            descripcion: getValue(p, ['Desc. item', 'DESC. ITEM', 'descripcion']) || 'Sin descripción',
            grupo: getValue(p, ['GRUPO', 'Grupo', 'grupo']) || 'Sin Grupo'
          });
        }
      } else {
        console.warn(`Fila ${index + 2} omitida en maestro_items: item_id vacío o ausente en ${JSON.stringify(p)}`);
      }
    });
    const itemsParaInsertar = Array.from(itemsMap.values());
    console.log('Items para insertar/actualizar (total: %d)', itemsParaInsertar.length);

    // --- 2. Preparar TODOS los códigos de barras ---
    const codigosParaInsertar = productosDelExcel
      .map((p, index) => {
        const codigo = getValue(p, ['Código', 'Codigo', 'CÓDIGO', 'barcode']);
        const item = getValue(p, ['Item', 'ITEM', 'Código']);
        const um = getValue(p, ['U.M.', 'U.M', 'Unidad de Medida', 'UNIDAD DE MEDIDA']);

        if (codigo !== '' && item !== '' && itemsMap.has(item)) {
          return {
            codigo_barras: codigo,
            item_id: item,
            unidad_medida: um || 'UND'
          };
        }
        return null;
      })
      .filter(Boolean);
    console.log('Códigos para insertar/actualizar (total: %d)', codigosParaInsertar.length);

    // --- 3. Ejecutar los UPSERTS en Supabase ---
    let itemsUpserted = 0;
    let codigosUpserted = 0;

    if (itemsParaInsertar.length > 0) {
      const { error: itemsError } = await supabase
        .from('maestro_items')
        .upsert(itemsParaInsertar, { onConflict: 'item_id' });
      if (itemsError) throw new Error(`Error en upsert de maestro_items: ${itemsError.message}`);
      itemsUpserted = itemsParaInsertar.length;
    }

    if (codigosParaInsertar.length > 0) {
      const { error: codigosError } = await supabase
        .from('maestro_codigos')
        .upsert(codigosParaInsertar, { onConflict: 'codigo_barras' });
      if (codigosError) throw new Error(`Error en upsert de maestro_codigos: ${codigosError.message}`);
      codigosUpserted = codigosParaInsertar.length;
    }

    // --- 4. (NUEVO) Eliminar items obsoletos que ya no están en el Excel ---
    const itemIdsDelExcel = Array.from(itemsMap.keys());
    let itemsDeleted = 0;

    if (itemIdsDelExcel.length > 0) {
        console.log('Iniciando limpieza de registros obsoletos...');
        const { data, error: deleteError } = await supabase
            .from('maestro_items')
            .delete()
            .not('item_id', 'in', `(${itemIdsDelExcel.join(',')})`);

        if (deleteError) {
            throw new Error(`Error al eliminar items obsoletos: ${deleteError.message}`);
        }
        
        // Supabase v2 no devuelve el recuento de eliminados en `data`,
        // así que el recuento exacto no es trivial de obtener sin otra consulta.
        // Lo importante es que la operación se complete.
        console.log('Limpieza de registros obsoletos completada.');
        // Si necesitas el número exacto, tendrías que hacer una consulta SELECT antes de borrar.
        // Para este caso, un mensaje genérico es suficiente.
    }


    res.json({
      success: true,
      message: `Sincronización completada: ${itemsUpserted} items y ${codigosUpserted} códigos procesados. Registros obsoletos eliminados.`
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