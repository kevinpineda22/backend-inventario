// controllers/analyticsController.js
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

const parseRange = (from, to, fallbackDays = 30) => {
  const end = to ? new Date(to) : new Date();
  const start = from ? new Date(from) : new Date(end);
  if (!from) start.setDate(end.getDate() - fallbackDays);
  return { fromISO: start.toISOString(), toISO: end.toISOString() };
};

// ===== CÍCLICO CORREGIDO - USAR VISTA EXISTENTE =====
export const cic_overview = async (req, res) => {
  try {
    const { from, to, categoria, bodega, consecutivo } = req.query;
    const { fromISO, toISO } = parseRange(from, to);
    const fromDate = fromISO.slice(0, 10);
    const toDate   = toISO.slice(0, 10);

    // Usar la vista existente que ya funciona
    let q = supabase
      .from("v_ciclico_registros")
      .select("inventario_id, bodega, cantidad, fecha_inventario, categoria, item, codigo_barras, unidad, inventario_nombre, inventario_descripcion")
      .gte("fecha_inventario", fromDate)
      .lte("fecha_inventario", toDate)
      .gt("cantidad", 0); // Solo registros con cantidad > 0

    if (categoria) q = q.eq("categoria", categoria);
    if (bodega) q = q.eq("bodega", bodega);
    if (consecutivo) q = q.eq("inventario_id", consecutivo);

    const { data, error } = await q;
    if (error) {
      console.error("Error en cic_overview:", error);
      throw error;
    }

    const totalRegistros = data.length;
    const totalCantidad = data.reduce((s, r) => s + Number(r.cantidad || 0), 0);
    const bodegas = new Set(data.map(d => d.bodega).filter(Boolean)).size;
    const inventarios = new Set(data.map(d => d.inventario_id)).size;
    const itemsUnicos = new Set(data.map(d => d.item).filter(Boolean)).size;
    const promedioPorRegistro = totalRegistros > 0 ? Math.round((totalCantidad / totalRegistros) * 100) / 100 : 0;

    res.json({
      success: true,
      filters: { from: fromDate, to: toDate, categoria, bodega, consecutivo },
      kpis: { 
        inventarios, 
        totalRegistros, 
        totalCantidad, 
        operarios: 0, // No aplica para cíclico
        bodegas,
        promedioPorRegistro,
        itemsUnicos
      }
    });
  } catch (e) {
    console.error("Error en cic_overview:", e);
    res.status(500).json({ success: false, message: e.message });
  }
};

export const cic_series_daily = async (req, res) => {
  try {
    const { from, to, categoria, bodega, consecutivo } = req.query;
    const { fromISO, toISO } = parseRange(from, to);
    const fromDate = fromISO.slice(0, 10);
    const toDate   = toISO.slice(0, 10);

    // Usar la vista existente
    let q = supabase
      .from("v_ciclico_registros")
      .select("fecha_inventario, cantidad, bodega, categoria, inventario_id, inventario_nombre")
      .gte("fecha_inventario", fromDate)
      .lte("fecha_inventario", toDate)
      .gt("cantidad", 0);

    if (categoria) q = q.eq("categoria", categoria);
    if (bodega) q = q.eq("bodega", bodega);
    if (consecutivo) q = q.eq("inventario_id", consecutivo);

    const { data, error } = await q;
    if (error) throw error;

    // Agrupar por fecha
    const seriesMap = new Map();
    
    for (const r of data) {
      const day = String(r.fecha_inventario).slice(0, 10);
      seriesMap.set(day, (seriesMap.get(day) || 0) + Number(r.cantidad || 0));
    }

    const series = Array.from(seriesMap.entries())
      .map(([date, cantidad]) => ({ date, cantidad }))
      .sort((a, b) => a.date.localeCompare(b.date));

    res.json({ 
      success: true, 
      series,
      range: { from: fromDate, to: toDate } 
    });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

export const cic_top_items = async (req, res) => {
  try {
    const { from, to, categoria, bodega, consecutivo, limit = 10 } = req.query;
    const { fromISO, toISO } = parseRange(from, to);
    const fromDate = fromISO.slice(0, 10);
    const toDate   = toISO.slice(0, 10);

    // Consulta principal de la vista cíclico
    let q = supabase
      .from("v_ciclico_registros")
      .select(`
        item,
        codigo_barras, 
        cantidad, 
        fecha_inventario, 
        bodega, 
        categoria, 
        inventario_id, 
        unidad, 
        inventario_nombre
      `)
      .gte("fecha_inventario", fromDate)
      .lte("fecha_inventario", toDate)
      .gt("cantidad", 0);

    if (categoria) q = q.eq("categoria", categoria);
    if (bodega) q = q.eq("bodega", bodega);
    if (consecutivo) q = q.eq("inventario_id", consecutivo);

    const { data, error } = await q;
    if (error) throw error;

    // Obtener item_ids únicos para buscar descripciones en maestro_items
    const itemIds = [...new Set(data.map(r => r.item).filter(Boolean))];
    
    // 🆕 NUEVA LÓGICA SIMPLIFICADA: Un solo query que obtiene todo
    let descripcionesYCodigos = {};
    
    if (itemIds.length > 0) {
      // Consulta única que obtiene: item_id, descripcion Y código de barras en una sola consulta
      const { data: maestroCompleto, error: maestroError } = await supabase
        .from("maestro_items")
        .select(`
          item_id, 
          descripcion, 
          grupo,
          maestro_codigos (
            codigo_barras,
            unidad_medida
          )
        `)
        .in("item_id", itemIds)
        .eq("is_active", true);
        
      if (!maestroError && maestroCompleto) {
        descripcionesYCodigos = maestroCompleto.reduce((acc, item) => {
          acc[item.item_id] = {
            descripcion: item.descripcion,
            grupo: item.grupo,
            // Tomar el primer código de barras disponible para este item_id
            codigo_barras: item.maestro_codigos && item.maestro_codigos.length > 0 
              ? item.maestro_codigos[0].codigo_barras 
              : null,
            unidad_medida: item.maestro_codigos && item.maestro_codigos.length > 0 
              ? item.maestro_codigos[0].unidad_medida 
              : null,
            todos_codigos: item.maestro_codigos || []
          };
          return acc;
        }, {});
      }
    }

    const itemsMap = new Map();
    
    for (const r of data) {
      const key = r.item || "SIN_IDENTIFICADOR";
      
      // 🆕 LÓGICA SIMPLIFICADA: Usar los datos obtenidos directamente
      let descripcion = key; // Fallback
      let grupo = r.categoria || "Sin categoría";
      let unidad = r.unidad || "UND";
      let codigoBarras = r.codigo_barras || r.item || "Sin código"; // Fallback inicial
      
      // Si tenemos datos del maestro para este item
      if (r.item && descripcionesYCodigos[r.item]) {
        const maestroData = descripcionesYCodigos[r.item];
        descripcion = maestroData.descripcion || key;
        grupo = maestroData.grupo || grupo;
        
        // 🆕 USAR EL CÓDIGO DE BARRAS DEL MAESTRO SI EXISTE
        if (maestroData.codigo_barras) {
          codigoBarras = maestroData.codigo_barras;
        }
        
        if (maestroData.unidad_medida) {
          unidad = maestroData.unidad_medida;
        }
      }
      
      if (!itemsMap.has(key)) {
        itemsMap.set(key, {
          cantidad: 0,
          registros: 0,
          inventarios: new Set(),
          bodegas: new Set(),
          descripcion: descripcion,
          codigo_barras: codigoBarras,
          categoria: grupo,
          unidad: unidad,
          ultima_fecha: r.fecha_inventario,
          // 🆕 INFORMACIÓN ADICIONAL: Todos los códigos de barras para este item
          codigos_disponibles: r.item && descripcionesYCodigos[r.item] ? 
            descripcionesYCodigos[r.item].todos_codigos : []
        });
      }
      
      const item = itemsMap.get(key);
      item.cantidad += Number(r.cantidad || 0);
      item.registros += 1;
      item.inventarios.add(r.inventario_id);
      item.bodegas.add(r.bodega);
      
      // Mantener la fecha más reciente
      if (r.fecha_inventario > item.ultima_fecha) {
        item.ultima_fecha = r.fecha_inventario;
      }
    }
    
    const top = Array.from(itemsMap.entries())
      .map(([item_id, data]) => ({ 
        item_id, 
        descripcion: data.descripcion,
        codigo_barras: data.codigo_barras,
        categoria: data.categoria,
        unidad: data.unidad,
        cantidad: data.cantidad,
        registros: data.registros,
        inventarios: data.inventarios.size,
        bodegas: data.bodegas.size,
        promedio: Math.round((data.cantidad / data.registros) * 100) / 100,
        ultima_fecha: data.ultima_fecha,
        // 🆕 INCLUIR INFORMACIÓN ADICIONAL
        codigos_disponibles: data.codigos_disponibles
      }))
      .sort((a,b) => b.cantidad - a.cantidad)
      .slice(0, Number(limit));

    res.json({ success: true, top });
  } catch (e) {
    console.error("Error en cic_top_items:", e);
    res.status(500).json({ success: false, message: e.message });
  }
};

export const cic_by_bodega = async (req, res) => {
  try {
    const { from, to, categoria, bodega, consecutivo } = req.query;
    const { fromISO, toISO } = parseRange(from, to);
    const fromDate = fromISO.slice(0, 10);
    const toDate   = toISO.slice(0, 10);

    // Usar la vista existente
    let q = supabase
      .from("v_ciclico_registros")
      .select("bodega, cantidad, fecha_inventario, categoria, inventario_id, item")
      .gte("fecha_inventario", fromDate)
      .lte("fecha_inventario", toDate)
      .gt("cantidad", 0);

    if (categoria) q = q.eq("categoria", categoria);
    if (bodega) q = q.eq("bodega", bodega);
    if (consecutivo) q = q.eq("inventario_id", consecutivo);

    const { data, error } = await q;
    if (error) throw error;

    const bodegasMap = new Map();
    
    for (const r of data) {
      const key = r.bodega || "Sin Bodega";
      
      if (!bodegasMap.has(key)) {
        bodegasMap.set(key, {
          cantidad: 0,
          registros: 0,
          items_unicos: new Set(),
          inventarios: new Set()
        });
      }
      
      const bodegaData = bodegasMap.get(key);
      bodegaData.cantidad += Number(r.cantidad || 0);
      bodegaData.registros += 1;
      bodegaData.items_unicos.add(r.item);
      bodegaData.inventarios.add(r.inventario_id);
    }
    
    const dist = Array.from(bodegasMap.entries())
      .map(([bodega, data]) => ({
        bodega,
        cantidad: data.cantidad,
        registros: data.registros,
        items_unicos: data.items_unicos.size,
        inventarios: data.inventarios.size,
        promedio: Math.round((data.cantidad / data.registros) * 100) / 100
      }))
      .sort((a,b) => b.cantidad - a.cantidad);

    res.json({ success: true, by_bodega: dist });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

// Nueva función: usar consulta manual separada para evitar JOINs automáticos
export const cic_inventarios_resumen = async (req, res) => {
  try {
    const { from, to, categoria, bodega } = req.query;
    const { fromISO, toISO } = parseRange(from, to);
    const fromDate = fromISO.slice(0, 10);
    const toDate   = toISO.slice(0, 10);

    // PASO 1: Obtener inventarios en el rango de fechas
    const { data: inventariosAdmin, error: invError } = await supabase
      .from("inventario_admin")
      .select("consecutivo, nombre, descripcion, fecha")
      .gte("fecha", fromDate)
      .lte("fecha", toDate);

    if (invError) throw invError;

    if (!inventariosAdmin || inventariosAdmin.length === 0) {
      return res.json({ success: true, inventarios: [] });
    }

    const consecutivos = inventariosAdmin.map(inv => inv.consecutivo);

    // PASO 2: Obtener productos de esos consecutivos
    let productosQuery = supabase
      .from("productos")
      .select("consecutivo, grupo, bodega, item, conteo_cantidad")
      .in("consecutivo", consecutivos)
      .gt("conteo_cantidad", 0);

    if (categoria) productosQuery = productosQuery.eq("grupo", categoria);
    if (bodega) productosQuery = productosQuery.eq("bodega", bodega);

    const { data: productos, error: prodError } = await productosQuery;
    if (prodError) throw prodError;

    // PASO 3: Combinar datos
    const inventariosMap = new Map();
    
    // Inicializar con datos de inventario_admin
    inventariosAdmin.forEach(inv => {
      inventariosMap.set(inv.consecutivo, {
        consecutivo: inv.consecutivo,
        nombre: inv.nombre,
        descripcion: inv.descripcion,
        fecha: inv.fecha,
        cantidad_total: 0,
        items_contados: 0,
        bodegas: new Set(),
        categorias: new Set()
      });
    });

    // Agregar datos de productos
    productos.forEach(p => {
      const inv = inventariosMap.get(p.consecutivo);
      if (inv) {
        inv.cantidad_total += Number(p.conteo_cantidad || 0);
        inv.items_contados += 1;
        inv.bodegas.add(p.bodega);
        inv.categorias.add(p.grupo);
      }
    });

    const resumen = Array.from(inventariosMap.values())
      .map(inv => ({
        ...inv,
        bodegas: inv.bodegas.size,
        categorias: inv.categorias.size,
        promedio_por_item: inv.items_contados > 0 ? 
          Math.round((inv.cantidad_total / inv.items_contados) * 100) / 100 : 0
      }))
      .sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

    res.json({ success: true, inventarios: resumen });
  } catch (e) {
    console.error("Error en cic_inventarios_resumen:", e);
    res.status(500).json({ success: false, message: e.message });
  }
};



// -------- Carnes & Fruver --------
const applyCommonFilters = (query, { categoria, bodega, consecutivo }) => {
  if (categoria)   query = query.eq("categoria", categoria);
  if (bodega)      query = query.eq("bodega", bodega);
  if (consecutivo) query = query.eq("consecutivo", consecutivo);
  return query;
};

export const cf_overview = async (req, res) => {
  try {
    const { from, to, categoria, bodega, operario, consecutivo, zona_id } = req.query;
    const { fromISO, toISO } = parseRange(from, to, 30);

    let q = supabase
      .from("v_cyf_registros")
      .select("inventario_id, bodega, operario_email, cantidad, fecha_registro", { count: "exact" })
      .gte("fecha_registro", fromISO)
      .lte("fecha_registro", toISO);

    q = applyCommonFilters(q, { categoria, bodega, consecutivo });
    if (operario) q = q.eq("operario_email", operario);
    if (zona_id)  q = q.eq("id_zona", zona_id);

    const { data, error } = await q;
    if (error) throw error;

    const totalRegistros = data.length;
    const totalCantidad  = data.reduce((s, r) => s + Number(r.cantidad || 0), 0);
    const operarios      = new Set(data.map(d => d.operario_email).filter(Boolean)).size;
    const bodegas        = new Set(data.map(d => d.bodega).filter(Boolean)).size;
    const inventarios    = new Set(data.map(d => d.inventario_id)).size;
    const promedioPorRegistro = totalRegistros > 0 ? Math.round((totalCantidad / totalRegistros) * 100) / 100 : 0;

    res.json({ 
      success: true, 
      kpis: { 
        inventarios, 
        totalRegistros, 
        totalCantidad, 
        operarios, 
        bodegas,
        promedioPorRegistro
      } 
    });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

export const cf_series_daily = async (req, res) => {
  try {
    const { from, to, categoria, bodega, operario, consecutivo, zona_id } = req.query;
    const { fromISO, toISO } = parseRange(from, to, 30);

    let q = supabase
      .from("v_cyf_registros")
      .select("fecha_registro, cantidad, bodega, operario_email, id_zona")
      .gte("fecha_registro", fromISO)
      .lte("fecha_registro", toISO);

    q = applyCommonFilters(q, { categoria, bodega, consecutivo });
    if (operario) q = q.eq("operario_email", operario);
    if (zona_id)  q = q.eq("id_zona", zona_id);

    const { data, error } = await q;
    if (error) throw error;

    const map = new Map();
    for (const r of data) {
      const day = String(r.fecha_registro).slice(0, 10);
      map.set(day, (map.get(day) || 0) + Number(r.cantidad || 0));
    }
    const series = Array.from(map.entries())
      .map(([date, cantidad]) => ({ date, cantidad }))
      .sort((a, b) => a.date.localeCompare(b.date));

    res.json({ success: true, series });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

export const cf_top_items = async (req, res) => {
  try {
    const { from, to, categoria, bodega, operario, consecutivo, zona_id, limit = 10 } = req.query;
    const { fromISO, toISO } = parseRange(from, to, 30);

    let q = supabase
      .from("v_cyf_registros")
      .select(`
        item_id, 
        cantidad, 
        fecha_registro, 
        bodega, 
        operario_email, 
        id_zona,
        categoria,
        inventario_id,
        item_descripcion,
        item_grupo,
        codigo_barras,
        unidad_medida
      `)
      .gte("fecha_registro", fromISO)
      .lte("fecha_registro", toISO);

    q = applyCommonFilters(q, { categoria, bodega, consecutivo });
    if (operario) q = q.eq("operario_email", operario);
    if (zona_id)  q = q.eq("id_zona", zona_id);

    const { data, error } = await q;
    if (error) throw error;

    const map = new Map();
    
    for (const r of data) {
      const key = String(r.item_id);
      // Usar la descripción de maestro_items o el item_id como fallback
      const descripcion = r.item_descripcion || r.item_id || "SIN_ITEM";
      
      const current = map.get(key) || { 
        cantidad: 0, 
        registros: 0, 
        descripcion,
        grupo: r.item_grupo,
        codigo_barras: r.codigo_barras,
        unidad_medida: r.unidad_medida
      };
      current.cantidad += Number(r.cantidad || 0);
      current.registros += 1;
      map.set(key, current);
    }
    
    const top = Array.from(map.entries())
      .map(([item_id, data]) => ({ 
        item_id, 
        descripcion: data.descripcion,
        grupo: data.grupo,
        codigo_barras: data.codigo_barras,
        unidad_medida: data.unidad_medida,
        cantidad: data.cantidad,
        registros: data.registros,
        promedio: Math.round((data.cantidad / data.registros) * 100) / 100
      }))
      .sort((a,b) => b.cantidad - a.cantidad)
      .slice(0, Number(limit));

    res.json({ success: true, top });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

export const cf_by_bodega = async (req, res) => {
  try {
    const { from, to, categoria, bodega, operario, consecutivo, zona_id } = req.query;
    const { fromISO, toISO } = parseRange(from, to, 30);

    let q = supabase
      .from("v_cyf_registros")
      .select("bodega, cantidad, fecha_registro, operario_email, id_zona")
      .gte("fecha_registro", fromISO)
      .lte("fecha_registro", toISO);

    q = applyCommonFilters(q, { categoria, bodega, consecutivo });
    if (operario) q = q.eq("operario_email", operario);
    if (zona_id)  q = q.eq("id_zona", zona_id);

    const { data, error } = await q;
    if (error) throw error;

    const map = new Map();
    for (const r of data) {
      const key = r.bodega || "N/A";
      map.set(key, (map.get(key) || 0) + Number(r.cantidad || 0));
    }
    const dist = Array.from(map.entries())
      .map(([bodega, cantidad]) => ({ bodega, cantidad }))
      .sort((a,b) => b.cantidad - a.cantidad);

    res.json({ success: true, by_bodega: dist });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

export const cf_by_operario = async (req, res) => {
  try {
    const { from, to, categoria, bodega, operario, consecutivo, zona_id } = req.query;
    const { fromISO, toISO } = parseRange(from, to, 30);

    let q = supabase
      .from("v_cyf_registros")
      .select("operario_email, cantidad, fecha_registro, bodega, id_zona")
      .gte("fecha_registro", fromISO)
      .lte("fecha_registro", toISO);

    q = applyCommonFilters(q, { categoria, bodega, consecutivo });
    if (operario) q = q.eq("operario_email", operario);
    if (zona_id)  q = q.eq("id_zona", zona_id);

    const { data, error } = await q;
    if (error) throw error;

    const map = new Map();
    for (const r of data) {
      const key = r.operario_email || "Sin Operario";
      const current = map.get(key) || { cantidad: 0, registros: 0 };
      current.cantidad += Number(r.cantidad || 0);
      current.registros += 1;
      map.set(key, current);
    }
    
    const dist = Array.from(map.entries())
      .map(([operario, data]) => ({ 
        operario, 
        cantidad: data.cantidad,
        registros: data.registros,
        promedio: Math.round((data.cantidad / data.registros) * 100) / 100
      }))
      .sort((a,b) => b.cantidad - a.cantidad);

    res.json({ success: true, by_operario: dist });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};