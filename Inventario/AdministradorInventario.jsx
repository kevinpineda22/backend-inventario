import React, { useState, useEffect } from "react";
import * as XLSX from "xlsx";
import { motion, AnimatePresence } from "framer-motion";
import {
  FaFolder, FaFolderOpen, FaClipboardList, FaAlignLeft, FaCalendarAlt, FaHashtag,
  FaList, FaFileExcel, FaClipboard, FaPlay, FaChartLine, FaDatabase, FaSpinner,
  FaFileContract, FaCheckCircle, FaTimesCircle, FaChartPie, FaMapMarkerAlt
} from "react-icons/fa";
import { useSnackbar, SnackbarProvider } from 'notistack';
import { supabase } from "../supabaseClient";
import CargaMaestra from './CargaMaestra';
import InventariosActivos from './InventariosActivos';
import InventariosFinalizados from './InventariosFinalizados';
import IniciarInventario from './InicarInventario';
import DashboardInventario from "./DashboardInventario";
import "./AdministradorInventario.css";

/* ========================= Helpers ========================= */

// Normaliza texto sin perder ceros a la izquierda
const norm = (v) => String(v ?? "").trim();

// Quita acentos y normaliza (para detectar encabezados con o sin acentos)
const simplify = (s) =>
  String(s ?? "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().trim();

// Detecta la columna de códigos de barras con lógica flexible
const findBarcodeIndex = (headers) => {
  const hs = headers.map(simplify);
  for (let i = 0; i < hs.length; i++) {
    const h = hs[i];
    // Palabras típicas
    if (/(^| )barcode( |$)|(^| )ean(13)?( |$)|(^| )gtin(14)?( |$)|(^| )upc( |$)/.test(h)) return i;
    // Combinaciones como "código/cod" + "barra/barras/principal"
    if ((h.includes("codigo") || h.includes("cod")) && (h.includes("barra") || h.includes("barras"))) return i;
    // Variaciones específicas con "código barras" (con o sin tilde, con o sin "s")
    if (h.includes("codigo barras") || h.includes("codigo barra") || h.includes("cod barras") || h.includes("cod barra")) return i;
    // 🆕 NUEVA DETECCIÓN: Variaciones con underscore
    if (h.includes("codigo_barras") || h.includes("codigo_barra") || h.includes("cod_barras") || h.includes("cod_barra")) return i;
    // 🆕 DETECCIÓN EXACTA: Campo específico "codigo_barras"
    if (h === "codigo_barras" || h === "codigobarras") return i;
  }
  return -1;
};

// Limpia el valor visual del código (sin perder ceros a la izquierda); deja solo dígitos
const cleanBarcode = (v) => String(v ?? "").replace(/[^\d]/g, "").trim();

// Heurística simple para códigos típicos (EAN-8, UPC/EAN/GTIN 12–14)
const looksLikeBarcode = (v) => /^(?:\d{8}|\d{12,14})$/.test(v);

/* =========================================================== */

const AdministradorInventarioContent = () => {
  const { enqueueSnackbar } = useSnackbar();
  const [user, setUser] = useState(null);
  const [form, setForm] = useState({
    nombre: "",
    descripcion: "",
    fecha: new Date().toISOString().split("T")[0],
    consecutivo: "",
    categoria: "",
    sede: "",
    sin_codigo_barras: false // ✅ NUEVO: Campo para inventarios sin código de barras
  });
  const [excelData, setExcelData] = useState([]);       // Filas (array de arrays) para preview
  const [excelHeaders, setExcelHeaders] = useState([]); // Encabezados (array)
  const [productos, setProductos] = useState([]);       // Filas como objetos (sheet_to_json)
  const [excelFile, setExcelFile] = useState(null);
  const [vista, setVista] = useState("formulario");
  const [isFinalizadosOpen, setIsFinalizadosOpen] = useState(false);
  const [gruposDisponibles, setGruposDisponibles] = useState([]);
  const [loading, setLoading] = useState(false);

  // Función mejorada para verificar consecutivos en TODOS los inventarios (activos y finalizados) POR SEDE
  const verificarConsecutivoExistente = async (consecutivo, sede) => {
    try {
      // ✅ Llamar al endpoint del backend para verificar
      const response = await fetch(`https://backend-inventario.vercel.app/api/admin/verificar-consecutivo?sede=${encodeURIComponent(sede)}&consecutivo=${encodeURIComponent(consecutivo)}`);
      if (!response.ok) throw new Error("Error en la verificación del servidor");
      
      const data = await response.json();
      return data.existe || false; // Asumiendo que el endpoint devuelve { existe: true/false }
    } catch (error) {
      console.error("Error verificando consecutivo:", error);
      // En caso de error de conexión, permitir continuar pero avisar
      enqueueSnackbar("⚠️ No se pudo verificar el consecutivo completamente. Verifica manualmente que no esté duplicado.", { 
        variant: 'warning',
        autoHideDuration: 6000 
      });
      return false;
    }
  };

  const toggleFinalizados = () => setIsFinalizadosOpen(!isFinalizadosOpen);

  useEffect(() => {
    const fetchUser = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setUser(session?.user ?? null);
    };
    fetchUser();

    fetch("https://backend-inventario.vercel.app/api/maestro/grupos-maestros")
      .then(res => {
        if (!res.ok) throw new Error('La respuesta del servidor no fue OK');
        return res.json();
      })
      .then(data => {
        if (data.success && Array.isArray(data.grupos)) {
          setGruposDisponibles(data.grupos);
        } else {
          console.error("El backend no devolvió una lista de grupos válida.");
        }
      })
      .catch(error => {
        console.error("Error al cargar grupos:", error);
        enqueueSnackbar("Hubo un error al cargar las categorías.", { variant: 'error' });
      });
  }, [enqueueSnackbar]);

  const handleChange = (e) => {
    const { name, value, files, type, checked } = e.target;
    if (name === "excelFile") {
      const file = files?.[0];
      setExcelFile(file || null);
      if (file) handleExcel(file);
    } else if (type === "checkbox") { // ✅ NUEVO: Manejar checkbox
      setForm((prev) => ({ ...prev, [name]: checked }));
    } else {
      setForm((prev) => ({ ...prev, [name]: value }));
    }
  };

  const handleExcel = (file) => {
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target.result;
        const wb = XLSX.read(bstr, { type: "binary" });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];

        if (!ws) {
          enqueueSnackbar("El archivo Excel no tiene hojas.", { variant: 'error' });
          setExcelHeaders([]); setExcelData([]); setProductos([]);
          return;
        }

        // data para backend como objetos
        const data = XLSX.utils.sheet_to_json(ws, { raw: false, defval: null });
        // data para preview (matriz [ [headers...], [row...], ... ])
        const rawDataForPreview = XLSX.utils.sheet_to_json(ws, { header: 1 });

        if (!rawDataForPreview || rawDataForPreview.length === 0) {
          enqueueSnackbar("El Excel está vacío o sin encabezados.", { variant: 'error' });
          setExcelHeaders([]); setExcelData([]); setProductos([]);
          return;
        }

        const headers = rawDataForPreview[0] || [];
        const headersLower = headers.map(h => norm(h).toLowerCase());
        setExcelHeaders(headers);

        // --- Validación 1: ítems que inician con "0"
        const itemIndex = headersLower.findIndex(h => h === "item");
        if (itemIndex !== -1) {
          const invalidItems = rawDataForPreview
            .slice(1)
            .some(row => norm(row[itemIndex]).startsWith("0"));
          if (invalidItems) {
            enqueueSnackbar("Error: Algunos ítems inician con '0'. Corrige el Excel.", { variant: 'error' });
            setExcelData([]); setProductos([]);
            return;
          }
        }

        // --- Validación 2: Códigos de barras duplicados (detección robusta de columna)
        const bcIdx = findBarcodeIndex(headers);
        if (bcIdx !== -1) {
          const barras = rawDataForPreview
            .slice(1)
            .map(r => cleanBarcode(r[bcIdx]))
            .filter(v => v && looksLikeBarcode(v)); // ignora vacíos y valores no numéricos válidos

          const seen = new Set();
          const dupSet = new Set();
          for (const b of barras) (seen.has(b) ? dupSet.add(b) : seen.add(b));

          if (dupSet.size) {
            const ejemplos = [...dupSet].slice(0, 10).join(", ");
            enqueueSnackbar(`Hay códigos de barras duplicados (${dupSet.size}). Ejemplos: ${ejemplos}`, { variant: 'error' });
            setExcelData([]); setProductos([]);
            return;
          }
        }

        // --- Validación 3: Columna "Grupo" vs form.categoria
        const grupoIdx = headersLower.indexOf("grupo");
        if (grupoIdx !== -1) {
          const gruposExcel = rawDataForPreview
            .slice(1)
            .map(r => norm(r[grupoIdx]))
            .filter(Boolean);

          const uniqueGrupos = [...new Set(gruposExcel)];

          if (uniqueGrupos.length > 1) {
            enqueueSnackbar(`El Excel contiene múltiples grupos: ${uniqueGrupos.slice(0, 5).join(", ")}. Sube un archivo de un solo grupo.`, { variant: 'error' });
            setExcelData([]); setProductos([]);
            return;
          }

          if (uniqueGrupos.length === 1) {
            const grupoExcel = uniqueGrupos[0];
            const categoriaForm = norm(form.categoria);

            if (categoriaForm) {
              if (grupoExcel !== categoriaForm) {
                enqueueSnackbar(`El grupo del Excel (${grupoExcel}) no coincide con la categoría seleccionada (${categoriaForm}).`, { variant: 'error' });
                setExcelData([]); setProductos([]);
                return;
              }
            } else {
              // Autocompletar si está en la lista permitida
              if (gruposDisponibles.includes(grupoExcel)) {
                setForm(prev => ({ ...prev, categoria: grupoExcel }));
                enqueueSnackbar(`Categoría autocompletada desde Excel: ${grupoExcel}`, { variant: 'info' });
              } else {
                enqueueSnackbar(`El grupo del Excel (${grupoExcel}) no está en la lista de categorías permitidas.`, { variant: 'error' });
                setExcelData([]); setProductos([]);
                return;
              }
            }
          }
        }

        // Si todo bien:
        setExcelData(rawDataForPreview.slice(1));
        setProductos(data);
        enqueueSnackbar(`Se procesaron ${data.length} productos del archivo.`, { variant: 'success' });
      } catch (error) {
        console.error("Error en handleExcel:", error);
        enqueueSnackbar("Error al procesar el archivo Excel.", { variant: 'error' });
        setExcelData([]); setProductos([]);
      }
    };
    reader.readAsBinaryString(file);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Validaciones básicas de formulario
    if (!productos.length || !excelFile || !form.consecutivo || !form.nombre || !form.categoria || !form.sede) { // ✅ Validar sede
      enqueueSnackbar("Por favor, completa todos los campos y carga un archivo Excel.", { variant: 'error' });
      return;
    }

    // Validar consecutivo entero positivo
    const consecutivoNum = Number(form.consecutivo);
    if (!Number.isInteger(consecutivoNum) || consecutivoNum <= 0) {
      enqueueSnackbar("El consecutivo debe ser un entero positivo.", { variant: 'error' });
      return;
    }

    // 🆕 VALIDACIÓN COMPLETA: Verificar si el consecutivo ya existe en la SEDE
    setLoading(true);
    try {
      const consecutivoExiste = await verificarConsecutivoExistente(form.consecutivo, form.sede);
      if (consecutivoExiste) {
        enqueueSnackbar(`❌ Error: Ya existe un inventario con el consecutivo #${form.consecutivo} en la sede ${form.sede}. Por favor, cambia el consecutivo.`, { 
          variant: 'error',
          autoHideDuration: 10000 
        });
        setLoading(false);
        return;
      }
    } catch (error) {
      console.error("Error en verificación de consecutivo:", error);
      setLoading(false);
      enqueueSnackbar("⚠️ Error al verificar el consecutivo. Por favor, verifica manualmente que no esté duplicado antes de continuar.", { 
        variant: 'warning',
        autoHideDuration: 8000 
      });
      
      // Confirmación más específica para continuar a pesar del error
      const confirmarContinuar = window.confirm(
        `⚠️ ADVERTENCIA DE VERIFICACIÓN\n\n` +
        `No se pudo verificar completamente si el consecutivo #${form.consecutivo} ya existe en el sistema.\n\n` +
        `Esto podría deberse a:\n` +
        `• Problemas de conexión con el servidor\n` +
        `• Error temporal en la base de datos\n\n` +
        `¿Estás COMPLETAMENTE SEGURO de que este consecutivo NO existe en ningún inventario (activo, finalizado, etc.) y deseas continuar?\n\n` +
        `⚡ Crear un inventario con consecutivo duplicado puede causar problemas graves en el sistema.`
      );
      
      if (!confirmarContinuar) {
        return;
      }
    }

    // Validar que la categoría exista en la lista de grupos
    if (!gruposDisponibles.includes(norm(form.categoria))) {
      enqueueSnackbar("Selecciona una categoría válida de la lista.", { variant: 'error' });
      setLoading(false);
      return;
    }

    // Chequeo final: Grupo del Excel (si existía la columna) vs. categoría del formulario
    if (excelHeaders.length && excelData.length) {
      const headersLower = excelHeaders.map(h => norm(h).toLowerCase());

      const grupoIdx = headersLower.indexOf("grupo");
      if (grupoIdx !== -1) {
        const gruposExcel = excelData.map(r => norm(r[grupoIdx])).filter(Boolean);
        const uniqueGrupos = [...new Set(gruposExcel)];
        if (uniqueGrupos.length > 1) {
          enqueueSnackbar("El Excel contiene múltiples grupos. Sube un archivo con un solo grupo.", { variant: 'error' });
          setLoading(false);
          return;
        }
        if (uniqueGrupos.length === 1 && uniqueGrupos[0] !== norm(form.categoria)) {
          enqueueSnackbar(`El grupo del Excel (${uniqueGrupos[0]}) no coincide con la categoría seleccionada (${form.categoria}).`, { variant: 'error' });
          setLoading(false);
          return;
        }
      }

      // Chequeo final: Duplicados de códigos de barras
      const bcIdx = findBarcodeIndex(excelHeaders);
      if (bcIdx !== -1) {
        const barras = excelData
          .map(r => cleanBarcode(r[bcIdx]))
          .filter(v => v && looksLikeBarcode(v));

        if (new Set(barras).size !== barras.length) {
          enqueueSnackbar("El archivo tiene códigos de barras duplicados. Corrige y vuelve a cargar.", { variant: 'error' });
          setLoading(false);
          return;
        }
      }
    }

    // Si llegamos aquí, el consecutivo es válido y único en la sede, proceder con la creación
    try {
      const formData = new FormData();
      formData.append('nombre', form.nombre);
      formData.append('descripcion', form.descripcion);
      formData.append('fecha', form.fecha);
      formData.append('consecutivo', form.consecutivo);
      formData.append('categoria', form.categoria);
      formData.append('sede', form.sede);
      formData.append('sin_codigo_barras', form.sin_codigo_barras); // ✅ NUEVO: Incluir flag
      formData.append('usuario_email', user?.email || 'admin@example.com');
      formData.append('productos', JSON.stringify(productos));
      formData.append('file', excelFile);

      const res = await fetch("https://backend-inventario.vercel.app/api/admin/crear-inventario", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Error al crear el inventario.");

      enqueueSnackbar(`✅ ${data.message}`, { variant: 'success' });
      // Reset de estados
      setForm({
        nombre: "",
        descripcion: "",
        fecha: new Date().toISOString().split("T")[0],
        consecutivo: "",
        categoria: "",
        sede: "",
        sin_codigo_barras: false // ✅ NUEVO: Resetear checkbox
      });
      setExcelData([]); setExcelHeaders([]); setProductos([]); setExcelFile(null);
    } catch (err) {
      enqueueSnackbar(`❌ Error: ${err.message}`, { variant: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const renderVistaFormulario = () => (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="admin-inv-form-wrapper"
    >
      <form onSubmit={handleSubmit} className="admin-inv-form-container">
        <div className="admin-inv-form-group">
          <label className="admin-inv-form-label"><FaClipboardList /> Nombre de Inventario</label>
          <input type="text" name="nombre" value={form.nombre} onChange={handleChange} required className="admin-inv-form-input" />
        </div>
        <div className="admin-inv-form-group">
          <label className="admin-inv-form-label"><FaAlignLeft /> Descripción</label>
          <textarea name="descripcion" value={form.descripcion} onChange={handleChange} required className="admin-inv-form-textarea" rows="4"></textarea>
        </div>
        <div className="admin-inv-form-group">
          <label className="admin-inv-form-label"><FaCalendarAlt /> Fecha</label>
          <input type="date" name="fecha" value={form.fecha} onChange={handleChange} required className="admin-inv-form-input" />
        </div>
        <div className="admin-inv-form-group">
          <label className="admin-inv-form-label"><FaHashtag /> Consecutivo</label>
          <input type="number" name="consecutivo" value={form.consecutivo} onChange={handleChange} required className="admin-inv-form-input" />
        </div>
        <div className="admin-inv-form-group">
          <label className="admin-inv-form-label"><FaList /> Categoría (Grupo)</label>
          <input
            type="text"
            name="categoria"
            value={form.categoria}
            onChange={handleChange}
            className="admin-inv-form-input"
            placeholder="Escribe para buscar una categoría..."
            list="grupos-sugerencias"
            required
            autoComplete="off"
          />
          <datalist id="grupos-sugerencias">
            {gruposDisponibles.map(g => <option key={g} value={g} />)}
          </datalist>
        </div>
        <div className="admin-inv-form-group">
          <label className="admin-inv-form-label"><FaMapMarkerAlt /> Sede</label>
          <select 
            name="sede" 
            value={form.sede} 
            onChange={handleChange} 
            required 
            className="admin-inv-form-select"
          >
            <option value="" disabled>📍 Selecciona una sede...</option>
            <option value="Plaza">🏢 Plaza</option>
            <option value="Villa Hermosa">🏘️ Villa Hermosa</option>
            <option value="Girardota Parque">🌳 Girardota Parque</option>
            <option value="Llano">🌾 Llano</option>
            <option value="Vegas">🎰 Vegas</option>
            <option value="Barbosa">🏔️ Barbosa</option>
            <option value="San Juan">⛪ San Juan</option>
          </select>
        </div>

        {/* ✅ MODIFICADO: Texto actualizado del checkbox */}
        <div 
          className="admin-inv-checkbox-wrapper"
          onClick={() => {
            const newValue = !form.sin_codigo_barras;
            handleChange({ 
              target: { 
                name: 'sin_codigo_barras', 
                type: 'checkbox', 
                checked: newValue 
              } 
            });
          }}
        >
          <input
            type="checkbox"
            id="sin_codigo_barras"
            name="sin_codigo_barras"
            checked={form.sin_codigo_barras}
            onChange={handleChange}
            className="admin-inv-form-checkbox"
            onClick={(e) => e.stopPropagation()}
          />
          <label 
            htmlFor="sin_codigo_barras" 
            className="admin-inv-checkbox-label"
            onClick={(e) => e.preventDefault()}
          >
            <span className="admin-inv-checkbox-label-icon">📝</span>
            <div className="admin-inv-checkbox-label-text">
              <strong>Inventario sin código de barras (Modo Mixto)</strong>
              <span className="admin-inv-checkbox-info">
                Habilita búsqueda por descripción como método principal + escaneo opcional para códigos existentes
              </span>
            </div>
          </label>
        </div>

        <div className="admin-inv-form-group">
          <label className="admin-inv-form-label"><FaFileExcel /> Adjuntar Formato Excel</label>
          <input 
            type="file" 
            name="excelFile" 
            accept=".xlsx, .xls" 
            onChange={handleChange} 
            required 
            className="admin-inv-form-file" 
          />
        </div>
        
        <button type="submit" className="admin-inv-form-button" disabled={loading}>
          {loading ? (
            <>
              <FaSpinner className="admin-inv-spinner" /> Cargando...
            </>
          ) : (
            "Iniciar Inventario"
          )}
        </button>
      </form>
    </motion.div>
  );

  return (
    <div className="admin-inv-main-container">
      <motion.div
        initial={{ x: -250 }}
        animate={{ x: 0 }}
        transition={{ duration: 0.5 }}
        className="admin-inv-sidebar"
      >
        <div className="admin-inv-sidebar-header">
          <img src="/mkicono.webp" alt="Logo de la Empresa" className="admin-inv-logo" />
          <h2 className="admin-inv-sidebar-title">Panel Admin</h2>
        </div>
        <nav className="admin-inv-sidebar-nav">
          <button
            onClick={() => setVista("formulario")}
            className={`admin-inv-sidebar-button ${vista === "formulario" ? "admin-inv-sidebar-button-active" : ""}`}
          >
            <FaClipboard /> Crear Inventario  Cíclico
          </button>
          <button
            onClick={() => setVista("iniciar_inventario")}
            className={`admin-inv-sidebar-button ${vista === "iniciar_inventario" ? "admin-inv-sidebar-button-active" : ""}`}
          >
            <FaPlay /> Crear Inventario de Carnes o Fruver
          </button>
          <button
            onClick={() => setVista("activos")}
            className={`admin-inv-sidebar-button ${vista === "activos" || vista === "listos_para_finalizar" ? "admin-inv-sidebar-button-active" : ""}`}
          >
            <FaChartLine /> Inventarios Activos (Cíclico)
          </button>
          <button
            onClick={() => setVista("carga_maestra")}
            className={`admin-inv-sidebar-button ${vista === "carga_maestra" ? "admin-inv-sidebar-button-active" : ""}`}
          >
            <FaDatabase /> Cargar BD Maestra
          </button>
           <button
                      onClick={() => setVista("dashboard")}
                      className={`admin-inv-sidebar-button ${
                        vista === "dashboard" ? "admin-inv-sidebar-button-active" : ""
                      }`}
                    >
                      <FaChartPie /> Tabla de Control
                    </button>
          <div className="admin-inv-sidebar-folder">
            <button
              onClick={toggleFinalizados}
              className={`admin-inv-sidebar-button ${vista.includes("finalizados") ? "admin-inv-sidebar-button-active" : ""}`}
            >
              <span className="admin-inv-sidebar-folder-icon">
                {isFinalizadosOpen ? <FaFolderOpen /> : <FaFolder />}
              </span>
              Inventarios Zonas Finalizados a revisar (Cíclico)
            </button>
            <AnimatePresence>
              {isFinalizadosOpen && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.3 }}
                  className="admin-inv-sidebar-submenu"
                >
                  <button
                    onClick={() => setVista("finalizados_pendientes")}
                    className={`admin-inv-sidebar-button admin-inv-sidebar-subbutton ${vista === "finalizados_pendientes" ? "admin-inv-sidebar-button-active" : ""}`}
                  >
                    <FaFileContract /> Pendientes
                  </button>
                  <button
                    onClick={() => setVista("finalizados_aprobados")}
                    className={`admin-inv-sidebar-button admin-inv-sidebar-subbutton ${vista === "finalizados_aprobados" ? "admin-inv-sidebar-button-active" : ""}`}
                  >
                    <FaCheckCircle /> Aprobados
                  </button>
                  <button
                    onClick={() => setVista("finalizados_rechazados")}
                    className={`admin-inv-sidebar-button admin-inv-sidebar-subbutton ${vista === "finalizados_rechazados" ? "admin-inv-sidebar-button-active" : ""}`}
                  >
                    <FaTimesCircle /> Rechazados
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </nav>
      </motion.div>

      <div className="admin-inv-content">
        <motion.h1
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5 }}
          className="admin-inv-main-title"
        >
          Administrador de Inventario
        </motion.h1>

        <AnimatePresence mode="wait">
          {(vista === "activos" || vista === "listos_para_finalizar") && (
            <InventariosActivos
              key="activos"
              user={user}
              vista={vista}
              setLoading={setLoading}
            />
          )}

          {vista === "carga_maestra" && <CargaMaestra key="carga" />}

          {vista === "formulario" && renderVistaFormulario()}

          {vista === "iniciar_inventario" && (
            <motion.div
              key="iniciar"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.5 }}
            >
              <IniciarInventario />
            </motion.div>
          )}

          {vista === "formulario" && excelData.length > 0 && (
            <motion.div
              key="excel-preview"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.5 }}
              className="admin-inv-excel-preview"
            >
              <h3 className="admin-inv-subsection-title">Vista previa del Excel cargado</h3>
              <div className="admin-inv-table-wrapper">
                <table className="admin-inv-table">
                  <thead>
                    <tr>
                      {excelHeaders.map((header, idx) => (
                        <th key={`${header || 'header'}-${idx}`} className="admin-inv-table-header">{header}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {excelData.slice(0, 10).map((row, idx) => (
                      <tr key={`row-${idx}`}>
                        {excelHeaders.map((_, colIdx) => (
                          <td key={`cell-${colIdx}`} className="admin-inv-table-cell">{row[colIdx] ?? "-"}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {excelData.length > 10 && (
                  <p className="admin-inv-excel-note">Mostrando las primeras 10 filas. Total: {excelData.length} filas.</p>
                )}
              </div>
            </motion.div>
          )}

           {/* NUEVA VISTA: Dashboard */}
                    {vista === "dashboard" && (
                      <motion.div
                        key="dashboard"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        transition={{ duration: 0.5 }}
                      >
                        <DashboardInventario />
                      </motion.div>
                    )}
          

          {vista.includes("finalizados") && (
            <InventariosFinalizados
              key="finalizados-view"
              user={user}
              vista={vista}
              setLoading={setLoading}
            />
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

const AdministradorInventario = () => {
  return (
    <SnackbarProvider 
      maxSnack={3}
      anchorOrigin={{
        vertical: 'top',
        horizontal: 'center',
      }}
      autoHideDuration={4000}
      preventDuplicate={true}
    >
      <AdministradorInventarioContent />
    </SnackbarProvider>
  );
};

export default AdministradorInventario;
