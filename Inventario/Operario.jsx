import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { CarneoFruverScanner } from "./CarnesYfruver";
import { ScannerInventario } from "./ScannerInventario";
import { ReconteoDiferencias } from "./ReconteoDiferencias"; // <-- 1. IMPORTACIÓN

import "./Operario.css";
import { Scan, Box, Warehouse, CheckCircle, XCircle, FileSpreadsheet, FileText, History } from "lucide-react";
import { useSnackbar } from 'notistack';
import * as XLSX from "xlsx";
import Modal from "react-modal";

// Vincula el modal al elemento raíz de tu app para accesibilidad
// Modal.setAppElement('#root');
Modal.setAppElement(document.body);

function CarnesFruverForm({ onBackgroundChange }) {
  const { enqueueSnackbar } = useSnackbar();
  const [bodega, setBodega] = useState("");
  const [inventariosCarnes, setInventariosCarnes] = useState([]);
  const [selectedInventarioId, setSelectedInventarioId] = useState("");
  const [descripcionZona, setDescripcionZona] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("");
  const [zonaActivaId, setZonaActivaId] = useState(null);
  const [inventarioActivo, setInventarioActivo] = useState(null);
  const [mostrarScanner, setMostrarScanner] = useState(false);
  const [downloadHistory, setDownloadHistory] = useState([]);
  const [filterStartDate, setFilterStartDate] = useState("");
  const [filterEndDate, setFilterEndDate] = useState("");
  const [filteredHistory, setFilteredHistory] = useState([]);
  
  // ✅ NUEVO: Estado para ubicación (Punto de Venta o Bodega)
  const [ubicacionActual, setUbicacionActual] = useState("punto_venta");

  // Estado para controlar el modal
  const [isModalOpen, setIsModalOpen] = useState(false);

  const navigate = useNavigate();

  // Funciones para controlar el modal
  function openModal() {
    setIsModalOpen(true);
  }

  function closeModal() {
    setIsModalOpen(false);
  }

  const updateBackgroundBasedOnInventory = (inventoryDetails) => {
    if (inventoryDetails && inventoryDetails.tipo_inventario) {
      const type = inventoryDetails.tipo_inventario.toLowerCase();
      if (type.includes("fruver")) {
        onBackgroundChange("fruver");
      } else if (type.includes("carnes")) {
        onBackgroundChange("carnes");
      } else {
        onBackgroundChange(null);
      }
    } else {
      onBackgroundChange(null);
    }
  };

  // Consulta historial solo los últimos 10 registros
  const fetchHistory = async () => {
    const operarioEmail = localStorage.getItem("correo_empleado");
    const url = `https://backend-inventario.vercel.app/api/carnesyfruver/historial-descargas/${operarioEmail}`;
    const resHistory = await fetch(url);
    const dataHistory = await resHistory.json();
    if (dataHistory.success) {
      // Solo los últimos 10 registros
      const last10 = (dataHistory.historial || []).slice(0, 10);
      setDownloadHistory(last10);
      setFilteredHistory(last10);
    } else {
      enqueueSnackbar("Error al cargar historial de descargas: " + dataHistory.message, { variant: 'error' });
      setDownloadHistory([]);
      setFilteredHistory([]);
    }
  };

  useEffect(() => {
    const checkActiveInventory = async () => {
      setMessage("Verificando inventario activo...");
      setMessageType("");
      setLoading(true);

      try {
        const operarioEmail = localStorage.getItem("correo_empleado");
        if (!operarioEmail) {
          setMessage("Error: No se encontró el email del operario en localStorage.");
          setMessageType("error");
          setLoading(false);
          return;
        }

        const response = await fetch(
          `https://backend-inventario.vercel.app/api/carnesyfruver/zona-activa/${operarioEmail}`
        );
        const data = await response.json();

        if (data.success && data.zonaActiva) {
          const zonaActiva = data.zonaActiva;
          const activeInventoryDetails = {
            id: zonaActiva.inventario_id,
            tipo_inventario: zonaActiva.tipo_inventario || "CARNES/FRUVER",
          };
          setInventarioActivo(activeInventoryDetails);
          setZonaActivaId(zonaActiva.id);
          setBodega(zonaActiva.bodega || "");
          setMessage("✅ Inventario activo encontrado. Continúa con el conteo.");
          setMessageType("success");
          setMostrarScanner(true);
          updateBackgroundBasedOnInventory(activeInventoryDetails);
        } else {
          const resInventarios = await fetch(
            "https://backend-inventario.vercel.app/api/carnesyfruver/inventarios-carnesYfruver?estado=activo"
          );
          const dataInventarios = await resInventarios.json();

          if (dataInventarios.success) {
            setInventariosCarnes(dataInventarios.inventarios || []);
            setMessage(
              dataInventarios.inventarios && dataInventarios.inventarios.length > 0
                ? "Selecciona un inventario para comenzar tu conteo."
                : "No hay inventarios de carnes/fruver activos."
            );
            setMessageType("");
          } else {
            setMessage(`Error al cargar la lista de inventarios: ${dataInventarios.message || "Error desconocido"}`);
            setMessageType("error");
          }
          onBackgroundChange(null);
        }

        await fetchHistory();
      } catch (err) {
        setMessage(`Error de red: ${err.message}`);
        setMessageType("error");
        onBackgroundChange(null);
      } finally {
        setLoading(false);
      }
    };

    checkActiveInventory();
  }, [onBackgroundChange]);

  const handleInventarioChange = (e) => {
    const newSelectedId = e.target.value;
    setSelectedInventarioId(newSelectedId);
    const selectedInv = inventariosCarnes.find((inv) => String(inv.id) === newSelectedId);
    updateBackgroundBasedOnInventory(selectedInv);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage("Creando sesión de zona...");
    setMessageType("");

    try {
      if (!selectedInventarioId || !bodega || !descripcionZona) {
        throw new Error("Por favor, completa todos los campos.");
      }
      const operarioEmail = localStorage.getItem("correo_empleado");
      if (!operarioEmail) {
        throw new Error("No se encontró el email del operario en localStorage.");
      }

      const formData = new FormData();
      formData.append("inventario_id", selectedInventarioId);
      formData.append("descripcion_zona", descripcionZona);
      formData.append("operario_email", operarioEmail);
      formData.append("bodega", bodega);

      const resZona = await fetch(
        "https://backend-inventario.vercel.app/api/carnesyfruver/iniciar-inventarioCarnesYfruver",
        {
          method: "POST",
          body: formData,
        }
      );

      const dataZona = await resZona.json();

      if (!resZona.ok) {
        throw new Error(dataZona.message || "Error al crear la zona.");
      }

      setInventarioActivo({
        id: dataZona.data.inventario_id,
        tipo_inventario: dataZona.data.tipo_inventario,
      });
      setZonaActivaId(dataZona.zonaId);
      setMessage("✅ Zona creada exitosamente.");
      setMessageType("success");
      setMostrarScanner(true);
      updateBackgroundBasedOnInventory({ tipo_inventario: dataZona.data.tipo_inventario });
    } catch (error) {
      setMessage(`❌ Error: ${error.message}`);
      setMessageType("error");
      onBackgroundChange(null);
    } finally {
      setLoading(false);
    }
  };

  const descargarExcel = (historial, consecutivo, bodega) => {
    if (!historial || historial.length === 0) {
      enqueueSnackbar("No hay datos para exportar a Excel.", { variant: 'error' });
      return;
    }
    const registrosAgrupados = historial.reduce((acc, registro) => {
      const itemId = registro.producto.item_id;
      const cantidad = registro.cantidad;
      if (acc[itemId]) {
        acc[itemId].CANT_11ENT_PUNTO_4DECIMALES += cantidad;
      } else {
        acc[itemId] = {
          NRO_INVENTARIO_BODEGA: consecutivo,
          ITEM: itemId,
          BODEGA: bodega || "N/A",
          CANT_11ENT_PUNTO_4DECIMALES: cantidad,
        };
      }
      return acc;
    }, {});
    const datosExcel = Object.values(registrosAgrupados);
    const worksheet = XLSX.utils.json_to_sheet(datosExcel);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Físico");
    worksheet["!cols"] = [{ wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 }];
    XLSX.writeFile(workbook, `Inventario_${consecutivo}_${new Date().toISOString().split("T")[0]}.xlsx`);
  };

  const descargarTxt = (historial, consecutivo, bodega) => {
    if (!historial || historial.length === 0) {
      enqueueSnackbar("No hay datos para exportar a TXT.", { variant: 'error' });
      return;
    }
    const registrosAgrupados = historial.reduce((acc, registro) => {
      const itemId = registro.producto.item_id;
      const cantidad = parseFloat(registro.cantidad) || 0;
      if (acc[itemId]) {
        acc[itemId].cantidad += cantidad;
      } else {
        acc[itemId] = {
          item_id: itemId,
          bodega: bodega || "N/A",
          cantidad: cantidad,
        };
      }
      return acc;
    }, {});
    const lines = ["000000100000001001"];
    let lineNumber = 2;
    Object.values(registrosAgrupados).forEach((registro) => {
      if (registro.cantidad > 0) {
        const num = parseFloat(registro.cantidad) || 0;
        let quantityString = (num % 1 === 0) ? `${num}.` : `${num}`;
        const paddedQuantity = quantityString.padStart(16, "0");
        const line = `${lineNumber.toString().padStart(7, "0")}04120001001${(consecutivo || "").toString().padStart(8, "0")}${(registro.item_id || "").toString().padStart(7, "0")}${" ".repeat(48)}${(registro.bodega || "").toString().padEnd(5, " ")}${" ".repeat(25)}00000000000000000000.000000000000000.${paddedQuantity}000000000000000.000000000000000.000000000000000.0000`;
        lines.push(line);
        lineNumber++;
      }
    });
    lines.push(`${lineNumber.toString().padStart(7, "0")}99990001001`);
    const blob = new Blob([lines.join("\r\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `inventarios@merkahorrosas.com.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadExcel = async (item) => {
    try {
      setLoading(true);
      const res = await fetch(`https://backend-inventario.vercel.app/api/carnesyfruver/productos-zona/${item.id}`);
      const data = await res.json();
      if (data.success && data.productos) {
        const historialData = data.productos.map((p) => ({
          producto: { item_id: p.item_id },
          cantidad: p.cantidad,
        }));
        descargarExcel(historialData, item.consecutivo, item.bodega);
      } else {
        enqueueSnackbar("Error al obtener datos para descarga: " + data.message, { variant: 'error' });
      }
    } catch (err) {
      enqueueSnackbar(`Error de red: ${err.message}`, { variant: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadTxt = async (item) => {
    try {
      setLoading(true);
      const res = await fetch(`https://backend-inventario.vercel.app/api/carnesyfruver/productos-zona/${item.id}`);
      const data = await res.json();
      if (data.success && data.productos) {
        const historialData = data.productos.map((p) => ({
          producto: { item_id: p.item_id },
          cantidad: p.cantidad,
        }));
        descargarTxt(historialData, item.consecutivo, item.bodega);
      } else {
        enqueueSnackbar("Error al obtener datos para descarga: " + data.message, { variant: 'error' });
      }
    } catch (err) {
      enqueueSnackbar(`Error de red: ${err.message}`, { variant: 'error' });
    } finally {
      setLoading(false);
    }
  };

  if (mostrarScanner && inventarioActivo && zonaActivaId) {
    return (
      <div>
        {/* ✅ NUEVO: Selector de Ubicación visible durante el escaneo */}
        <div style={{
          padding: '15px',
          backgroundColor: '#e8f5e9',
          border: '2px solid #4caf50',
          borderRadius: '8px',
          marginBottom: '15px',
          textAlign: 'center'
        }}>
          <label htmlFor="ubicacion-carnes-selector" style={{
            display: 'block',
            fontSize: '16px',
            fontWeight: 'bold',
            marginBottom: '10px',
            color: '#2e7d32'
          }}>
            📍 Ubicación del Conteo:
          </label>
          <select
            id="ubicacion-carnes-selector"
            value={ubicacionActual}
            onChange={(e) => {
              setUbicacionActual(e.target.value);
              enqueueSnackbar(`Ubicación cambiada a: ${e.target.value === 'punto_venta' ? 'Punto de Venta' : 'Bodega'}`, { variant: 'success' });
            }}
            style={{
              padding: '12px',
              fontSize: '16px',
              fontWeight: 'bold',
              borderRadius: '8px',
              border: '2px solid #4caf50',
              width: '100%',
              maxWidth: '300px',
              cursor: 'pointer',
              backgroundColor: 'white'
            }}
            disabled={loading}
          >
            <option value="punto_venta">🏪 Punto de Venta</option>
            <option value="bodega">📦 Bodega</option>
          </select>
          <p style={{ fontSize: '12px', color: '#666', marginTop: '8px' }}>
            Puedes cambiar la ubicación en cualquier momento durante el conteo
          </p>
        </div>
        
        <CarneoFruverScanner
          zonaId={zonaActivaId}
          inventarioId={inventarioActivo.id}
          user={{ email: localStorage.getItem("correo_empleado") }}
          itemsPermitidos={new Set()}
          consecutivo={inventarioActivo.id}
          bodega={bodega}
          ubicacion={ubicacionActual}
          setTotalEscaneados={() => { }}
          finalizarZona={() => {
            setMostrarScanner(false);
            setZonaActivaId(null);
            setInventarioActivo(null);
            setBodega("");
            setDescripcionZona("");
            setUbicacionActual("punto_venta"); // ✅ Resetear ubicación
            setMessage("Zona finalizada. Selecciona un nuevo inventario para continuar.");
            setMessageType("");
            onBackgroundChange(null);
            const operarioEmail = localStorage.getItem("correo_empleado");
            fetch(`https://backend-inventario.vercel.app/api/carnesyfruver/historial-descargas/${operarioEmail}`)
              .then((res) => res.json())
              .then((data) => {
                if (data.success) {
                  setDownloadHistory(data.historial || []);
                }
              });
          }}
          setLoading={setLoading}
          loading={loading}
        />
      </div>
    );
  }

  // Filtrar historial por rango de fechas en frontend
  const handleFilterHistory = () => {
    if (!filterStartDate && !filterEndDate) {
      setFilteredHistory(downloadHistory);
      return;
    }
    const start = filterStartDate ? new Date(filterStartDate) : null;
    const end = filterEndDate ? new Date(filterEndDate) : null;
    const filtered = downloadHistory.filter(item => {
      const fecha = new Date(item.actualizada_en);
      if (start && end) {
        return fecha >= start && fecha <= end;
      }
      if (start) {
        return fecha >= start;
      }
      if (end) {
        return fecha <= end;
      }
      return true;
    });
    setFilteredHistory(filtered);
  };

  // Botón para limpiar el filtro
  const handleClearFilter = () => {
    setFilterStartDate("");
    setFilterEndDate("");
    setFilteredHistory(downloadHistory);
  };

  return (
    <div className="inv-op-unique-form-container">
      <form onSubmit={handleSubmit}>
        <h2 className="inv-op-unique-form-title">Iniciar Conteo</h2>

        <div className="inv-op-unique-form-group">
          <label htmlFor="inventory-select" className="inv-op-unique-form-label">
            Seleccionar Inventario
          </label>
          <select id="inventory-select" value={selectedInventarioId} onChange={handleInventarioChange} className="inv-op-unique-form-select" required>
            <option value="" disabled>
              {inventariosCarnes.length > 0 ? "Selecciona un Inventario..." : "No hay inventarios activos"}
            </option>
            {inventariosCarnes.filter((inv) => inv.id).map((inv) => (
              <option key={inv.id} value={inv.id}>
                {`${inv.tipo_inventario?.toUpperCase?.() || "INVENTARIO"} (${inv.categoria}, ID: ${inv.id}, Creado: ${new Date(inv.created_at).toLocaleDateString()})`}
              </option>
            ))}
          </select>
        </div>

        <div className="inv-op-unique-form-group">
          <label htmlFor="bodega-select" className="inv-op-unique-form-label">
            Seleccionar Bodega
          </label>
          <select id="bodega-select" value={bodega} onChange={(e) => setBodega(e.target.value)} required className="inv-op-unique-form-select" disabled={!selectedInventarioId}>
            <option value="" disabled>Selecciona una bodega...</option>
            <option value="PV001">PV001-Copacabana Plaza</option>
            <option value="00201">00201-Villa Hermosa</option>
            <option value="00301">00301-Girardota Parque</option>
            <option value="00401">00401-Girardota Llano</option>
            <option value="00501">00501-Carnes Barbosa</option>
            <option value="00601">00601-Vegas</option>
            <option value="00701">00701-Barbosa Supermercado</option>
            <option value="00801">00801-San Juan</option>
          </select>
        </div>

        <div className="inv-op-unique-form-group">
          <label htmlFor="zone-description" className="inv-op-unique-form-label">
            Descripción de la Zona
          </label>
          <textarea id="zone-description" placeholder="Ej. Pasillo 5, Sección Congelados" value={descripcionZona} onChange={(e) => setDescripcionZona(e.target.value)} className="inv-op-unique-form-textarea" required disabled={!bodega} />
        </div>

        <button type="submit" className="inv-op-unique-submit-button" disabled={!bodega || !descripcionZona || !selectedInventarioId || loading}>
          <Scan size={20} /> Iniciar Conteo de Zona
        </button>

        {message && (
          <p className={`inv-op-unique-status-message ${messageType}`}>
            {messageType === "success" && <CheckCircle size={16} />}
            {messageType === "error" && <XCircle size={16} />}
            {message}
          </p>
        )}
      </form>

      <div className="history-toggle-container">
        <button type="button" className="history-toggle-button" onClick={openModal}>
          <History size={20} /> Ver Historial de Zonas Finalizadas
        </button>
      </div>

      {/* Modal original */}
      <Modal
        isOpen={isModalOpen}
        onRequestClose={closeModal}
        contentLabel="Historial de Zonas Finalizadas"
      >
        <div className="modal-header">
          <h3 className="modal-title">Historial de Zonas Finalizadas</h3>
          <button onClick={closeModal} className="modal-close-btn">&times;</button>
        </div>
        <div className="modal-body">
          <p style={{color: 'gray', fontSize: '14px'}}>
            Total registros: {filteredHistory.length}
          </p>
          {/* Filtro por rango de fechas - mejor diseño */}
          <div className="history-filter-bar">
            <div className="filter-group">
              <label htmlFor="filterStartDate" className="filter-label">
                <span role="img" aria-label="Desde" style={{marginRight: 4}}>📅</span>Desde
              </label>
              <input
                type="date"
                id="filterStartDate"
                className="filter-input"
                value={filterStartDate}
                onChange={e => setFilterStartDate(e.target.value)}
              />
            </div>
            <div className="filter-group">
              <label htmlFor="filterEndDate" className="filter-label">
                <span role="img" aria-label="Hasta" style={{marginRight: 4}}>📅</span>Hasta
              </label>
              <input
                type="date"
                id="filterEndDate"
                className="filter-input"
                value={filterEndDate}
                onChange={e => setFilterEndDate(e.target.value)}
              />
            </div>
            <button
              type="button"
              className="filter-btn"
              onClick={handleFilterHistory}
            >
              Filtrar
            </button>
            <button
              type="button"
              className="filter-btn clear-btn"
              style={{background: "#e9ecef", color: "#28a745", marginLeft: 8}}
              onClick={handleClearFilter}
            >
              Limpiar
            </button>
          </div>
          {/* Renderiza la lista de historial filtrado */}
          {filteredHistory.length > 0 ? (
            <ul className="history-list">
              {filteredHistory.map((item) => (
                <li key={item.id} className="history-item">
                  <div className="history-item-info">
                    <p className="info-line zone-description">{item.descripcion_zona}</p>
                    <p className="info-line">
                      <strong>Consecutivo:</strong> {item.consecutivo} | <strong>Bodega:</strong> {item.bodega}
                    </p>
                    <p className="info-line timestamp">
                      <strong>Finalizada:</strong> {new Date(item.actualizada_en).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' })}
                    </p>
                  </div>
                  <div className="history-item-buttons">
                    <button onClick={() => handleDownloadExcel(item)} className="download-btn excel-btn" disabled={loading}>
                      <FileSpreadsheet size={16} /> Excel
                    </button>
                    <button onClick={() => handleDownloadTxt(item)} className="download-btn txt-btn" disabled={loading}>
                      <FileText size={16} /> TXT
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="history-empty">No hay zonas finalizadas en este rango.</p>
          )}
        </div>
      </Modal>

      {loading && (
        <div className="inv-op-unique-loading-overlay">
          <div className="inv-op-unique-loading-spinner"></div>
        </div>
      )}
    </div>
  );
}

function OperarioPadre() {
  const [opcion, setOpcion] = useState(null);
  const [backgroundType, setBackgroundType] = useState(null);
  const navigate = useNavigate();

  const handleGeneralClick = () => {
    setOpcion("ciclico"); // Renderiza ScannerInventario
    setBackgroundType(null);
  };

  return (
    <div className={`inv-op-unique-container ${backgroundType ? `${backgroundType}-bg` : ''}`}>
      {!opcion && (
        <div className="inv-op-unique-options-section">
          <h2 className="inv-op-unique-options-title">
            Selecciona una opción para comenzar tu inventario
          </h2>
          <div className="inv-op-unique-card-list">
            {/* Tarjeta de Inventario Cíclico */}
            <div className="inv-op-unique-card cyclical" onClick={handleGeneralClick}>
              <div className="card-icon-wrapper">
                <Box size={36} className="card-icon" />
              </div>
              <div className="card-info">
                <h3 className="card-title">Inventario Cíclico</h3>
                <p className="card-description">
                  Conteo de productos por pasillos o bodegas.
                </p>
              </div>
            </div>

            {/* Tarjeta de Inventario Carnes o Fruver */}
            <div
              className="inv-op-unique-card carnes-fruver"
              onClick={() => {
                setOpcion("carnes");
                setBackgroundType(null);
              }}
            >
              <div className="card-icon-wrapper">
                <Warehouse size={36} className="card-icon" />
              </div>
              <div className="card-info">
                <h3 className="card-title">Inventario Carnes o Fruver</h3>
                <p className="card-description">
                  Inventario especializado para productos perecederos.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
      {opcion === "carnes" && (
        <CarnesFruverForm
          onBackgroundChange={setBackgroundType}
          inventoryType="carnes"
        />
      )}
      {opcion === "ciclico" && (
        <ScannerInventario
          onBackgroundChange={setBackgroundType}
          inventoryType="ciclico"
          setParentOpcion={setOpcion}
        />
      )}
      {/* ... Renderiza el nuevo módulo de Re-conteo ... */}
      {opcion === "recontar" && (
        <ReconteoDiferencias // <-- 2. RENDERIZADO
            onBackgroundChange={setBackgroundType}
            onBack={() => setOpcion(null)}
        />
      )}
    </div>
  );
}

export default OperarioPadre;