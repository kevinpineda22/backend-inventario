import React, { useState, useEffect, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { FaEye, FaTimes } from "react-icons/fa";
import { useSnackbar } from 'notistack';
import { supabase } from "../supabaseClient";
import "./InventariosFinalizados.css";
import { debounce } from 'lodash';
import ConsecutivosDisponibles from "./ConsecutivosDisponibles";
import FilterPanel from "./FilterPanel/FilterPanel";
import ReactPaginate from 'react-paginate';

const InventariosFinalizados = ({ user, vista, setLoading }) => {
  const { enqueueSnackbar } = useSnackbar();
  const [inventariosFinalizados, setInventariosFinalizados] = useState([]);
  const [totalInventario, setTotalInventario] = useState([]);
  const [comparacion, setComparacion] = useState([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isZonasModalOpen, setIsZonasModalOpen] = useState(false);
  const [selectedInventario, setSelectedInventario] = useState(null);
  const [zonaDetalle, setZonaDetalle] = useState(null);
  const [detallesZona, setDetallesZona] = useState([]);
  const [isLoadingDetallesZona, setIsLoadingDetallesZona] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [verifyingZonaId, setVerifyingZonaId] = useState(null);
  const [filtroItem, setFiltroItem] = useState("");

  // Estados para paginación y filtros
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalRecords, setTotalRecords] = useState(0);
  const [filters, setFilters] = useState({
    search: "",
    categoria: "",
    fechaInicio: "",
    fechaFin: "",
    sortBy: "fecha_inicio",
    sortOrder: "desc",
    consecutivo: "",
    sede: "" // ✅ Agregar filtro por sede
  });
  const [showFilters, setShowFilters] = useState(false);
  
  // ✅ NUEVO ESTADO: Categorías disponibles desde el backend
  const [categoriasDisponibles, setCategoriasDisponibles] = useState([]);
  const [isLoadingCategorias, setIsLoadingCategorias] = useState(false);
  
  const ITEMS_PER_PAGE = 12;

  // Memoized formatting functions
  const mostrarConComa = useCallback((valor) => {
    if (typeof valor !== 'number' || isNaN(valor)) return valor || '0';
    if (Number.isInteger(valor)) return valor.toLocaleString('es-CO', { minimumFractionDigits: 0 });
    return valor.toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }, []);

  // Filtrar comparacion por item
  const comparacionFiltrada = useMemo(() => {
    if (!filtroItem.trim()) return comparacion;
    return comparacion.filter(item => 
      (item.item && item.item.toLowerCase().includes(filtroItem.toLowerCase())) ||
      (item.descripcion && item.descripcion.toLowerCase().includes(filtroItem.toLowerCase()))
    );
  }, [comparacion, filtroItem]);

  const formatFecha = useCallback((fecha) => {
    if (!fecha || isNaN(new Date(fecha))) return 'N/A';
    return new Date(fecha).toLocaleString('es-CO', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }, []);

  // ✅ NUEVA FUNCIÓN: Fetch con paginación
  const fetchInventariosFinalizados = useCallback(async (page = 1) => {
    setIsRefreshing(true);
    if (setLoading) setLoading(true);

    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: ITEMS_PER_PAGE.toString(),
        vista: vista,
        search: filters.search,
        categoria: filters.categoria,
        fechaInicio: filters.fechaInicio,
        fechaFin: filters.fechaFin,
        sortBy: filters.sortBy,
        sortOrder: filters.sortOrder,
        consecutivo: filters.consecutivo,
        sede: filters.sede // ✅ Incluir sede en params
      });

      const res = await fetch(`https://backend-inventario.vercel.app/api/admin/inventarios-finalizados?${params}`);
      const data = await res.json();
      
      if (data.success && Array.isArray(data.inventarios)) {
        setInventariosFinalizados(data.inventarios);
        setTotalPages(data.pagination?.totalPages || 1);
        setTotalRecords(data.pagination?.totalRecords || 0);
        setCurrentPage(page);
      } else {
        setInventariosFinalizados([]);
      }
    } catch (err) {
      console.error("Error fetching inventarios:", err);
      enqueueSnackbar("Error al cargar inventarios.", { variant: 'error' });
      setInventariosFinalizados([]);
    } finally {
      setIsRefreshing(false);
      if (setLoading) setLoading(false);
    }
  }, [setLoading, enqueueSnackbar, vista, filters]);

  // ✅ NUEVA FUNCIÓN: Debounced search
  const debouncedSearch = useCallback(
    debounce((searchFilters) => {
      setCurrentPage(1);
      setFilters(searchFilters);
    }, 500),
    []
  );

  // ✅ NUEVA FUNCIÓN: Manejar cambios de filtros
  const handleFilterChange = useCallback((key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }));
    setCurrentPage(1); // Reset to page 1 on filter change
  }, []);

  // ✅ NUEVA FUNCIÓN: Limpiar filtros
  const clearFilters = useCallback(() => {
    setFilters({
      search: "",
      categoria: "",
      fechaInicio: "",
      fechaFin: "",
      sortBy: "fecha_inicio",
      sortOrder: "desc",
      consecutivo: "",
      sede: "" // ✅ Limpiar sede
    });
    setCurrentPage(1);
  }, []);

  // Fetch total inventario
  const fetchTotalInventario = useCallback(async () => {
    try {
      const res = await fetch("https://backend-inventario.vercel.app/api/reportes/TotalInventario");
      const data = await res.json();
      setTotalInventario(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Error fetching total inventario:", err);
      enqueueSnackbar("Error al cargar el inventario total.", { variant: 'error' });
      setTotalInventario([]);
    }
  }, [enqueueSnackbar]);

  // Filter zonas by vista
  const filterZonasByVista = useCallback((zonas) => {
    if (!zonas) return [];
    return zonas.filter(zona => {
      if (vista === "finalizados_pendientes") return zona.estado_verificacion === "pendiente" && zona.estado === "finalizada";
      if (vista === "finalizados_aprobados") return zona.estado_verificacion === "aprobado" && zona.estado === "finalizada";
      if (vista === "finalizados_rechazados") return zona.estado_verificacion === "rechazado" && zona.estado === "finalizada";
      return true;
    });
  }, [vista]);

 // Debounced verification
  const handleVerificarZona = useCallback(
    debounce(async (zonaId, estadoVerificacion) => {
      if (!user || !user.email) {
        enqueueSnackbar("No se pudo identificar al usuario administrador.", { variant: 'error' });
        return;
      }

      setVerifyingZonaId(zonaId);
      try {
        const resVerificar = await fetch(`https://backend-inventario.vercel.app/api/admin/verificar-zona/${zonaId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ estado_verificacion: estadoVerificacion, admin_email: user.email }),
        });
        const dataVerificar = await resVerificar.json();
        if (!dataVerificar.success) {
          throw new Error(dataVerificar.message);
        }

        if (estadoVerificacion === 'aprobado') {
          enqueueSnackbar("Aplicando conteos al total...", { variant: 'info' });
          const resAplicar = await fetch(`https://backend-inventario.vercel.app/api/admin/aplicar-conteo/${zonaId}`, {
            method: 'POST',
          });
          const dataAplicar = await resAplicar.json();
          if (!dataAplicar.success) {
            throw new Error(`La zona fue aprobada, pero falló al aplicar el conteo: ${dataAplicar.message}`);
          }
        }

        // Update local state
        setInventariosFinalizados(prev => {
          const updatedInventarios = prev.map(inv => ({
            ...inv,
            inventario_zonas: inv.inventario_zonas.map(zona =>
              zona.id === zonaId ? { ...zona, estado_verificacion: estadoVerificacion } : zona
            )
          }));
          return vista === "finalizados_pendientes"
            ? updatedInventarios.filter(inv => inv.inventario_zonas.some(z => z.estado_verificacion === "pendiente"))
            : updatedInventarios;
        });

        enqueueSnackbar(`Zona marcada como ${estadoVerificacion} correctamente.`, { variant: 'success' });
        if (estadoVerificacion === 'aprobado') {
          await fetchTotalInventario();
        }
      } catch (err) {
        enqueueSnackbar(`Error: ${err.message}`, { variant: 'error' });
      } finally {
        setVerifyingZonaId(null);
      }
    }, 500),
    [user, vista, fetchTotalInventario, enqueueSnackbar]
  );
  
  // Compare inventory - MODIFICADO para filtrar por sede
  const compararInventario = useCallback(async (inventario) => {
    setLoading(true);
    try {
      // ✅ Pasar sede como query param para filtrar productos por sede y consecutivo
      const res = await fetch(`https://backend-inventario.vercel.app/api/reportes/comparar-inventario/${inventario.id}?sede=${encodeURIComponent(inventario.sede)}`);
      const data = await res.json();
      if (data.success) {
        // Ordenar los datos para que las diferencias más grandes (magnitud_error) se vean primero
        const comparacionOrdenada = (data.comparacion || []).sort((a, b) => {
          const magA = Math.abs(a.diferencia_final || 0);
          const magB = Math.abs(b.diferencia_final || 0);
          return magB - magA; // De mayor a menor magnitud de error
        });
        setComparacion(comparacionOrdenada);
        setIsModalOpen(true);
      } else throw new Error(data.message || "Error al generar comparación.");
    } catch (err) {
      enqueueSnackbar(`Error al generar comparación: ${err.message}`, { variant: 'error' });
    } finally {
      setLoading(false);
    }
  }, [enqueueSnackbar, setLoading]);

  // Handle details
  const handleVerDetallesZona = useCallback(async (zona) => {
    setZonaDetalle(zona);
    setDetallesZona([]);
    setIsLoadingDetallesZona(true);
    try {
      const res = await fetch(`https://backend-inventario.vercel.app/api/admin/detalles-zona/${zona.id}`);
      const data = await res.json();
      if (data.success && Array.isArray(data.detalles)) setDetallesZona(data.detalles);
      else enqueueSnackbar('No se pudieron cargar los detalles de la zona.', { variant: 'error' });
    } catch (err) {
      enqueueSnackbar('Error al cargar detalles de la zona.', { variant: 'error' });
    } finally {
      setIsLoadingDetallesZona(false);
    }
  }, [enqueueSnackbar]);

  const cerrarModal = useCallback(() => {
    setIsModalOpen(false);
    setIsZonasModalOpen(false);
    setSelectedInventario(null);
    setZonaDetalle(null);
    setDetallesZona([]);
    setIsLoadingDetallesZona(false);
    setFiltroItem("");
  }, []);

  const cerrarModalDetalles = useCallback(() => {
    setZonaDetalle(null);
    setDetallesZona([]);
    setIsLoadingDetallesZona(false);
  }, []);

  const openZonasModal = useCallback((inventario) => {
    setSelectedInventario(inventario);
    setIsZonasModalOpen(true);
  }, []);

  // Memoized modal variants
  const modalVariants = useMemo(() => ({
    hidden: { opacity: 0, scale: 0.95 },
    visible: { opacity: 1, scale: 1, transition: { duration: 0.3, ease: "easeOut" } },
    exit: { opacity: 0, scale: 0.95, transition: { duration: 0.2, ease: "easeIn" } }
  }), []);

  const overlayVariants = useMemo(() => ({
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { duration: 0.3 } },
    exit: { opacity: 0, transition: { duration: 0.2 } }
  }), []);

  // ✅ NUEVA FUNCIÓN: Refrescar datos
  const refreshData = useCallback(() => {
    fetchInventariosFinalizados(1, false);
  }, [fetchInventariosFinalizados]);

  // ✅ NUEVA FUNCIÓN: Configuración para FilterPanel
  const filterConfig = useMemo(() => ({
    title: vista === "finalizados_pendientes" ? "Inventarios con Zonas Pendientes" :
           vista === "finalizados_aprobados" ? "Inventarios con Zonas Aprobadas" :
           "Inventarios con Zonas Rechazadas",
    showSearch: true,
    showCategory: true,
    showDateRange: true,
    showSorting: true,
    searchPlaceholder: "Buscar por descripción...",
    categoryLabel: "Categoría",
    sortOptions: [
      { value: "fecha_inicio", label: "Fecha" },
      { value: "descripcion", label: "Descripción" },
      { value: "categoria", label: "Categoría" },
      { value: "consecutivo", label: "Consecutivo" }
    ],
    showSede: true, // ✅ Agregar opción para mostrar filtro de sede
  }), [vista]);

  // Fetch categorías desde el endpoint de grupos maestros
  const fetchCategorias = useCallback(async () => {
    setIsLoadingCategorias(true);
    try {
      const res = await fetch("https://backend-inventario.vercel.app/api/maestro/grupos-maestros");
      const data = await res.json();
      
      if (data.success && Array.isArray(data.grupos)) {
        setCategoriasDisponibles(data.grupos);
      } else {
        console.error("El backend no devolvió una lista de grupos válida.");
        enqueueSnackbar("Error al cargar las categorías para filtros.", { variant: 'warning' });
        setCategoriasDisponibles([]);
      }
    } catch (error) {
      console.error("Error al cargar categorías:", error);
      enqueueSnackbar("No se pudieron cargar las categorías.", { variant: 'error' });
      setCategoriasDisponibles([]);
    } finally {
      setIsLoadingCategorias(false);
    }
  }, [enqueueSnackbar]);

  useEffect(() => {
    fetchInventariosFinalizados(1, false);
    fetchTotalInventario();
    
    // ✅ CARGAR CATEGORÍAS al inicializar el componente
    fetchCategorias();
    
    const channel = supabase
      .channel("inventarios-zonas-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "inventario_zonas", filter: "estado=eq.finalizada" }, 
        () => fetchInventariosFinalizados(1, false))
      .subscribe((status, err) => err && enqueueSnackbar("Error al conectar con actualizaciones en tiempo real.", { variant: 'error' }));
    return () => supabase.removeChannel(channel);
  }, [fetchInventariosFinalizados, fetchTotalInventario, fetchCategorias, enqueueSnackbar]);

  // ✅ NUEVO useEffect: Refetch cuando cambian los filtros
  useEffect(() => {
    fetchInventariosFinalizados(currentPage);
  }, [fetchInventariosFinalizados, currentPage]);

  // Add handlePageClick for react-paginate
  const handlePageClick = (data) => {
    setCurrentPage(data.selected + 1);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}  
      transition={{ duration: 0.5, ease: "easeOut" }}
      className="if-container"
    >
      <section className="if-section">
        {/* ✅ REEMPLAZAR: Header y filtros con FilterPanel */}
        <FilterPanel
          showFilters={showFilters}
          setShowFilters={setShowFilters}
          filters={filters}
          onFilterChange={handleFilterChange}
          onClearFilters={clearFilters}
          onRefresh={refreshData}
          isRefreshing={isRefreshing}
          totalRecords={totalRecords}
          config={filterConfig}
          categoriasDisponibles={categoriasDisponibles}
          isLoadingCategorias={isLoadingCategorias}
          onReloadCategorias={fetchCategorias}
          showConsecutivo={true} // ✅ NUEVO: Habilitar el campo de Consecutivo
          showSede={true} // ✅ Habilitar filtro de sede
        />

        {/* Grid de inventarios - sin cambios */}
        <div className="if-grid">
          {inventariosFinalizados.length > 0 ? (
            inventariosFinalizados.map((inv) => {
              const zonasFiltradas = filterZonasByVista(inv.inventario_zonas);
              return zonasFiltradas.length > 0 ? (
                <motion.div
                  key={inv.id}
                  className="if-card"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4 }}
                  whileHover={{ scale: 1.03, boxShadow: "var(--shadow-md)" }}
                >
                  <div className="if-card-header">
                    <h2 className="if-card-title">{inv.descripcion || "Sin descripción"}</h2>
                  </div>
                  <div className="if-card-body">
                    <p><strong>Categoría:</strong> {inv.categoria || "Sin categoría"}</p>
                    <p><strong>Fecha:</strong> {formatFecha(inv.fecha_inicio)}</p>
                    <p><strong>Personas:</strong> {zonasFiltradas.length}</p>
                  </div>
                  <div className="if-card-actions">
                    <button
                      onClick={() => openZonasModal(inv)}
                      className="if-button if-button-primary"
                    >
                      <FaEye /> Ver Zonas
                    </button>
                    <button
                      onClick={() => compararInventario(inv)} // ✅ Pasar el objeto completo 'inv' en lugar de 'inv.id'
                      className="if-button if-button-secondary"
                    >
                      Comparar
                    </button>
                  </div>
                </motion.div>
              ) : null;
            })
          ) : (
            <div className="if-no-data">
              <p>No hay inventarios con zonas {vista.replace("finalizados_", "")}.</p>
            </div>
          )}
        </div>

        {/* ✅ NUEVO: Información de paginación */}
        <div className="if-pagination-info">
          <span>
            Mostrando {inventariosFinalizados.length} de {totalRecords} inventarios
            (Página {currentPage} de {totalPages})
          </span>
        </div>

        {/* Replace the loading trigger with pagination */}
        <ReactPaginate
          previousLabel={'Anterior'}
          nextLabel={'Siguiente'}
          breakLabel={'...'}
          pageCount={totalPages}
          marginPagesDisplayed={2}
          pageRangeDisplayed={5}
          onPageChange={handlePageClick}
          containerClassName={'if-pagination'}
          activeClassName={'active'}
          forcePage={currentPage - 1}
        />
      </section>

      <ConsecutivosDisponibles totalInventario={totalInventario} />

      <AnimatePresence>
        {isModalOpen && (
          <motion.div
            variants={overlayVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="if-modal-overlay"
            onClick={cerrarModal}
          >
            <motion.div
              variants={modalVariants}
              className="if-modal"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="if-modal-header">
                <h2 className="if-modal-title">Comparativa de Inventario</h2>
                <div className="if-modal-header-actions">
                  <div className="if-filter-container">
                    <input
                      type="text"
                      placeholder="Filtrar por item o descripción..."
                      value={filtroItem}
                      onChange={(e) => setFiltroItem(e.target.value)}
                      className="if-filter-input"
                    />
                  </div>
                  <button onClick={cerrarModal} className="if-modal-close"><FaTimes /></button>
                </div>
              </div>
              <div className="if-modal-content">
                <div className="if-table-wrapper">
                  <table className="if-table">
                    <thead>
                      <tr>
                        
                        <th>Item</th>
                        <th>Descripción</th>
                        <th>Cant. Teórica</th>
                        {/* ✅ NUEVA COLUMNA: Primer Conteo Físico */}
                        <th style={{ backgroundColor: '#fffbe6' }}>1er Conteo Físico</th> 
                        {/* ✅ NUEVA COLUMNA: Segundo Conteo (Ajuste) */}
                        <th style={{ backgroundColor: '#e6ffe6' }}>2do Conteo (Ajuste)</th> 
                        <th>Diferencia Final</th>
                      </tr>
                    </thead>
                    <tbody>
                      {comparacionFiltrada.length === 0 ? (
                        <tr><td colSpan="6">{filtroItem ? "No se encontraron items que coincidan con el filtro." : "No hay datos para mostrar."}</td></tr>
                      ) : (
                        comparacionFiltrada.map((item, i) => (
                          <tr key={item.item || `comp-${i}`}>
                            <td>{item.item || "N/A"}</td>
                            <td>{item.descripcion || "N/A"}</td>
                            <td>{mostrarConComa(item.cantidad_original)}</td>
                            
                            {/* ✅ CELDA: 1er Conteo (fisico_1er_conteo) */}
                            <td style={{ backgroundColor: '#fffbe6' }}>
                              {mostrarConComa(item.fisico_1er_conteo)}
                            </td>
                            
                            {/* ✅ CELDA: 2do Conteo (segundo_conteo_ajuste) */}
                            <td style={{ 
                                backgroundColor: item.segundo_conteo_ajuste !== undefined && item.segundo_conteo_ajuste !== null ? '#e6ffe6' : 'white',
                                fontWeight: item.segundo_conteo_ajuste !== undefined && item.segundo_conteo_ajuste !== null ? 'bold' : 'normal'
                            }}>
                              {/* Muestra el ajuste si existe, o el primer conteo si no hubo ajuste */}
                              {item.segundo_conteo_ajuste !== undefined && item.segundo_conteo_ajuste !== null 
                                ? mostrarConComa(item.segundo_conteo_ajuste) 
                                : mostrarConComa(item.conteo_total)} 
                            </td>
                            
                            {/* ✅ CELDA: Diferencia Final (basada en el valor de conteo_final) */}
                            <td className={item.diferencia_final === 0 ? "if-diff-zero" : item.diferencia_final > 0 ? "if-diff-pos" : "if-diff-neg"}>
                              {item.diferencia_final > 0 ? `+${mostrarConComa(item.diferencia_final)}` : mostrarConComa(item.diferencia_final)}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
        {isZonasModalOpen && selectedInventario && (
          <motion.div
            variants={overlayVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="if-modal-overlay"
            onClick={cerrarModal}
          >
            <motion.div
              variants={modalVariants}
              className="if-modal if-modal-xlarge"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="if-modal-header">
                <h2 className="if-modal-title">Zonas de {selectedInventario.descripcion} (#{selectedInventario.consecutivo})</h2>
                <button onClick={cerrarModal} className="if-modal-close"><FaTimes /></button>
              </div>
              <div className="if-modal-content">
                <div className="if-table-wrapper">
                  <table className="if-table">
                    <thead>
                      <tr>
                        <th>Zona</th>
                        <th>AUXILIAR</th>
                        <th>Estado</th>
                        <th>Verificación</th>
                        <th>Iniciada</th>
                        <th>Conteo Total</th>
                        <th>Acciones</th>
                        <th>Detalles</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filterZonasByVista(selectedInventario.inventario_zonas).length === 0 ? (
                        <tr><td colSpan="8">No hay zonas para mostrar.</td></tr>
                      ) : (
                        filterZonasByVista(selectedInventario.inventario_zonas).map(zona => (
                          <motion.tr
                            key={zona.id}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.3 }}
                          >
                            <td>{zona.descripcion_zona || 'N/A'}</td>
                            <td>{zona.operario_email || 'No asignado'}</td>
                            <td><span className={`status-badge status-${zona.estado}`}>{zona.estado}</span></td>
                            <td><span className={`status-badge status-${zona.estado_verificacion}`}>{zona.estado_verificacion}</span></td>
                            <td>{formatFecha(zona.creada_en)}</td>
                            <td>{mostrarConComa(zona.conteo_total) || '0'}</td>
                            <td>
                              {zona.estado_verificacion === 'pendiente' ? (
                                <div className="if-button-group">
                                  <button
                                    onClick={() => handleVerificarZona(zona.id, 'aprobado')}
                                    className="if-button if-button-success"
                                    disabled={verifyingZonaId === zona.id}
                                  >
                                    {verifyingZonaId === zona.id ? <div className="if-spinner-small" /> : "Aprobar"}
                                  </button>
                                  <button
                                    onClick={() => handleVerificarZona(zona.id, 'rechazado')}
                                    className="if-button if-button-danger"
                                    disabled={verifyingZonaId === zona.id}
                                  >
                                    {verifyingZonaId === zona.id ? <div className="if-spinner-small" /> : "Rechazar"}
                                  </button>
                                </div>
                              ) : <span>—</span>}
                            </td>
                            <td>
                              <button
                                onClick={() => handleVerDetallesZona(zona)}
                                className="if-button if-button-primary"
                              >
                                <FaEye /> Detalles
                              </button>
                            </td>
                          </motion.tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
        {zonaDetalle && (
          <motion.div
            variants={overlayVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="if-modal-overlay"
            onClick={cerrarModalDetalles}
          >
            <motion.div
              variants={modalVariants}
              className="if-modal if-modal-large"
              onClick={e => e.stopPropagation()}
            >
              <div className="if-modal-header">
                <h2 className="if-modal-title">Detalle de Zona: {zonaDetalle.descripcion_zona || 'N/A'}</h2>
                <button onClick={cerrarModalDetalles} className="if-modal-close"><FaTimes /></button>
              </div>
              <div className="if-modal-content">
                {isLoadingDetallesZona ? (
                  <div className="if-loading-spinner">
                    <div className="if-spinner-small"></div>
                  </div>
                ) : detallesZona.length === 0 ? (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.3 }}
                    className="if-no-data"
                  >
                    No hay detalles para esta zona.
                  </motion.div>
                ) : (
                  <div className="if-table-wrapper">
                    <table className="if-table">
                      <thead>
                        <tr>
                          <th>Item</th>
                          <th>Descripción</th>
                          <th>Código de Barras</th>
                          <th>Cantidad</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detallesZona.map((detalle, idx) => (
                          <tr key={`detalle-${detalle.id || idx}`}>
                            <td>{detalle.maestro_items?.item_id || '—'}</td>
                            <td>{detalle.maestro_items?.descripcion || '—'}</td>
                            <td>{detalle.codigo_barras_escaneado || '—'}</td>
                            <td>{mostrarConComa(detalle.cantidad) || '0'}</td>
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
};

export default InventariosFinalizados;
