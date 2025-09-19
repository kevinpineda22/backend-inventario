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
    const { from, to, categoria, bodega, inventario_id } = req.query;
    const { fromISO, toISO } = parseRange(from, to);
    const fromDate = fromISO.slice(0, 10);
    const toDate   = toISO.slice(0, 10);

    let q = supabase
      .from("v_ciclico_registros")
      .select("inventario_id, bodega, cantidad, fecha_inventario, categoria")
      .gte("fecha_inventario", fromDate)
      .lte("fecha_inventario", toDate);

    if (categoria)     q = q.eq("categoria", categoria);
    if (bodega)        q = q.eq("bodega", bodega);
    if (inventario_id) q = q.eq("inventario_id", inventario_id);

    const { data, error } = await q;
    if (error) throw error;

    const totalRegistros = data.length;
    const totalCantidad  = data.reduce((s, r) => s + Number(r.cantidad || 0), 0);
    const bodegas        = new Set(data.map(d => d.bodega).filter(Boolean)).size;
    const inventarios    = new Set(data.map(d => d.inventario_id)).size;

    res.json({
      success: true,
      filters: { from: fromDate, to: toDate, categoria, bodega, inventario_id },
      kpis: { inventarios, totalRegistros, totalCantidad, operarios: 0, bodegas }
    });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

export const cic_series_daily = async (req, res) => {
  try {
    const { from, to, categoria, bodega, inventario_id } = req.query;
    const { fromISO, toISO } = parseRange(from, to);
    const fromDate = fromISO.slice(0, 10);
    const toDate   = toISO.slice(0, 10);

    let q = supabase
      .from("v_ciclico_registros")
      .select("fecha_inventario, cantidad, bodega, categoria, inventario_id")
      .gte("fecha_inventario", fromDate)
      .lte("fecha_inventario", toDate);

    if (categoria)     q = q.eq("categoria", categoria);
    if (bodega)        q = q.eq("bodega", bodega);
    if (inventario_id) q = q.eq("inventario_id", inventario_id);

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
    const { from, to, categoria, bodega, inventario_id, limit = 10 } = req.query;
    const { fromISO, toISO } = parseRange(from, to);
    const fromDate = fromISO.slice(0, 10);
    const toDate   = toISO.slice(0, 10);

    let q = supabase
      .from("v_ciclico_registros")
      .select("item, codigo_barras, cantidad, fecha_inventario, bodega, categoria, inventario_id")
      .gte("fecha_inventario", fromDate)
      .lte("fecha_inventario", toDate);

    if (categoria)     q = q.eq("categoria", categoria);
    if (bodega)        q = q.eq("bodega", bodega);
    if (inventario_id) q = q.eq("inventario_id", inventario_id);

    const { data, error } = await q;
    if (error) throw error;

    const map = new Map();
    for (const r of data) {
      const key = String(r.item || r.codigo_barras || "SIN_ITEM");
      map.set(key, (map.get(key) || 0) + Number(r.cantidad || 0));
    }
    const top = Array.from(map.entries())
      .map(([item_id, cantidad]) => ({ item_id, cantidad }))
      .sort((a,b) => b.cantidad - a.cantidad)
      .slice(0, Number(limit));

    res.json({ success: true, top });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

export const cic_by_bodega = async (req, res) => {
  try {
    const { from, to, categoria, bodega, inventario_id } = req.query;
    const { fromISO, toISO } = parseRange(from, to);
    const fromDate = fromISO.slice(0, 10);
    const toDate   = toISO.slice(0, 10);

    let q = supabase
      .from("v_ciclico_registros")
      .select("bodega, cantidad, fecha_inventario, categoria, inventario_id")
      .gte("fecha_inventario", fromDate)
      .lte("fecha_inventario", toDate);

    if (categoria)     q = q.eq("categoria", categoria);
    if (bodega)        q = q.eq("bodega", bodega);
    if (inventario_id) q = q.eq("inventario_id", inventario_id);

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
const applyCommonFilters = (query, { categoria, bodega, inventario_id }) => {
  if (categoria)     query = query.eq("categoria", categoria);
  if (bodega)        query = query.eq("bodega", bodega);
  if (inventario_id) query = query.eq("inventario_id", inventario_id);
  return query;
};

export const cf_overview = async (req, res) => {
  try {
    const { from, to, categoria, bodega, operario, inventario_id, zona_id } = req.query;
    const { fromISO, toISO } = parseRange(from, to, 30);

    let q = supabase
      .from("v_cyf_registros")
      .select("inventario_id, bodega, operario_email, cantidad, fecha_registro", { count: "exact" })
      .gte("fecha_registro", fromISO)
      .lte("fecha_registro", toISO);

    q = applyCommonFilters(q, { categoria, bodega, inventario_id });
    if (operario) q = q.eq("operario_email", operario);
    if (zona_id)  q = q.eq("id_zona", zona_id);

    const { data, error } = await q;
    if (error) throw error;

    const totalRegistros = data.length;
    const totalCantidad  = data.reduce((s, r) => s + Number(r.cantidad || 0), 0);
    const operarios      = new Set(data.map(d => d.operario_email).filter(Boolean)).size;
    const bodegas        = new Set(data.map(d => d.bodega).filter(Boolean)).size;
    const inventarios    = new Set(data.map(d => d.inventario_id)).size;

    res.json({ success: true, kpis: { inventarios, totalRegistros, totalCantidad, operarios, bodegas } });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

export const cf_series_daily = async (req, res) => {
  try {
    const { from, to, categoria, bodega, operario, inventario_id, zona_id } = req.query;
    const { fromISO, toISO } = parseRange(from, to, 30);

    let q = supabase
      .from("v_cyf_registros")
      .select("fecha_registro, cantidad, bodega, operario_email, id_zona")
      .gte("fecha_registro", fromISO)
      .lte("fecha_registro", toISO);

    q = applyCommonFilters(q, { categoria, bodega, inventario_id });
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
    const { from, to, categoria, bodega, operario, inventario_id, zona_id, limit = 10 } = req.query;
    const { fromISO, toISO } = parseRange(from, to, 30);

    let q = supabase
      .from("v_cyf_registros")
      .select("item_id, cantidad, fecha_registro, bodega, operario_email, id_zona")
      .gte("fecha_registro", fromISO)
      .lte("fecha_registro", toISO);

    q = applyCommonFilters(q, { categoria, bodega, inventario_id });
    if (operario) q = q.eq("operario_email", operario);
    if (zona_id)  q = q.eq("id_zona", zona_id);

    const { data, error } = await q;
    if (error) throw error;

    const map = new Map();
    for (const r of data) {
      const key = String(r.item_id);
      map.set(key, (map.get(key) || 0) + Number(r.cantidad || 0));
    }
    const top = Array.from(map.entries())
      .map(([item_id, cantidad]) => ({ item_id, cantidad }))
      .sort((a,b) => b.cantidad - a.cantidad)
      .slice(0, Number(limit));

    res.json({ success: true, top });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

export const cf_by_bodega = async (req, res) => {
  try {
    const { from, to, categoria, bodega, operario, inventario_id, zona_id } = req.query;
    const { fromISO, toISO } = parseRange(from, to, 30);

    let q = supabase
      .from("v_cyf_registros")
      .select("bodega, cantidad, fecha_registro, operario_email, id_zona")
      .gte("fecha_registro", fromISO)
      .lte("fecha_registro", toISO);

    q = applyCommonFilters(q, { categoria, bodega, inventario_id });
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