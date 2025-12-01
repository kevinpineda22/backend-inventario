import React, { useEffect, useMemo, useRef, useState } from "react";
import * as am5 from "@amcharts/amcharts5";
import * as am5xy from "@amcharts/amcharts5/xy";
import * as am5percent from "@amcharts/amcharts5/percent";
import am5themes_Animated from "@amcharts/amcharts5/themes/Animated";
import { motion } from "framer-motion";
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faChartLine, faBoxesStacked, faListCheck, faWarehouse, faBoxOpen,
  faFilter, faBroom, faBox, faCalendarDays, faFolderOpen, faTruckMoving,
  faIdCard, faTriangleExclamation, faCalendar, faArrowUp, faArrowDown, faMinus, faGaugeHigh
} from '@fortawesome/free-solid-svg-icons';
import "./DashboardInventario.css";

const API_BASE = "https://backend-inventario.vercel.app";

const ENDPOINTS = {
  overview: `${API_BASE}/api/analytics/ciclico/overview`,
  series: `${API_BASE}/api/analytics/ciclico/series/daily`,
  topItems: `${API_BASE}/api/analytics/ciclico/top/items`,
  byBodega: `${API_BASE}/api/analytics/ciclico/by/bodega`,
  inventarios: `${API_BASE}/api/analytics/ciclico/inventarios/resumen`,
  velocidadConteo: `${API_BASE}/api/analytics/ciclico/velocidad/conteo`,
};

// Utilidades para fechas
const toDateInput = (d) => new Date(d).toISOString().slice(0, 10);
const sameMonthDayLastMonth = () => {
  const d = new Date();
  d.setMonth(d.getMonth() - 1);
  return d;
};
const tomorrowDate = () => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d;
};
const qs = (obj) => {
  const p = new URLSearchParams();
  Object.entries(obj).forEach(([k, v]) => {
    if (v !== undefined && v !== null && String(v).trim() !== "") p.append(k, v);
  });
  return p.toString();
};

function DashboardCiclico() {
  const [from, setFrom] = useState(toDateInput(sameMonthDayLastMonth()));
  const [to, setTo] = useState(toDateInput(tomorrowDate()));
  const [categoria, setCategoria] = useState("");
  const [bodega, setBodega] = useState("");
  const [consecutivo, setConsecutivo] = useState("");

  const [categoriasOpts, setCategoriasOpts] = useState([]);
  const [bodegasOpts, setBodegasOpts] = useState([]);

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [kpis, setKpis] = useState({ inventarios: 0, totalRegistros: 0, totalCantidad: 0, bodegas: 0 });
  const [seriePorDia, setSeriePorDia] = useState([]);
  const [topItems, setTopItems] = useState([]);
  const [porBodega, setPorBodega] = useState([]);
  const [alertas, setAlertas] = useState([]);
  const [kpisAnterior, setKpisAnterior] = useState(null);
  const [inventariosResumen, setInventariosResumen] = useState([]);
  const [velocidadConteo, setVelocidadConteo] = useState([]);

  const refLinea = useRef(null);
  const refBarras = useRef(null);
  const refPie = useRef(null);
  const refVelocidad = useRef(null);

  useEffect(() => {
    const loadCategorias = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/maestro/grupos-maestros`);
        const json = await res.json();
        if (json.success && Array.isArray(json.grupos)) {
          setCategoriasOpts(json.grupos);
        } else {
          setCategoriasOpts([]);
        }
      } catch {
        setCategoriasOpts([]);
      }
    };
    loadCategorias();
  }, []);

  const refreshBodegasOpts = async () => {
    try {
      const query = qs({ from, to, categoria });
      const res = await fetch(`${ENDPOINTS.byBodega}?${query}`);
      const json = await res.json();
      const arr = json?.by_bodega || [];
      setBodegasOpts(arr.map((x) => x.bodega).filter(Boolean));
    } catch {
      setBodegasOpts([]);
    }
  };

  useEffect(() => {
    refreshBodegasOpts(); /* eslint-disable-next-line */
  }, [from, to, categoria]);

  // Nueva función para obtener alertas/anomalías
  const loadAlertas = async () => {
    try {
      const params = { from, to, categoria, bodega, consecutivo };
      const urlTop = `${ENDPOINTS.topItems}?${qs({ ...params, limit: 20 })}`;
      const res = await fetch(urlTop);
      const json = await res.json();
      
      if (json.success && json.top) {
        const items = json.top;
        const alertasGeneradas = [];
        
        // Detectar items con cantidades anómalas
        const promedio = items.reduce((s, i) => s + i.cantidad, 0) / items.length;
        
        items.forEach(item => {
          if (item.cantidad > promedio * 3) {
            alertasGeneradas.push({
              tipo: 'alta',
              mensaje: `${item.descripcion}: Cantidad muy alta (${item.cantidad})`,
              item: item.descripcion,
              valor: item.cantidad
            });
          } else if (item.cantidad < promedio * 0.1 && item.cantidad > 0) {
            alertasGeneradas.push({
              tipo: 'baja',
              mensaje: `${item.descripcion}: Cantidad muy baja (${item.cantidad})`,
              item: item.descripcion,
              valor: item.cantidad
            });
          }
        });
        
        setAlertas(alertasGeneradas.slice(0, 5));
      }
    } catch (e) {
      setAlertas([]);
    }
  };

  // Función para calcular período anterior
  const calcularPeriodoAnterior = (from, to) => {
    const fechaInicio = new Date(from);
    const fechaFin = new Date(to);
    const diasDiferencia = Math.ceil((fechaFin - fechaInicio) / (1000 * 60 * 60 * 24));
    
    const anteriorFin = new Date(fechaInicio);
    anteriorFin.setDate(anteriorFin.getDate() - 1);
    
    const anteriorInicio = new Date(anteriorFin);
    anteriorInicio.setDate(anteriorInicio.getDate() - diasDiferencia);
    
    return {
      from: toDateInput(anteriorInicio),
      to: toDateInput(anteriorFin)
    };
  };

  // Función para cargar datos del período anterior
  const loadPeriodoAnterior = async () => {
    try {
      const periodoAnterior = calcularPeriodoAnterior(from, to);
      const params = { 
        from: periodoAnterior.from, 
        to: periodoAnterior.to, 
        categoria, 
        bodega, 
        consecutivo 
      };

      const urlOverview = `${ENDPOINTS.overview}?${qs(params)}`;
      const res = await fetch(urlOverview);
      const json = await res.json();
      
      if (json.success && json.kpis) {
        setKpisAnterior(json.kpis);
      }
    } catch (e) {
      setKpisAnterior(null);
    }
  };

  const load = async () => {
    setLoading(true);
    setErr("");
    try {
      const params = { from, to, categoria, bodega, consecutivo };

      const requests = [
        fetch(`${ENDPOINTS.overview}?${qs(params)}`).then((r) => r.json()),
        fetch(`${ENDPOINTS.series}?${qs(params)}`).then((r) => r.json()),
        fetch(`${ENDPOINTS.topItems}?${qs({ ...params, limit: 10 })}`).then((r) => r.json()),
        fetch(`${ENDPOINTS.byBodega}?${qs(params)}`).then((r) => r.json()),
        fetch(`${ENDPOINTS.inventarios}?${qs(params)}`).then((r) => r.json()),
        fetch(`${ENDPOINTS.velocidadConteo}?${qs(params)}`).then((r) => r.json()),
      ];

      const [ov, se, ti, pb, inv, vel] = await Promise.all(requests);

      if (!ov.success) throw new Error(ov.message || "Error en overview");

      setKpis(ov.kpis || { inventarios: 0, totalRegistros: 0, totalCantidad: 0, bodegas: 0 });
      setSeriePorDia(se.series || []);
      setTopItems(ti.top || []);
      setPorBodega(pb.by_bodega || []);
      setInventariosResumen(inv.inventarios || []);
      setVelocidadConteo(vel.velocidades || []);

      await Promise.all([loadAlertas(), loadPeriodoAnterior()]);
    } catch (e) {
      setErr(e.message);
      setKpis({ inventarios: 0, totalRegistros: 0, totalCantidad: 0, bodegas: 0 });
      setSeriePorDia([]);
      setTopItems([]);
      setPorBodega([]);
      setInventariosResumen([]);
      setVelocidadConteo([]);
      setAlertas([]);
      setKpisAnterior(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load(); /* eslint-disable-next-line */
  }, []);

  const totalCantidadFmt = useMemo(() => (kpis.totalCantidad ?? 0).toLocaleString(), [kpis.totalCantidad]);

  // Función para calcular cambio porcentual
  const calcularCambio = (actual, anterior) => {
    if (!anterior || anterior === 0) return null;
    return ((actual - anterior) / anterior) * 100;
  };

  // Componente para mostrar indicadores de cambio
  const IndicadorCambio = ({ actual, anterior, formato = 'numero' }) => {
    const cambio = calcularCambio(actual, anterior);
    
    if (cambio === null) return <span style={{ color: '#6B7280' }}>-</span>;
    
    const esPositivo = cambio > 0;
    const esNeutro = Math.abs(cambio) < 0.1;
    
    const color = esNeutro ? '#6B7280' : (esPositivo ? '#10B981' : '#EF4444');
    const icono = esNeutro ? faMinus : (esPositivo ? faArrowUp : faArrowDown);
    
    const valorFormateado = Math.abs(cambio).toFixed(1) + '%';
    
    return (
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        gap: '4px', 
        fontSize: '0.8em',
        color 
      }}>
        <FontAwesomeIcon icon={icono} />
        <span>{valorFormateado}</span>
      </div>
    );
  };

  // ------ CHART: Línea (tendencia diaria) ------
  useEffect(() => {
    if (!refLinea.current) return;
    const root = am5.Root.new(refLinea.current);
    root.setThemes([am5themes_Animated.new(root)]);
    const chart = root.container.children.push(
      am5xy.XYChart.new(root, {
        panX: true,
        panY: true,
        wheelX: "panX",
        wheelY: "zoomX",
        layout: root.verticalLayout,
      })
    );
    const xAxis = chart.xAxes.push(
      am5xy.DateAxis.new(root, {
        baseInterval: { timeUnit: "day", count: 1 },
        renderer: am5xy.AxisRendererX.new(root, {}),
        tooltip: am5.Tooltip.new(root, {}),
      })
    );
    const yAxis = chart.yAxes.push(
      am5xy.ValueAxis.new(root, {
        renderer: am5xy.AxisRendererY.new(root, {}),
      })
    );
    const series = chart.series.push(
      am5xy.LineSeries.new(root, {
        name: "Cantidad",
        xAxis,
        yAxis,
        valueYField: "cantidad",
        valueXField: "ts",
        tooltip: am5.Tooltip.new(root, { labelText: "{valueY}" }),
      })
    );

    const data = (seriePorDia || []).map((d) => ({
      ts: new Date(d.date).getTime(),
      cantidad: Number(d.cantidad) || 0,
    }));
    series.data.setAll(data);
    series.bullets.push(() =>
      am5.Bullet.new(root, {
        sprite: am5.Circle.new(root, {
          radius: 3,
          strokeWidth: 2,
          stroke: root.interfaceColors.get("background"),
          fill: series.get("fill"),
        }),
      })
    );
    chart.set("cursor", am5xy.XYCursor.new(root, { behavior: "none" }));
    const legend = chart.children.push(am5.Legend.new(root, {}));
    legend.data.setAll(chart.series.values);

    return () => root.dispose();
  }, [seriePorDia]);

  // ------ CHART: Barras (Top ítems) ------
  useEffect(() => {
    if (!refBarras.current) return;
    const root = am5.Root.new(refBarras.current);
    root.setThemes([am5themes_Animated.new(root)]);
    const chart = root.container.children.push(
      am5xy.XYChart.new(root, {
        panX: true,
        panY: false,
        wheelX: "panX",
        wheelY: "zoomX",
        layout: root.verticalLayout,
      })
    );
    const xAxis = chart.xAxes.push(
      am5xy.CategoryAxis.new(root, {
        categoryField: "descripcion",
        renderer: am5xy.AxisRendererX.new(root, {
          minGridDistance: 30,
          cellStartLocation: 0.1,
          cellEndLocation: 0.9
        }),
      })
    );

    // Configurar el renderer para rotar las etiquetas
    xAxis.get("renderer").labels.template.setAll({
      rotation: -45,
      centerY: am5.p50,
      centerX: am5.p100,
      paddingRight: 15,
      maxWidth: 120,
      oversizedBehavior: "truncate"
    });

    const yAxis = chart.yAxes.push(am5xy.ValueAxis.new(root, { renderer: am5xy.AxisRendererY.new(root, {}) }));
    const series = chart.series.push(
      am5xy.ColumnSeries.new(root, {
        name: "Cantidad",
        xAxis,
        yAxis,
        valueYField: "cantidad",
        categoryXField: "descripcion",
        tooltip: am5.Tooltip.new(root, {
          labelText: `{descripcion}
Item ID: {item_id}
Grupo: {grupo}
Cantidad: {cantidad} {unidad_medida}
Registros: {registros}
Promedio: {promedio} por registro
Código Principal: {codigo_barras}`
        }),
      })
    );

    const data = (topItems || []).map((d) => {
      return {
        descripcion: String(d.descripcion || d.item_id || "SIN_ITEM"),
        item_id: d.item_id,
        grupo: d.grupo || d.categoria || "Sin grupo",
        cantidad: Number(d.cantidad) || 0,
        registros: Number(d.registros) || 0,
        promedio: Number(d.promedio) || 0,
        unidad_medida: d.unidad_medida || d.unidad || "",
        codigo_barras: d.codigo_barras || "Sin código",
      };
    });

    xAxis.data.setAll(data);
    series.data.setAll(data);
    series.columns.template.setAll({ cornerRadiusTL: 4, cornerRadiusTR: 4 });
    series.columns.template.adapters.add(
      "fill",
      (_f, target) =>
        target.dataItem.get("index") % 2 ? root.interfaceColors.get("primaryButton") : root.interfaceColors.get("alternativeBackground")
    );
    series.columns.template.adapters.add("stroke", (_s, target) => target.get("fill"));
    chart.set("cursor", am5xy.XYCursor.new(root, {}));
    return () => root.dispose();
  }, [topItems]);

  // ------ CHART: Pie (Distribución por bodega) ------
  useEffect(() => {
    if (!refPie.current) return;
    const root = am5.Root.new(refPie.current);
    root.setThemes([am5themes_Animated.new(root)]);
    const chart = root.container.children.push(am5percent.PieChart.new(root, { layout: root.verticalLayout }));
    const series = chart.series.push(
      am5percent.PieSeries.new(root, {
        valueField: "cantidad",
        categoryField: "bodega",
        endAngle: 360,
      })
    );
    series.slices.template.setAll({ tooltipText: "{category}: {value}" });
    const data = (porBodega || []).map((x) => ({ bodega: x.bodega || "N/A", cantidad: Number(x.cantidad) || 0 }));
    series.data.setAll(data);
    chart.appear(1000, 100);
    return () => root.dispose();
  }, [porBodega]);

  // ------ CHART: Velocidad de Conteo ------
  useEffect(() => {
    if (!refVelocidad.current || velocidadConteo.length === 0) return;
    
    const root = am5.Root.new(refVelocidad.current);
    root.setThemes([am5themes_Animated.new(root)]);
    
    const chart = root.container.children.push(
      am5xy.XYChart.new(root, {
        panX: false,
        panY: true,
        wheelX: "panY",
        wheelY: "zoomY",
        layout: root.verticalLayout,
      })
    );

    const yAxis = chart.yAxes.push(
      am5xy.CategoryAxis.new(root, {
        categoryField: "inventario_bodega",
        renderer: am5xy.AxisRendererY.new(root, {
          minGridDistance: 30,
          cellStartLocation: 0.1,
          cellEndLocation: 0.9
        }),
      })
    );

    const xAxis = chart.xAxes.push(
      am5xy.ValueAxis.new(root, {
        renderer: am5xy.AxisRendererX.new(root, {}),
      })
    );

    const series = chart.series.push(
      am5xy.ColumnSeries.new(root, {
        name: "Promedio por Item",
        xAxis,
        yAxis,
        valueXField: "promedio_por_item",
        categoryYField: "inventario_bodega",
        tooltip: am5.Tooltip.new(root, {
          labelText: `{inventario_bodega}
📊 Promedio por Item: {promedio_por_item}
📦 Items Contados: {items_contados}
🔢 Items Únicos: {items_unicos}
📈 Cantidad Total: {cantidad_total}
⚡ Eficiencia: {eficiencia_conteo}
📅 Fecha: {fecha_inventario}`
        }),
      })
    );

    const data = velocidadConteo.map((d) => ({
      inventario_bodega: d.inventario_bodega,
      promedio_por_item: Number(d.promedio_por_item) || 0,
      items_contados: Number(d.items_contados) || 0,
      items_unicos: Number(d.items_unicos) || 0,
      cantidad_total: Number(d.cantidad_total) || 0,
      eficiencia_conteo: Number(d.eficiencia_conteo) || 0,
      fecha_inventario: d.fecha_inventario
    }));

    yAxis.data.setAll(data);
    series.data.setAll(data);
    
    series.columns.template.adapters.add("fill", (_fill, target) => {
      const dataContext = target.dataItem?.dataContext;
      if (dataContext) {
        const promedio = dataContext.promedio_por_item || 0;
        if (promedio >= 50) return am5.color("#10B981");
        if (promedio >= 20) return am5.color("#F59E0B");
        return am5.color("#3B82F6");
      }
      return am5.color("#6B7280");
    });

    series.columns.template.setAll({ 
      cornerRadiusTR: 4, 
      cornerRadiusBR: 4,
      strokeWidth: 2,
      stroke: am5.color("#FFFFFF")
    });

    chart.set("cursor", am5xy.XYCursor.new(root, {}));
    return () => root.dispose();
  }, [velocidadConteo]);

  // KPIs mini-cards con comparativo
  const KPIs = () => (
    <div className="dashboard-inv-kpi-grid">
      <div className="dashboard-inv-kpi-card">
        <FontAwesomeIcon icon={faBoxesStacked} className="dashboard-inv-kpi-icon" />
        <div className="dashboard-inv-kpi-title">Inventarios Aprobados</div>
        <div className="dashboard-inv-kpi-value">{kpis.inventarios ?? 0}</div>
        {kpisAnterior && (
          <IndicadorCambio actual={kpis.inventarios} anterior={kpisAnterior.inventarios} />
        )}
      </div>
      <div className="dashboard-inv-kpi-card">
        <FontAwesomeIcon icon={faListCheck} className="dashboard-inv-kpi-icon" />
        <div className="dashboard-inv-kpi-title">Items Contados</div>
        <div className="dashboard-inv-kpi-value">{kpis.totalRegistros ?? 0}</div>
        {kpisAnterior && (
          <IndicadorCambio actual={kpis.totalRegistros} anterior={kpisAnterior.totalRegistros} />
        )}
      </div>
      <div className="dashboard-inv-kpi-card">
        <FontAwesomeIcon icon={faBoxOpen} className="dashboard-inv-kpi-icon" />
        <div className="dashboard-inv-kpi-title">Cantidad Total</div>
        <div className="dashboard-inv-kpi-value">{totalCantidadFmt}</div>
        {kpisAnterior && (
          <IndicadorCambio actual={kpis.totalCantidad} anterior={kpisAnterior.totalCantidad} />
        )}
      </div>
      {kpis.itemsUnicos && (
        <div className="dashboard-inv-kpi-card">
          <FontAwesomeIcon icon={faBox} className="dashboard-inv-kpi-icon" />
          <div className="dashboard-inv-kpi-title">Items Únicos</div>
          <div className="dashboard-inv-kpi-value">{kpis.itemsUnicos ?? 0}</div>
          {kpisAnterior && (
            <IndicadorCambio actual={kpis.itemsUnicos} anterior={kpisAnterior.itemsUnicos} />
          )}
        </div>
      )}
      <div className="dashboard-inv-kpi-card">
        <FontAwesomeIcon icon={faChartLine} className="dashboard-inv-kpi-icon" />
        <div className="dashboard-inv-kpi-title">Promedio por Item</div>
        <div className="dashboard-inv-kpi-value">{kpis.promedioPorRegistro ?? 0}</div>
        {kpisAnterior && (
          <IndicadorCambio actual={kpis.promedioPorRegistro} anterior={kpisAnterior.promedioPorRegistro} />
        )}
      </div>
      <div className="dashboard-inv-kpi-card">
        <FontAwesomeIcon icon={faWarehouse} className="dashboard-inv-kpi-icon" />
        <div className="dashboard-inv-kpi-title">Bodegas</div>
        <div className="dashboard-inv-kpi-value">{kpis.bodegas ?? 0}</div>
        {kpisAnterior && (
          <IndicadorCambio actual={kpis.bodegas} anterior={kpisAnterior.bodegas} />
        )}
      </div>
    </div>
  );

  // Filtros rápidos
  const FiltrosRapidos = () => (
    <div style={{ 
      display: 'flex', 
      gap: '10px', 
      marginBottom: '15px',
      flexWrap: 'wrap'
    }}>
      <button 
        className="dashboard-inv-btn dashboard-inv-btn-secondary"
        onClick={() => {
          setFrom(toDateInput(sameMonthDayLastMonth()));
          setTo(toDateInput(tomorrowDate()));
        }}
      >
        <FontAwesomeIcon icon={faCalendar} /> Último Mes (hasta hoy)
      </button>
      <button 
        className="dashboard-inv-btn dashboard-inv-btn-secondary"
        onClick={() => {
          const lastMonth = new Date();
          lastMonth.setMonth(lastMonth.getMonth() - 1, 1);
          const endLastMonth = new Date();
          endLastMonth.setDate(0);
          setFrom(toDateInput(lastMonth));
          setTo(toDateInput(endLastMonth));
        }}
      >
        <FontAwesomeIcon icon={faCalendar} /> Mes Anterior Completo
      </button>
      <button 
        className="dashboard-inv-btn dashboard-inv-btn-secondary"
        onClick={() => {
          const threeMonthsAgo = new Date();
          threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3, 1);
          setFrom(toDateInput(threeMonthsAgo));
          setTo(toDateInput(tomorrowDate()));
        }}
      >
        <FontAwesomeIcon icon={faCalendar} /> Últimos 3 Meses
      </button>
    </div>
  );

  // Panel de alertas
  const PanelAlertas = () => (
    <div className="dashboard-inv-chart-panel">
      <h3 className="dashboard-inv-chart-title">
        <FontAwesomeIcon icon={faTriangleExclamation} className="dashboard-inv-panel-icon" /> 
        Alertas y Comparativo
      </h3>
      <div style={{ padding: '15px' }}>
        {kpisAnterior && (
          <div style={{ 
            marginBottom: '15px', 
            padding: '10px', 
            backgroundColor: '#F8FAFC', 
            borderRadius: '8px',
            borderLeft: '4px solid #3B82F6'
          }}>
            <div style={{ fontSize: '0.9em', fontWeight: '600', marginBottom: '8px' }}>
              📊 Comparativo vs Período Anterior:
            </div>
            <div style={{ fontSize: '0.8em', color: '#374151' }}>
              <div>Registros: {kpis.totalRegistros} vs {kpisAnterior.totalRegistros} 
                <IndicadorCambio actual={kpis.totalRegistros} anterior={kpisAnterior.totalRegistros} />
              </div>
              <div>Cantidad: {(kpis.totalCantidad || 0).toLocaleString()} vs {(kpisAnterior.totalCantidad || 0).toLocaleString()}
                <IndicadorCambio actual={kpis.totalCantidad} anterior={kpisAnterior.totalCantidad} />
              </div>
            </div>
          </div>
        )}

        <div style={{ maxHeight: '150px', overflowY: 'auto' }}>
          {alertas.length === 0 ? (
            <p style={{ color: '#10B981', fontStyle: 'italic', textAlign: 'center', padding: '20px' }}>
              ✅ No se detectaron anomalías
            </p>
          ) : (
            alertas.map((alerta, idx) => (
              <div key={idx} style={{
                padding: '8px 10px',
                marginBottom: '6px',
                borderRadius: '6px',
                backgroundColor: alerta.tipo === 'alta' ? '#FEF3C7' : '#DBEAFE',
                borderLeft: `3px solid ${alerta.tipo === 'alta' ? '#F59E0B' : '#3B82F6'}`,
                fontSize: '0.8em'
              }}>
                <div style={{ fontWeight: '600' }}>
                  {alerta.tipo === 'alta' ? '⚠️' : '📉'} {alerta.mensaje}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );

  // Panel específico para inventarios cíclicos
  const PanelInventariosCiclico = () => {
    if (inventariosResumen.length === 0) return null;
    
    return (
      <div className="dashboard-inv-chart-panel">
        <h3 className="dashboard-inv-chart-title">
          <FontAwesomeIcon icon={faBoxesStacked} className="dashboard-inv-panel-icon" /> 
          Resumen de Inventarios Cíclicos
        </h3>
        <div style={{ padding: '15px' }}>
          <div style={{ 
            maxHeight: '300px', 
            overflowY: 'auto',
            display: 'grid',
            gap: '10px'
          }}>
            {inventariosResumen.slice(0, 10).map((inv, idx) => (
              <div key={idx} style={{
                padding: '12px',
                backgroundColor: '#F8FAFC',
                borderRadius: '8px',
                borderLeft: '4px solid #3B82F6',
                display: 'grid',
                gridTemplateColumns: '1fr 1fr 1fr',
                gap: '10px',
                fontSize: '0.85em'
              }}>
                <div>
                  <div style={{ fontWeight: '600', color: '#1F2937' }}>
                    #{inv.consecutivo} - {inv.nombre}
                  </div>
                  <div style={{ color: '#6B7280', fontSize: '0.9em' }}>
                    {new Date(inv.fecha).toLocaleDateString('es-ES')}
                  </div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ color: '#059669', fontWeight: '600' }}>
                    {inv.cantidad_total.toLocaleString()} unidades
                  </div>
                  <div style={{ color: '#6B7280' }}>
                    {inv.items_contados} items contados
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ color: '#7C3AED', fontWeight: '600' }}>
                    {inv.bodegas} bodegas
                  </div>
                  <div style={{ color: '#6B7280' }}>
                    Prom: {inv.promedio_por_item}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  // Panel de filtros
  const Filtros = React.useMemo(() => (
    <div className="dashboard-inv-filter-panel">
      <h3 className="dashboard-inv-panel-title">
        <FontAwesomeIcon icon={faFilter} className="dashboard-inv-panel-icon" /> 
        Filtros de Datos Cíclico
      </h3>
      
      <FiltrosRapidos />
      
      <div className="dashboard-inv-filter-group">
        <div className="dashboard-inv-filter-item">
          <label className="dashboard-inv-label"><FontAwesomeIcon icon={faCalendarDays} /> Desde</label>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="dashboard-inv-input" />
        </div>
        <div className="dashboard-inv-filter-item">
          <label className="dashboard-inv-label"><FontAwesomeIcon icon={faCalendarDays} /> Hasta</label>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="dashboard-inv-input" />
        </div>
        <div className="dashboard-inv-filter-item">
          <label className="dashboard-inv-label"><FontAwesomeIcon icon={faFolderOpen} /> Categoría/Grupo</label>
          <input
            list="dl-categorias"
            placeholder="Todas"
            value={categoria}
            onChange={(e) => setCategoria(e.target.value)}
            className="dashboard-inv-input"
          />
          <datalist id="dl-categorias">
            {categoriasOpts.map((g) => (
              <option key={g} value={g} />
            ))}
          </datalist>
        </div>
        <div className="dashboard-inv-filter-item">
          <label className="dashboard-inv-label"><FontAwesomeIcon icon={faTruckMoving} /> Bodega</label>
          <input
            list="dl-bodegas"
            placeholder="Todas"
            value={bodega}
            onChange={(e) => setBodega(e.target.value)}
            className="dashboard-inv-input"
          />
          <datalist id="dl-bodegas">
            {bodegasOpts.map((b) => (
              <option key={b} value={b} />
            ))}
          </datalist>
        </div>
        <div className="dashboard-inv-filter-item">
          <label className="dashboard-inv-label"><FontAwesomeIcon icon={faIdCard} /> Inventario (consecutivo)</label>
          <input
            placeholder="Ej. 77"
            value={consecutivo}
            onChange={(e) => setConsecutivo(e.target.value)}
            className="dashboard-inv-input"
          />
        </div>
        <div className="dashboard-inv-filter-actions">
          <button className="dashboard-inv-btn dashboard-inv-btn-primary" onClick={load}>
            <FontAwesomeIcon icon={faChartLine} /> Aplicar filtros
          </button>
          <button
            className="dashboard-inv-btn dashboard-inv-btn-secondary"
            onClick={() => {
              setCategoria("");
              setBodega("");
              setConsecutivo("");
              setFrom(toDateInput(sameMonthDayLastMonth()));
              setTo(toDateInput(tomorrowDate()));
            }}
          >
            <FontAwesomeIcon icon={faBroom} /> Limpiar
          </button>
        </div>
      </div>
    </div>
  ), [from, to, categoria, bodega, consecutivo, categoriasOpts, bodegasOpts]);

  return (
    <div className="dashboard-inv-container">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="dashboard-inv-header">
        <h2 className="dashboard-inv-main-title">
          <FontAwesomeIcon icon={faBoxesStacked} /> Dashboard Inventario Cíclico
        </h2>
      </motion.div>

      {Filtros}

      {loading && <p className="dashboard-inv-status-msg">Cargando datos…</p>}
      {err && <p className="dashboard-inv-error-msg">Error: {err}</p>}

      <KPIs />

      <div className="dashboard-inv-charts-grid">
        {/* Gráfico de tendencia temporal */}
        <div className="dashboard-inv-chart-panel">
          <h3 className="dashboard-inv-chart-title">
            <FontAwesomeIcon icon={faChartLine} className="dashboard-inv-panel-icon" /> 
            Tendencia Temporal
          </h3>
          <div ref={refLinea} className="dashboard-inv-chart" />
        </div>

        {/* Gráficos de distribución */}
        <div className="dashboard-inv-charts-bottom-row">
          <div className="dashboard-inv-chart-panel dashboard-inv-chart-panel-lg">
            <h3 className="dashboard-inv-chart-title">
              <FontAwesomeIcon icon={faBox} className="dashboard-inv-panel-icon" /> 
              Top 10 Items
            </h3>
            <div ref={refBarras} className="dashboard-inv-chart" />
          </div>
          <div className="dashboard-inv-chart-panel dashboard-inv-chart-panel-sm">
            <h3 className="dashboard-inv-chart-title">
              <FontAwesomeIcon icon={faWarehouse} className="dashboard-inv-panel-icon" /> 
              Distribución por Bodega
            </h3>
            <div ref={refPie} className="dashboard-inv-chart" />
          </div>
        </div>

        {/* Panel específico para inventarios cíclicos */}
        <PanelInventariosCiclico />

        {/* Gráfico de velocidad de conteo */}
        {velocidadConteo.length > 0 && (
          <div className="dashboard-inv-chart-panel">
            <h3 className="dashboard-inv-chart-title">
              <FontAwesomeIcon icon={faGaugeHigh} className="dashboard-inv-panel-icon" /> 
              Eficiencia de Conteo por Inventario-Bodega
            </h3>
            <div style={{ padding: '10px 15px', backgroundColor: '#FEF3C7', borderRadius: '6px', marginBottom: '10px' }}>
              <div style={{ fontSize: '0.85em', color: '#92400E' }}>
                📊 <strong>Análisis de Productividad:</strong> Promedio de cantidad por item contado en cada inventario cíclico por bodega
                <br />
                🟢 Verde: Alta eficiencia (≥50) | 🟡 Amarillo: Media (≥20) | 🔵 Azul: Estándar (&lt;20)
              </div>
            </div>
            <div ref={refVelocidad} className="dashboard-inv-chart" />
          </div>
        )}

        {/* Panel de alertas y comparativo */}
        <PanelAlertas />
      </div>
    </div>
  );
}

export default DashboardCiclico;