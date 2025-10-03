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


// ===== CÍCLICO =====
export const cic_overview = async (req, res) => {
  try {
    const { from, to, categoria, bodega, consecutivo } = req.query;
    const { fromISO, toISO } = parseRange(from, to);
    const fromDate = fromISO.slice(0, 10);
    const toDate   = toISO.slice(0, 10);

    // Consulta directa usando JOIN entre productos e inventario_admin
    let baseQuery = supabase
      .from("productos")
      .select(`
        consecutivo,
        item,
        codigo_barras,
        descripcion,
        grupo,
        bodega,
        unidad,
        cantidad,
        conteo_cantidad,
        inventario_admin!inner (
          fecha,
          nombre,
          descripcion
        )
      `)
      .gte("inventario_admin.fecha", fromDate)
      .lte("inventario_admin.fecha", toDate)
      .gt("conteo_cantidad", 0); // Solo productos con conteo > 0

    if (categoria) baseQuery = baseQuery.eq("grupo", categoria);
    if (bodega) baseQuery = baseQuery.eq("bodega", bodega);  
    if (consecutivo) baseQuery = baseQuery.eq("consecutivo", consecutivo);

    const { data, error } = await baseQuery;
    if (error) {
      console.error("Error en cic_overview:", error);
      throw error;
    }

    const totalRegistros = data.length;
    const totalCantidad = data.reduce((s, r) => s + Number(r.conteo_cantidad || 0), 0);
    const bodegas = new Set(data.map(d => d.bodega).filter(Boolean)).size;
    const inventarios = new Set(data.map(d => d.consecutivo)).size;
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

    let baseQuery = supabase
      .from("productos")
      .select(`
        consecutivo,
        conteo_cantidad,
        bodega,
        grupo,
        inventario_admin!inner (
          fecha,
          nombre
        )
      `)
      .gte("inventario_admin.fecha", fromDate)
      .lte("inventario_admin.fecha", toDate)
      .gt("conteo_cantidad", 0);

    if (categoria) baseQuery = baseQuery.eq("grupo", categoria);
    if (bodega) baseQuery = baseQuery.eq("bodega", bodega);
    if (consecutivo) baseQuery = baseQuery.eq("consecutivo", consecutivo);

    const { data, error } = await baseQuery;
    if (error) throw error;

    // Agrupar por fecha
    const seriesMap = new Map();
    
    for (const r of data) {
      const day = String(r.inventario_admin?.fecha).slice(0, 10);
      seriesMap.set(day, (seriesMap.get(day) || 0) + Number(r.conteo_cantidad || 0));
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

    let baseQuery = supabase
      .from("productos")
      .select(`
        item,
        codigo_barras,
        descripcion,
        grupo,
        bodega,
        unidad,
        conteo_cantidad,
        consecutivo,
        inventario_admin!inner (
          fecha,
          nombre
        )
      `)
      .gte("inventario_admin.fecha", fromDate)
      .lte("inventario_admin.fecha", toDate)
      .gt("conteo_cantidad", 0);

    if (categoria) baseQuery = baseQuery.eq("grupo", categoria);
    if (bodega) baseQuery = baseQuery.eq("bodega", bodega);
    if (consecutivo) baseQuery = baseQuery.eq("consecutivo", consecutivo);

    const { data, error } = await baseQuery;
    if (error) throw error;

    const itemsMap = new Map();
    
    for (const r of data) {
      // Usar item como clave principal, código de barras como fallback
      const key = r.item || r.codigo_barras || "SIN_IDENTIFICADOR";
      
      if (!itemsMap.has(key)) {
        itemsMap.set(key, {
          cantidad: 0,
          registros: 0,
          inventarios: new Set(),
          bodegas: new Set(),
          descripcion: r.descripcion || key,
          codigo_barras: r.codigo_barras || "Sin código",
          categoria: r.grupo || "Sin categoría", 
          unidad: r.unidad || "UND",
          ultima_fecha: r.inventario_admin?.fecha
        });
      }
      
      const item = itemsMap.get(key);
      item.cantidad += Number(r.conteo_cantidad || 0);
      item.registros += 1;
      item.inventarios.add(r.consecutivo);
      item.bodegas.add(r.bodega);
      
      // Mantener la fecha más reciente
      if (r.inventario_admin?.fecha > item.ultima_fecha) {
        item.ultima_fecha = r.inventario_admin.fecha;
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
        ultima_fecha: data.ultima_fecha
      }))
      .sort((a,b) => b.cantidad - a.cantidad)
      .slice(0, Number(limit));

    res.json({ success: true, top });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

export const cic_by_bodega = async (req, res) => {
  try {
    const { from, to, categoria, bodega, consecutivo } = req.query;
    const { fromISO, toISO } = parseRange(from, to);
    const fromDate = fromISO.slice(0, 10);
    const toDate   = toISO.slice(0, 10);

    let baseQuery = supabase
      .from("productos")
      .select(`
        bodega,
        conteo_cantidad,
        grupo,
        consecutivo,
        item,
        inventario_admin!inner (
          fecha
        )
      `)
      .gte("inventario_admin.fecha", fromDate)
      .lte("inventario_admin.fecha", toDate)
      .gt("conteo_cantidad", 0);

    if (categoria) baseQuery = baseQuery.eq("grupo", categoria);
    if (bodega) baseQuery = baseQuery.eq("bodega", bodega);
    if (consecutivo) baseQuery = baseQuery.eq("consecutivo", consecutivo);

    const { data, error } = await baseQuery;
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
      bodegaData.cantidad += Number(r.conteo_cantidad || 0);
      bodegaData.registros += 1;
      bodegaData.items_unicos.add(r.item);
      bodegaData.inventarios.add(r.consecutivo);
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

// Nueva función específica para análisis de inventarios cíclicos
export const cic_inventarios_resumen = async (req, res) => {
  try {
    const { from, to, categoria, bodega } = req.query;
    const { fromISO, toISO } = parseRange(from, to);
    const fromDate = fromISO.slice(0, 10);
    const toDate   = toISO.slice(0, 10);

    let baseQuery = supabase
      .from("productos")
      .select(`
        consecutivo,
        grupo,
        bodega,
        item,
        conteo_cantidad,
        inventario_admin!inner (
          nombre,
          descripcion,
          fecha
        )
      `)
      .gte("inventario_admin.fecha", fromDate)
      .lte("inventario_admin.fecha", toDate)
      .gt("conteo_cantidad", 0);

    if (categoria) baseQuery = baseQuery.eq("grupo", categoria);
    if (bodega) baseQuery = baseQuery.eq("bodega", bodega);

    const { data, error } = await baseQuery;
    if (error) throw error;

    const inventariosMap = new Map();
    
    data.forEach(r => {
      const key = r.consecutivo;
      if (!inventariosMap.has(key)) {
        inventariosMap.set(key, {
          consecutivo: r.consecutivo,
          nombre: r.inventario_admin?.nombre,
          descripcion: r.inventario_admin?.descripcion,
          fecha: r.inventario_admin?.fecha,
          cantidad_total: 0,
          items_contados: 0,
          bodegas: new Set(),
          categorias: new Set()
        });
      }
      
      const inv = inventariosMap.get(key);
      inv.cantidad_total += Number(r.conteo_cantidad || 0);
      inv.items_contados += 1;
      inv.bodegas.add(r.bodega);
      inv.categorias.add(r.grupo);
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