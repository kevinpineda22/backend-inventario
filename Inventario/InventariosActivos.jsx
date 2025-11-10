import React, { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { FaCheckCircle, FaEye, FaTimes, FaBell, FaSpinner } from "react-icons/fa";
import { FiRefreshCw } from "react-icons/fi";
import { useSnackbar } from 'notistack';
import { supabase } from "../supabaseClient";
import Swal from "sweetalert2";
import "./InventariosActivos.css";

const InventariosActivos = ({ user, setLoading: setAppLoading }) => {
  const { enqueueSnackbar } = useSnackbar();
  const [inventariosActivos, setInventariosActivos] = useState([]);
  const [selectedInventario, setSelectedInventario] = useState(null);
  const [isZonasModalOpen, setIsZonasModalOpen] = useState(false);
  const [detallesZona, setDetallesZona] = useState([]);
  const [isDetallesModalOpen, setIsDetallesModalOpen] = useState(false);
  const [selectedZona, setSelectedZona] = useState(null);
  const [loadingDetalles, setLoadingDetalles] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false); // Estado para el botón de recarga
  // Modificado: Ahora isNotifying guarda el ID del inventario que se está notificando
  const [notifyingInventarioId, setNotifyingInventarioId] = useState(null); 

  const mostrarConComa = (valor) => {
    if (typeof valor !== 'number' && typeof valor !== 'string') return valor || '0';
    const valorNumerico = typeof valor === 'string' ? parseFloat(valor.replace(",", ".")) || 0 : valor;
    if (isNaN(valorNumerico)) return '0';
    return valorNumerico.toLocaleString('es-CO', {
      minimumFractionDigits: Number.isInteger(valorNumerico) ? 0 : 2,
      maximumFractionDigits: 2
    });
  };

  // Mapeo de estados para mostrar texto bonito
  const estadoMap = {
    en_proceso: " En proceso",
    aprobado: "Aprobado",
    pendiente: "Pendiente",
    rechazado: "Rechazado",
    asignado: "Asignado",
  };

  const fetchInventarios = useCallback(async () => {
    setIsRefreshing(true); // Activa el feedback de recarga
    try {
      const res = await fetch("https://backend-inventario.vercel.app/api/operario/inventarios-activos");
      const data = await res.json();
      if (data.success) {
        const inventariosConConteo = data.inventarios.map(inventario => ({
          ...inventario,
          inventario_zonas: (inventario.inventario_zonas || []).map(zona => ({
            ...zona,
            conteo_total: zona.detalles_inventario?.reduce((sum, d) => sum + (parseFloat(d.cantidad) || 0), 0) || 0,
          })),
        }));
        setInventariosActivos(inventariosConConteo);
      } else {
        setInventariosActivos([]);
        enqueueSnackbar("No se encontraron inventarios activos.", { variant: 'error' });
      }
    } catch (err) {
      console.error("Error fetching inventarios:", err);
      enqueueSnackbar(`Error al cargar inventarios: ${err.message}`, { variant: 'error' });
    } finally {
      setIsRefreshing(false); // Desactiva el feedback
      setAppLoading(false); // Asegúrate de que el loading general también se desactive
    }
  }, [setAppLoading, enqueueSnackbar]);

  useEffect(() => {
    setAppLoading(true);
    fetchInventarios();

    const channel = supabase
      .channel("inventarios-activos-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "inventarios" }, () => fetchInventarios())
      .on("postgres_changes", { event: "*", schema: "public", table: "detalles_inventario" }, () => fetchInventarios())
      .subscribe((status, err) => {
        if (err) {
          console.error("Fallo al suscribirse al canal:", err);
          enqueueSnackbar("Error al conectar con actualizaciones en tiempo real.", { variant: 'error' });
        }
      });

    return () => supabase.removeChannel(channel);
  }, [fetchInventarios, setAppLoading, enqueueSnackbar]);

  const handleFinalizarInventarioCompleto = async (inventarioId) => {
    const result = await Swal.fire({
      title: "¿Finalizar Inventario?",
      text: "Esta acción moverá el inventario a la lista de 'Finalizados'. ¿Estás seguro?",
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "var(--cs-secondary-color)",
      cancelButtonColor: "#e53935",
      confirmButtonText: "Sí, ¡Finalizarlo!",
      cancelButtonText: "Cancelar",
    });

    if (result.isConfirmed) {
      setAppLoading(true);
      try {
        const res = await fetch(`https://backend-inventario.vercel.app/api/admin/finalizar-inventario/${inventarioId}`, { method: "PATCH" });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || "Error en el servidor.");
        enqueueSnackbar("✅ Inventario finalizado correctamente.", { variant: 'success' });
        fetchInventarios();
      } catch (err) {
        enqueueSnackbar(`❌ Error: ${err.message}`, { variant: 'error' });
      } finally {
        setAppLoading(false);
      }
    }
  };

  const handleNotificarOperarios = async (inventario) => {
    const result = await Swal.fire({
      title: '¿Notificar a Operarios?',
      text: `Se enviará un reporte por correo a cada operario con zonas aprobadas para el inventario "${inventario.descripcion}".`,
      icon: 'info',
      showCancelButton: true,
      confirmButtonColor: '#3085d6',
      cancelButtonColor: '#d33',
      confirmButtonText: 'Sí, ¡Enviar Notificaciones!',
      cancelButtonText: 'Cancelar'
    });

    if (result.isConfirmed) {
      setNotifyingInventarioId(inventario.id); // Establece el ID del inventario que se está notificando
      try {
        const res = await fetch(`https://backend-inventario.vercel.app/api/admin/notificar-operarios/${inventario.id}`, {
          method: 'POST',
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.message || 'Error en el servidor');
        }
        enqueueSnackbar(data.message, { variant: 'success' });
        fetchInventarios(); // Vuelve a cargar los inventarios para reflejar cualquier cambio
      } catch (err) {
        const errorMessage = err.message.includes('No hay operarios') || err.message.includes('No hay productos')
          ? err.message
          : 'Error al enviar notificaciones. Verifica que haya zonas aprobadas y conteos registrados.';
        enqueueSnackbar(errorMessage, { variant: 'error' });
      } finally {
        setNotifyingInventarioId(null); // Restablece el ID a null al finalizar
      }
    }
  };

  const handleVerDetalles = async (zona) => {
    setSelectedZona(zona);
    setDetallesZona([]);
    setLoadingDetalles(true);
    setIsDetallesModalOpen(true);
    try {
      const res = await fetch(`https://backend-inventario.vercel.app/api/admin/detalles-zona/${zona.id}`);
      if (!res.ok) {
        throw new Error(`Error ${res.status}: No se pudo cargar el detalle de la zona.`);
      }
      const data = await res.json();
      if (data.success) {
        setDetallesZona(data.detalles);
      } else {
        enqueueSnackbar(data.message, { variant: 'error' });
      }
    } catch (err) {
      enqueueSnackbar(err.message, { variant: 'error' });
    } finally {
      setLoadingDetalles(false);
    }
  };

  // --- Funciones para abrir/cerrar modales (sin cambios) ---
  const openZonasModal = (inventario) => {
    setSelectedInventario(inventario);
    setIsZonasModalOpen(true);
  };
  const cerrarModalZonas = () => {
    setIsZonasModalOpen(false);
    setSelectedInventario(null);
  };
  const cerrarModalDetalles = () => {
    setIsDetallesModalOpen(false);
    setDetallesZona([]);
    setSelectedZona(null);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="ia-container"
    >
      <div className="ia-header">
        <h2 className="ia-section-title">Inventarios Activos</h2>
        <button onClick={() => fetchInventarios()} className="ia-refresh-button" disabled={isRefreshing}>
          <FiRefreshCw className={isRefreshing ? "ia-reloading-icon" : ""} />
          {isRefreshing ? "Recargando..." : "Recargar"}
        </button>
      </div>

      <div className="ia-grid">
        <AnimatePresence>
          {inventariosActivos.map((inv) => (
            <motion.div
              key={inv.id}
              className="ia-card"
              layout
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.3 }}
              whileHover={{ y: -5, boxShadow: "0px 10px 20px rgba(0, 0, 0, 0.1)" }}
            >
              <div className="ia-card-header">
                <h3 className="ia-card-title">{inv.descripcion || "Sin descripción"}</h3>
                <span className="ia-card-consecutivo">#{inv.consecutivo}</span>
              </div>
              <div className="ia-card-body">
                <p><strong>Categoría:</strong> {inv.categoria || "N/A"}</p>
                <p><strong>Personas:</strong> {inv.inventario_zonas?.length || 0}</p>
                <p><strong>Conteo Total:</strong> {mostrarConComa(
                  inv.inventario_zonas?.reduce((sum, z) => sum + (z.conteo_total || 0), 0) || 0
                )}</p>
              </div>
              <div className="ia-card-actions">
                <button onClick={() => openZonasModal(inv)} className="ia-button ia-button-primary">
                  <FaEye /> Ver Zonas
                </button>
                <button
                  onClick={() => handleNotificarOperarios(inv)}
                  className="ia-button ia-button-secondary"
                  // Deshabilita el botón si este inventario específico se está notificando
                  disabled={notifyingInventarioId === inv.id} 
                >
                  {/* Muestra el spinner solo si este inventario específico se está notificando */}
                  {notifyingInventarioId === inv.id ? ( 
                    <>
                      <FaSpinner className="ia-spinner" /> Enviando...
                    </>
                  ) : (
                    <>
                      <FaBell /> Notificar
                    </>
                  )}
                </button>
                <button onClick={() => handleFinalizarInventarioCompleto(inv.id)} className="ia-button ia-button-success">
                  <FaCheckCircle /> Finalizar
                </button>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {inventariosActivos.length === 0 && !isRefreshing && (
        <p className="ia-no-data">No hay inventarios activos en este momento.</p>
      )}

      {/* --- MODAL DE ZONAS (CON ANIMACIÓN MEJORADA) --- */}
      <AnimatePresence>
        {isZonasModalOpen && selectedInventario && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="ia-modal-overlay"
            onClick={cerrarModalZonas}
          >
            <motion.div
              initial={{ y: 50, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 50, opacity: 0 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className="ia-modal ia-zonas-modal"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="ia-modal-header">
                <h3 className="ia-modal-title">Zonas de {selectedInventario.descripcion}</h3>
                <button onClick={cerrarModalZonas} className="ia-modal-close"><FaTimes /></button>
              </div>
              <div className="ia-modal-content">
                <div className="ia-table-wrapper">
                  <table className="ia-table">
                    <thead>
                      <tr>
                        <th className="inv-table-header">Zona</th>
                        <th className="inv-table-header">AUXILIAR</th>
                        <th className="inv-table-header">Estado</th>
                        <th className="inv-table-header">Conteo Total</th>
                        <th className="inv-table-header">Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedInventario.inventario_zonas.map((zona) => (
                        <tr key={zona.id}>
                          <td className="inv-table-cell">{zona.descripcion_zona || "N/A"}</td>
                          <td className="inv-table-cell">{zona.operario_email || "No asignado"}</td>
                          <td className="inv-table-cell">
                            <span className={`status-badge status-${zona.estado.toLowerCase().replace("_", "-")}`}>
                              {estadoMap[zona.estado.toLowerCase()] || zona.estado}
                            </span>
                          </td>
                          <td className="inv-table-cell">{mostrarConComa(zona.conteo_total)}</td>
                          <td className="inv-table-cell">
                            <button onClick={() => handleVerDetalles(zona)} className="ia-button ia-button-secondary">
                              Ver Detalles
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* --- MODAL DE DETALLES (CON ANIMACIÓN MEJORADA) --- */}
      <AnimatePresence>
        {isDetallesModalOpen && selectedZona && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="ia-modal-overlay"
            onClick={cerrarModalDetalles}
          >
            <motion.div
              initial={{ y: 50, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 50, opacity: 0 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className="ia-modal ia-detalles-modal"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="ia-modal-header">
                <h3 className="ia-modal-title">Detalles de Zona: {selectedZona.descripcion_zona}</h3>
                <button onClick={cerrarModalDetalles} className="ia-modal-close"><FaTimes /></button>
              </div>
              <div className="ia-modal-content">
                {loadingDetalles ? (
                  <div className="ia-no-data">Cargando...</div>
                ) : detallesZona.length === 0 ? (
                  <div className="ia-no-data">No hay registros en esta zona.</div>
                ) : (
                  <div className="ia-table-wrapper">
                    <table className="ia-table">
                      <thead>
                        <tr>
                          <th className="inv-table-header">Item</th>
                          <th className="inv-table-header">Descripción</th>
                          <th className="inv-table-header">Código Escaneado</th>
                          <th className="inv-table-header">Cantidad Contada</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detallesZona.map((detalle) => (
                          <tr key={detalle.id}>
                            <td className="inv-table-cell">{detalle.item_id_registrado || '—'}</td>
                            <td className="inv-table-cell">{detalle.maestro_items?.descripcion || 'N/A'}</td>
                            <td className="inv-table-cell">{detalle.codigo_barras_escaneado || '—'}</td>
                            <td className="inv-table-cell">{mostrarConComa(detalle.cantidad)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export default InventariosActivos;
