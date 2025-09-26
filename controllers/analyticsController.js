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

    let q = supabase
      .from("v_ciclico_registros")
      .select("inventario_id, bodega, cantidad, fecha_inventario, categoria")
      .gte("fecha_inventario", fromDate)
      .lte("fecha_inventario", toDate);

    if (categoria)   q = q.eq("categoria", categoria);
    if (bodega)      q = q.eq("bodega", bodega);
    if (consecutivo) q = q.eq("inventario_id", consecutivo); // inventario_id ya contiene el consecutivo

    const { data, error } = await q;
    if (error) throw error;

    const totalRegistros = data.length;
    const totalCantidad  = data.reduce((s, r) => s + Number(r.cantidad || 0), 0);
    const bodegas        = new Set(data.map(d => d.bodega).filter(Boolean)).size;
    const inventarios    = new Set(data.map(d => d.inventario_id)).size;
    const promedioPorRegistro = totalRegistros > 0 ? Math.round((totalCantidad / totalRegistros) * 100) / 100 : 0;

    res.json({
      success: true,
      filters: { from: fromDate, to: toDate, categoria, bodega, consecutivo },
      kpis: { 
        inventarios, 
        totalRegistros, 
        totalCantidad, 
        operarios: 0, 
        bodegas,
        promedioPorRegistro
      }
    });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

export const cic_series_daily = async (req, res) => {
  try {
    const { from, to, categoria, bodega, consecutivo } = req.query;
    const { fromISO, toISO } = parseRange(from, to);
    const fromDate = fromISO.slice(0, 10);
    const toDate   = toISO.slice(0, 10);

    let q = supabase
      .from("v_ciclico_registros")
      .select("fecha_inventario, cantidad, bodega, categoria, inventario_id")
      .gte("fecha_inventario", fromDate)
      .lte("fecha_inventario", toDate);

    if (categoria)   q = q.eq("categoria", categoria);
    if (bodega)      q = q.eq("bodega", bodega);
    if (consecutivo) q = q.eq("inventario_id", consecutivo); // inventario_id ya contiene el consecutivo

    const { data, error } = await q;
    if (error) throw error;

    const map = new Map();
    for (const r of data) {
      const day = String(r.fecha_inventario).slice(0, 10);
      map.set(day, (map.get(day) || 0) + Number(r.cantidad || 0));
    }
    const series = Array.from(map.entries())
      .map(([date, cantidad]) => ({ date, cantidad }))
      .sort((a, b) => a.date.localeCompare(b.date));

    res.json({ success: true, series, range: { from: fromDate, to: toDate } });
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

    let q = supabase
      .from("v_ciclico_registros")
      .select("item, codigo_barras, cantidad, fecha_inventario, bodega, categoria, inventario_id")
      .gte("fecha_inventario", fromDate)
      .lte("fecha_inventario", toDate);

    if (categoria)   q = q.eq("categoria", categoria);
    if (bodega)      q = q.eq("bodega", bodega);
    if (consecutivo) q = q.eq("inventario_id", consecutivo); // inventario_id ya contiene el consecutivo

    const { data, error } = await q;
    if (error) throw error;

    const map = new Map();
    for (const r of data) {
      const key = String(r.item || r.codigo_barras || "SIN_ITEM");
      const current = map.get(key) || { cantidad: 0, registros: 0, descripcion: r.item || r.codigo_barras || "SIN_ITEM" };
      current.cantidad += Number(r.cantidad || 0);
      current.registros += 1;
      map.set(key, current);
    }
    
    const top = Array.from(map.entries())
      .map(([item_id, data]) => ({ 
        item_id, 
        descripcion: data.descripcion,
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

export const cic_by_bodega = async (req, res) => {
  try {
    const { from, to, categoria, bodega, consecutivo } = req.query;
    const { fromISO, toISO } = parseRange(from, to);
    const fromDate = fromISO.slice(0, 10);
    const toDate   = toISO.slice(0, 10);

    let q = supabase
      .from("v_ciclico_registros")
      .select("bodega, cantidad, fecha_inventario, categoria, inventario_id")
      .gte("fecha_inventario", fromDate)
      .lte("fecha_inventario", toDate);

    if (categoria)   q = q.eq("categoria", categoria);
    if (bodega)      q = q.eq("bodega", bodega);
    if (consecutivo) q = q.eq("inventario_id", consecutivo); // inventario_id ya contiene el consecutivo

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

    // Usar la vista mejorada que ya incluye información del producto
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
        codigo_barras
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
      const descripcion = r.item_descripcion || `Item ${r.item_id}`;
      
      const current = map.get(key) || { 
        cantidad: 0, 
        registros: 0, 
        descripcion,
        codigo_barras: r.codigo_barras
      };
      current.cantidad += Number(r.cantidad || 0);
      current.registros += 1;
      map.set(key, current);
    }
    
    const top = Array.from(map.entries())
      .map(([item_id, data]) => ({ 
        item_id, 
        descripcion: data.descripcion,
        codigo_barras: data.codigo_barras,
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