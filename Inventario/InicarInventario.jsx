import React, { useState, useEffect, useCallback } from "react";
import Swal from "sweetalert2";
import "./IniciarInventario.css"; // Archivo CSS para IniciarInventario
import { ChevronDown, Power, XCircle } from "lucide-react"; // Importamos XCircle para cerrar el modal
import { useSnackbar } from 'notistack';
import ExportCarnesYfruver from "./ExportCarnesYfruver";

const IniciarInventario = ({ onInventarioIniciado }) => {
  const { enqueueSnackbar } = useSnackbar();
  // --- Estados del Componente ---
  const [tipoInventario, setTipoInventario] = useState("");
  const [fecha, setFecha] = useState(new Date().toISOString().split("T")[0]);
  const [categoria, setCategoria] = useState("");
  const [gruposDisponibles, setGruposDisponibles] = useState([]);
  const [inventariosAgrupados, setInventariosAgrupados] = useState({});
  const [loading, setLoading] = useState(false);
  const [loadingRegistros, setLoadingRegistros] = useState(true);
  const [errorRegistros, setErrorRegistros] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [expandedSections, setExpandedSections] = useState({});
  // Nuevos estados para el modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalContent, setModalContent] = useState(null);
  const [modalTitle, setModalTitle] = useState("");
  // New state for export modal
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);

  // --- Función para mostrar mensajes de estado (usando notistack) ---
  const showStatusMessage = useCallback((msg, type) => {
    if (type === "success") {
      enqueueSnackbar(msg, { variant: 'success' });
    } else if (type === "error") {
      enqueueSnackbar(msg, { variant: 'error' });
    } else {
      enqueueSnackbar(msg, { variant: 'info' });
    }
  }, [enqueueSnackbar]);

  // --- Función para recargar los datos del historial de inventarios ---
  const reloadInventarioData = useCallback(async () => {
    setRefreshKey(prev => prev + 1);
  }, []);

  // --- useEffect para cargar grupos maestros ---
  useEffect(() => {
    const fetchGrupos = async () => {
      try {
        const res = await fetch(
          "https://backend-inventario.vercel.app/api/maestro/grupos-maestros"
        );
        if (!res.ok)
          throw new Error("La respuesta del servidor para grupos no fue OK.");
        const data = await res.json();
        if (data.success && Array.isArray(data.grupos)) {
          setGruposDisponibles(data.grupos);
        } else {
          showStatusMessage("Error al cargar grupos maestros.", "error");
        }
      } catch (err) {
        setGruposDisponibles([]);
        showStatusMessage(
          `Error de red al cargar grupos: ${err.message}`,
          "error"
        );
      }
    };
    fetchGrupos();
  }, [showStatusMessage]);

  // --- useEffect para cargar el historial de inventarios ---
  useEffect(() => {
    const fetchRegistros = async () => {
      setLoadingRegistros(true);
      setErrorRegistros(null);
      try {
        const response = await fetch(
          "https://backend-inventario.vercel.app/api/carnesyfruver/consultar",
          {
            method: "GET",
            headers: { "Content-Type": "application/json" },
          }
        );

        if (!response.ok) {
          throw new Error(`Error ${response.status}: ${response.statusText}`);
        }

        const result = await response.json();
        if (!result.success) {
          throw new Error(result.message || "Error al consultar inventarios.");
        }

        // Agrupar por inventario_id y luego por fecha de registro
        const grouped = (result.data || []).reduce((acc, inv) => {
          const inventario_id =
            inv.inventario_id || `inv_${inv.id || Math.random()}`;
          const categoria = inv.categoria || "Sin Categoría";
          const created_at = inv.created_at
            ? new Date(inv.created_at).toISOString().split("T")[0]
            : "Sin Fecha";
          const estado = inv.estado || "activo";

          if (!acc[inventario_id]) {
            acc[inventario_id] = {
              categoria,
              estado,
              created_at,
              dates: {},
              id: inventario_id,
            };
          }

          (inv.registros || []).forEach((reg) => {
            const date = reg.fecha_registro
              ? new Date(reg.fecha_registro).toISOString().split("T")[0]
              : created_at;
            if (!acc[inventario_id].dates[date]) {
              acc[inventario_id].dates[date] = [];
            }
            acc[inventario_id].dates[date].push(reg);
          });

          if (!Object.keys(acc[inventario_id].dates).length) {
            acc[inventario_id].dates[created_at] = [];
          }

          return acc;
        }, {});

        setInventariosAgrupados(grouped);

        const initialExpandedState = {};
        for (const inv_id in grouped) {
          initialExpandedState[inv_id] = { isOpen: false };
          for (const dt in grouped[inv_id].dates) {
            initialExpandedState[inv_id][dt] = false;
          }
        }
        setExpandedSections(initialExpandedState);
      } catch (err) {
        setErrorRegistros(err.message);
        showStatusMessage(
          `Error al cargar inventarios: ${err.message}`,
          "error"
        );
      } finally {
        setLoadingRegistros(false);
      }
    };

    fetchRegistros();
  }, [refreshKey, showStatusMessage]);

  // --- Manejadores de Eventos ---

  const handleIniciarInventario = async () => {
    if (!tipoInventario || !categoria) {
      showStatusMessage(
        "Por favor, selecciona un tipo de inventario y una categoría.",
        "error"
      );
      return;
    }

    setLoading(true);
    try {
      const formData = new FormData();
      formData.append("tipo_inventario", tipoInventario);
      formData.append("fecha", fecha);
      formData.append("categoria", categoria);

      const res = await fetch(
        "https://backend-inventario.vercel.app/api/carnesyfruver/crear-inventario-carnesYfruver",
        {
          method: "POST",
          body: formData,
        }
      );
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || "Error al crear el inventario.");
      }

      showStatusMessage("Inventario creado correctamente.", "success");
      setTipoInventario("");
      setCategoria("");
      setRefreshKey((prev) => prev + 1);
      if (onInventarioIniciado) onInventarioIniciado();
    } catch (err) {
      showStatusMessage(`Error: ${err.message}`, "error");
    } finally {
      setLoading(false);
    }
  };

  const handleDesactivarInventario = async (inventario_id) => {
    const result = await Swal.fire({
      title: "¿Estás seguro?",
      text: `Estás a punto de desactivar el inventario con ID ${inventario_id}. Este inventario no podrá usarse para nuevos registros.`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#d33",
      cancelButtonColor: "#6c757d",
      confirmButtonText: "Sí, desactivar",
      cancelButtonText: "Cancelar",
      reverseButtons: true,
    });

    if (result.isConfirmed) {
      setLoading(true);
      try {
        const response = await fetch(
          `https://backend-inventario.vercel.app/api/carnesyfruver/actualizar-estado-inventario/${inventario_id}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ estado: "inactivo" }),
          }
        );
        const data = await response.json();
        if (!response.ok)
          throw new Error(data.message || "Error al desactivar el inventario.");

        showStatusMessage(
          `Inventario con ID ${inventario_id} desactivado correctamente.`,
          "success"
        );
        setRefreshKey((prev) => prev + 1);
      } catch (err) {
        showStatusMessage(
          `Error al desactivar el inventario: ${err.message}`,
          "error"
        );
      } finally {
        setLoading(false);
      }
    }
  };

  const toggleExpanded = useCallback((type, key1, key2 = null) => {
    setExpandedSections((prev) => {
      const newState = { ...prev };
      if (type === "inventario") {
        newState[key1] = { ...(newState[key1] || {}) };
        newState[key1].isOpen = !newState[key1]?.isOpen;
      } else if (type === "date" && key1 && key2) {
        // Toggle the expansion state for the date
        newState[key1] = { ...(newState[key1] || {}) };
        const isCurrentlyOpen = newState[key1][key2];
        newState[key1][key2] = !isCurrentlyOpen;

        // If it's expanding, open the modal
        if (!isCurrentlyOpen) {
          const records = inventariosAgrupados[key1]?.dates[key2] || [];
          setModalTitle(`Registros para ${key2}`);
          setModalContent(records);
          setIsModalOpen(true);
        } else { // If it's collapsing, close the modal
          setIsModalOpen(false);
        }
      }
      return newState;
    });
  }, [inventariosAgrupados]);

  const closeModal = () => {
    setIsModalOpen(false);
    setModalContent(null);
    setModalTitle("");
  };

  const closeExportModal = () => {
    setIsExportModalOpen(false);
  };

  // --- Función para formatear la cantidad a 4 decimales con coma ---
  const formatQuantity = useCallback((quantity) => {
    const num = parseFloat(quantity);
    if (isNaN(num)) {
      return "0,0000";
    }
    // Usar toLocaleString para formatear a español-Colombia
    return num.toLocaleString("es-CO", {
      minimumFractionDigits: 0, // No forzar decimales si no los hay inicialmente
      maximumFractionDigits: 4, // Máximo 4 decimales
      useGrouping: false // Importante para evitar separadores de miles no deseados
    });
  }, []);


  // --- Renderizado del Componente ---
  return (
    <div className="inv-unique-main-container">
      {/* Sección para iniciar un nuevo inventario */}
      <div className="inv-unique-form-section">
        <h2 className="inv-unique-form-title">Iniciar Nuevo Inventario</h2>
        <div className="inv-unique-form-group">
          <label className="inv-unique-form-label" htmlFor="tipoInventario">
            Tipo de Inventario:
            <select
              id="tipoInventario"
              value={tipoInventario}
              onChange={(e) => setTipoInventario(e.target.value)}
              className="inv-unique-form-select"
            >
              <option value="">-- Seleccionar --</option>
              <option value="carnes">Carnes</option>
              <option value="fruver">Fruver</option>
            </select>
          </label>
        </div>

        {tipoInventario && (
          <>
            <div className="inv-unique-form-group">
              <label className="inv-unique-form-label" htmlFor="fechaInventario">
                Fecha:
                <input
                  type="date"
                  id="fechaInventario"
                  value={fecha}
                  onChange={(e) => setFecha(e.target.value)}
                  required
                  className="inv-unique-form-input"
                />
              </label>
            </div>
            <div className="inv-unique-form-group">
              <label className="inv-unique-form-label" htmlFor="categoriaInventario">
                Categoría:
                <input
                  type="text"
                  id="categoriaInventario"
                  value={categoria}
                  onChange={(e) => setCategoria(e.target.value)}
                  list="grupos-sugerencias"
                  placeholder="Ej. CARNES, FRUVER, LÁCTEOS"
                  required
                  autoComplete="off"
                  className="inv-unique-form-input"
                />
                <datalist id="grupos-sugerencias">
                  {gruposDisponibles.map((g) => (
                    <option key={g} value={g} />
                  ))}
                </datalist>
              </label>
            </div>
          </>
        )}
        <button
          onClick={handleIniciarInventario}
          disabled={!tipoInventario || !categoria || loading}
          className={`inv-unique-submit-button ${
            !tipoInventario || !categoria || loading
              ? "inv-unique-submit-button-disabled"
              : ""
          }`}
        >
          {loading ? "Creando..." : "Iniciar Inventario"}
        </button>
      </div>

      <hr className="inv-unique-divider" />

      {/* Sección del historial de inventarios */}
      <div className="inv-unique-history-section">
        <h2 className="inv-unique-section-title">Historial de Inventarios</h2>
        {loadingRegistros && (
          <div className="inv-unique-no-data">Cargando historial de inventarios...</div>
        )}
        {errorRegistros && (
          <div className="inv-unique-error">
            Error al cargar el historial: {errorRegistros}
          </div>
        )}
        {!loadingRegistros &&
          !errorRegistros &&
          Object.keys(inventariosAgrupados).length === 0 && (
            <div className="inv-unique-no-data">
              No se encontraron inventarios registrados.
            </div>
          )}
        {!loadingRegistros &&
          !errorRegistros &&
          Object.keys(inventariosAgrupados).length > 0 && (
            <div className="inv-unique-list">
              {Object.entries(inventariosAgrupados).map(
                ([inventario_id, { categoria, estado, created_at, dates }]) => (
                  <div
                    key={inventario_id}
                    className={`inv-unique-card ${
                      estado === "inactivo" ? "inv-unique-inactive" : ""
                    }`}
                  >
                    <div
                      className="inv-unique-card-header"
                      onClick={() => toggleExpanded("inventario", inventario_id)}
                    >
                      <h3 className="inv-unique-card-title">
                        {categoria} (ID: {inventario_id})
                      </h3>
                      <div className="inv-unique-header-meta">
                        <span
                          className={`inv-unique-status-badge ${estado === "activo" ? "active" : "inactive"}`}
                        >
                          {estado === "activo" ? "Activo" : "Inactivo"}
                        </span>
                        <span className="inv-unique-created-at">
                          Creado: {new Date(created_at).toLocaleDateString()}
                        </span>
                      </div>
                      <div className="inv-unique-header-actions">
                        {estado === "activo" && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDesactivarInventario(inventario_id);
                            }}
                            className="inv-unique-action-button deactivate"
                            title="Desactivar Inventario"
                          >
                            <Power size={18} />
                          </button>
                        )}
                        <ChevronDown
                          size={20}
                          className={`inv-unique-chevron ${
                            expandedSections[inventario_id]?.isOpen ? "rotate" : ""
                          }`}
                        />
                      </div>
                    </div>
                    <div
                      className={`inv-unique-card-content ${
                        expandedSections[inventario_id]?.isOpen ? "open" : ""
                      }`}
                    >
                      {Object.entries(dates).map(([date, recordsForDate]) => (
                        <div key={date} className="inv-unique-sub-card">
                          <div
                            className="inv-unique-sub-card-header"
                            onClick={() =>
                              toggleExpanded("date", inventario_id, date)
                            }
                          >
                            <h4 className="inv-unique-sub-card-title">
                              Fecha de Registro: {date} ({recordsForDate.length} registros)
                            </h4>
                            <ChevronDown
                              size={18}
                              className={`inv-unique-chevron ${
                                expandedSections[inventario_id]?.[date] ? "rotate" : ""
                              }`}
                            />
                          </div>
                          {/* El contenido detallado ya NO se muestra aquí, se muestra en el modal */}
                          {/* <div className={`inv-unique-sub-card-content ${expandedSections[inventario_id]?.[date] ? "open" : ""}`}>
                            ... (Contenido de tabla eliminado de aquí para el modal) ...
                          </div> */}
                        </div>
                      ))}
                    </div>
                  </div>
                )
              )}
            </div>
          )}
      </div>

      <hr className="inv-unique-divider" />

      {/* New: Button to open export modal */}
      <div className="inv-unique-export-button-container">
        <button
          onClick={() => setIsExportModalOpen(true)}
          className="inv-unique-submit-button"
        >
          Abrir consecutivos        </button>
      </div>

      {/* Modal for export */}
      {isExportModalOpen && (
        <div className="inv-unique-modal-overlay" onClick={closeExportModal}>
          <div className="inv-unique-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="inv-unique-modal-header">
              <h3 className="inv-unique-modal-title">Exportar Inventarios por Consecutivo</h3>
              <button className="inv-unique-modal-close-button" onClick={closeExportModal}>
                <XCircle size={24} />
              </button>
            </div>
            <div className="inv-unique-modal-body">
              <ExportCarnesYfruver
                inventariosAgrupados={inventariosAgrupados}
                onRefreshData={reloadInventarioData}
              />
            </div>
          </div>
        </div>
      )}

      {/* Modal para mostrar los detalles de los registros por fecha */}
      {isModalOpen && (
        <div className="inv-unique-modal-overlay" onClick={closeModal}>
          <div className="inv-unique-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="inv-unique-modal-header">
              <h3 className="inv-unique-modal-title">{modalTitle}</h3>
              <button className="inv-unique-modal-close-button" onClick={closeModal}>
                <XCircle size={24} />
              </button>
            </div>
            <div className="inv-unique-modal-body">
              {modalContent && modalContent.length > 0 ? (
                <div className="inv-unique-table-wrapper">
                  <table className="inv-unique-table">
                    <thead>
                      <tr>
                        <th>Item ID</th>
                        <th>Cantidad</th>
                        <th>Fecha y Hora</th>
                        <th>Consecutivo</th>
                        <th>Operario</th>
                        <th>Bodega</th>
                        <th>Descripción</th>
                      </tr>
                    </thead>
                    <tbody>
                      {modalContent.map((registro, idx) => (
                        <tr key={idx} className="inv-unique-table-row">
                          <td>{registro.item_id}</td>
                          <td>{formatQuantity(registro.cantidad)}</td>
                          <td>
                            {new Date(registro.fecha_registro).toLocaleString("es-CO", {
                              timeZone: "America/Bogota",
                              year: "numeric",
                              month: "2-digit",
                              day: "2-digit",
                              hour: "2-digit",
                              minute: "2-digit",
                              second: "2-digit" // ¡Importante: No hay coma aquí si es el último!
                            })}
                          </td>
                          <td>{registro.consecutivo || "N/A"}</td>
                          <td>{registro.operario_email || registro.activo_operario_email || "N/A"}</td>
                          <td>{registro.bodega || "N/A"}</td>
                          <td>{registro.descripcion_zona || "N/A"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="inv-unique-no-data-small">
                  No hay registros para esta fecha.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default IniciarInventario;