import React, { useCallback, useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { FaEye, FaDownload, FaTimes, FaFileExcel, FaFileAlt, FaEdit, FaSave, FaWindowClose, FaTrash, FaCalendarAlt, FaBox, FaHashtag, FaRedoAlt, FaSearch, FaChevronLeft, FaChevronRight } from "react-icons/fa";
import { toast } from 'react-toastify';
import * as XLSX from "xlsx";
import "./ConsecutivosDisponibles.css";
import FilterPanel from "./FilterPanel/FilterPanel";

const API_BASE_URL = "https://backend-inventario.vercel.app";

const ConsecutivosDisponibles = ({ totalInventario }) => {
  const [inventarioData, setInventarioData] = useState(totalInventario);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [selectedConsecutivo, setSelectedConsecutivo] = useState(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isReplacingConteo, setIsReplacingConteo] = useState(null);
  const [isDeletingConsecutivo, setIsDeletingConsecutivo] = useState(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [consecutivoToDelete, setConsecutivoToDelete] = useState(null);
  const [productSearch, setProductSearch] = useState("");

  // Estados para paginación y filtros
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(12);
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState({
    search: "",
    dateFilter: "",
    sede: "", // ✅ NUEVO: Filtro por sede
    sortBy: "consecutivo",
    sortOrder: "desc",
    itemsPerPage: 12
  });

  useEffect(() => {
    setInventarioData(totalInventario);
  }, [totalInventario]);

  const mostrarConComa = useCallback((valor) => {
    const num = parseFloat(valor);
    if (isNaN(num)) return '0';
    return num.toLocaleString('es-CO', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 4,
    });
  }, []);

  const formatFecha = useCallback((fecha) => {
    if (!fecha || isNaN(new Date(fecha))) return 'N/A';
    return new Date(fecha).toLocaleString('es-CO', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  }, []);

  // --- LÓGICA DE EXPORTACIÓN A TXT (VERSIÓN FINAL) ---
  const exportarTotalInventarioTXT = useCallback(() => {
    if (!inventarioData || inventarioData.length === 0) {
      toast.error("No hay datos para exportar.");
      return;
    }

    const lines = ["000000100000001001"];
    let lineNumber = 2;

    inventarioData.forEach((row) => {
      if (!row.productos || !Array.isArray(row.productos)) return;
      row.productos.forEach((producto) => {
        if (parseFloat(producto.conteo_cantidad) > 0) {
          // 1. Obtener las partes del número de la cantidad
          const num = parseFloat(producto.conteo_cantidad) || 0;
          const [integerPart, decimalPart = '0000'] = num.toFixed(4).split(".");

          // 2. Construir la línea completa con formato de ancho fijo preciso
          const line =
            `${lineNumber.toString().padStart(7, '0')}` +
            `04120001001` +
            `${(row.consecutivo || "").toString().padStart(8, '0')}` +
            `${(producto.item || "").toString().padStart(7, '0')}` +
            `${" ".repeat(48)}` + // CORRECCIÓN: 48 espacios
            `${(producto.bodega || "").toString().padEnd(5, " ")}` +
            `${" ".repeat(25)}` +
            // CORRECCIÓN: Bloque numérico reconstruido con precisión
            `00000000000000000000.000000000000000.` +
            `${integerPart.padStart(10, "0")}` +
            `,${decimalPart.padEnd(4, "0")}` +
            `.000000000000000.000000000000000.000000000000000.0000`;

          lines.push(line);
          lineNumber++;
        }
      });
    });

    lines.push(`${lineNumber.toString().padStart(7, "0")}99990001001`);
    const blob = new Blob([lines.join("\r\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "total_inventario_siesa.txt";
    a.click();
    URL.revokeObjectURL(url);
  }, [inventarioData]);

  const exportarConsecutivoTXT = useCallback((consecutivoNum) => {
    const consecutivoData = inventarioData.find(row => row.consecutivo === consecutivoNum);
    if (!consecutivoData || !consecutivoData.productos || consecutivoData.productos.length === 0) {
      toast.error(`No hay datos para el consecutivo #${consecutivoNum} para exportar.`);
      return;
    }

    const lines = ["000000100000001001"];
    let lineNumber = 2;

    consecutivoData.productos.forEach((producto) => {
      if (parseFloat(producto.conteo_cantidad) > 0) {
        // 1. Obtener las partes del número de la cantidad
        const num = parseFloat(producto.conteo_cantidad) || 0;
        const [integerPart, decimalPart = '0000'] = num.toFixed(4).split(".");
        
        // 2. Construir la línea completa con formato de ancho fijo preciso
        const line =
            `${lineNumber.toString().padStart(7, '0')}` +
            `04120001001` +
            `${(consecutivoData.consecutivo || "").toString().padStart(8, '0')}` +
            `${(producto.item || "").toString().padStart(7, '0')}` +
            `${" ".repeat(48)}` + // CORRECCIÓN: 48 espacios
            `${(producto.bodega || "").toString().padEnd(5, " ")}` +
            `${" ".repeat(25)}` +
            // CORRECCIÓN: Bloque numérico reconstruido con precisión
            `00000000000000000000.000000000000000.` +
            `${integerPart.padStart(10, "0")}` +
            `,${decimalPart.padEnd(4, "0")}` +
            `.000000000000000.000000000000000.000000000000000.0000`;

        lines.push(line);
        lineNumber++;
      }
    });

    lines.push(`${lineNumber.toString().padStart(7, "0")}99990001001`);
    const blob = new Blob([lines.join("\r\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `inventario_consecutivo_${consecutivoNum}_siesa.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }, [inventarioData]);

  // --- RESTO DE FUNCIONES DE EXPORTACIÓN ---
  const exportarTotalInventarioExcel = useCallback(() => {
    if (!inventarioData || inventarioData.length === 0) {
      toast.error("No hay datos para exportar.");
      return;
    }
    const formatQuantity = (quantity) => {
      const num = parseFloat(quantity) || 0;
      return num.toFixed(4);
    };
    const excelRows = [];
    inventarioData.forEach(row => {
      if (!row.productos || !Array.isArray(row.productos)) return;
      row.productos.forEach(producto => {
        if (parseFloat(producto.conteo_cantidad) > 0) {
          excelRows.push({
            NRO_INVENTARIO_BODEGA: row.consecutivo ?? "",
            ITEM: producto.item ?? "",
            BODEGA: producto.bodega ?? "",
            CANT_11ENT_PUNTO_4DECIMALES: formatQuantity(producto.conteo_cantidad),
          });
        }
      });
    });

    if (excelRows.length === 0) {
        toast.info("No hay productos con conteo registrado para exportar a Excel.");
        return;
    }

    const ws = XLSX.utils.json_to_sheet(excelRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Físico");
    XLSX.writeFile(wb, "total_inventario_escaneado.xlsx");
  }, [inventarioData]);

  const exportarConsecutivoExcel = useCallback((consecutivo) => {
    const consecutivoData = inventarioData.find(row => row.consecutivo === consecutivo);
    if (!consecutivoData || !consecutivoData.productos || consecutivoData.productos.length === 0) {
      toast.error("No hay datos para exportar.");
      return;
    }
    const formatQuantity = (quantity) => {
      const num = parseFloat(quantity) || 0;
      return num.toFixed(4);
    };
    
    const excelRows = consecutivoData.productos
        .filter(producto => parseFloat(producto.conteo_cantidad) > 0)
        .map(producto => ({
          NRO_INVENTARIO_BODEGA: consecutivoData.consecutivo ?? "",
          ITEM: producto.item ?? "",
          BODEGA: producto.bodega ?? "",
          CANT_11ENT_PUNTO_4DECIMALES: formatQuantity(producto.conteo_cantidad),
        }));

    if (excelRows.length === 0) {
        toast.info(`No hay productos con conteo registrado para el consecutivo #${consecutivo} para exportar.`);
        return;
    }

    const ws = XLSX.utils.json_to_sheet(excelRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Físico");
    XLSX.writeFile(wb, `inventario_consecutivo_${consecutivo}_escaneado.xlsx`);
  }, [inventarioData]);

  const verDetalleConsecutivo = useCallback((data) => {
    console.log("Datos del consecutivo seleccionado:", data);
    console.log("Productos del consecutivo:", data?.productos);
    if (data?.productos?.[0]) {
      console.log("PRIMER PRODUCTO - Campos disponibles:", Object.keys(data.productos[0]));
      console.log("PRIMER PRODUCTO - conteo_punto_venta:", data.productos[0].conteo_punto_venta);
      console.log("PRIMER PRODUCTO - conteo_bodega:", data.productos[0].conteo_bodega);
    }
    if (data && data.productos) {
      setSelectedConsecutivo(JSON.parse(JSON.stringify(data)));
      setProductSearch("");
      setIsDetailModalOpen(true);
    } else {
      toast.error("No se encontraron detalles para este consecutivo.");
    }
  }, []);

  const cerrarModal = useCallback(() => {
    setIsDetailModalOpen(false);
    setIsEditMode(false);
    setTimeout(() => setSelectedConsecutivo(null), 300);
  }, []);

  const handleConteoChange = (newValue, productIndex) => {
    const updatedProductos = [...selectedConsecutivo.productos];
    const parsedValue = newValue === '' ? '' : parseFloat(newValue);
    updatedProductos[productIndex] = {
      ...updatedProductos[productIndex],
      conteo_cantidad: isNaN(parsedValue) ? 0 : parsedValue,
    };
    setSelectedConsecutivo({
      ...selectedConsecutivo,
      productos: updatedProductos,
    });
  };

  const handleSaveChanges = async () => {
    setIsSaving(true);
    const originalConsecutivo = inventarioData.find(inv => inv.consecutivo === selectedConsecutivo.consecutivo);
    
    const changedProducts = selectedConsecutivo.productos.filter((updatedProduct, idx) => {
        const originalProduct = originalConsecutivo.productos[idx];
        return parseFloat(updatedProduct.conteo_cantidad || 0) !== parseFloat(originalProduct.conteo_cantidad || 0);
    });

    if (changedProducts.length === 0) {
        toast.info("No hay cambios para guardar.");
        setIsEditMode(false);
        setIsSaving(false);
        return;
    }

    try {
        const updatePromises = changedProducts.map(async (productToUpdate) => {
            const url = `${API_BASE_URL}/api/admin/inventario/consecutivos/${selectedConsecutivo.consecutivo}/productos/${productToUpdate.item}`;
            const response = await fetch(url, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ conteo_cantidad: parseFloat(productToUpdate.conteo_cantidad) }),
            });

            if (!response.ok) {
                const errorText = await response.text();
                let errorMessage = `Error al actualizar el ítem ${productToUpdate.item}: ${response.statusText}`;
                try {
                    const errorData = JSON.parse(errorText);
                    errorMessage = `Error al actualizar el ítem ${productToUpdate.item}: ${errorData.message || response.statusText}`;
                } catch (parseError) {
                    console.warn("La respuesta de error no es un JSON válido:", errorText);
                }
                throw new Error(errorMessage);
            }
            return response.json();
        });

        await Promise.all(updatePromises);

        const updatedInventario = inventarioData.map(inv => 
          inv.consecutivo === selectedConsecutivo.consecutivo ? selectedConsecutivo : inv
        );
        setInventarioData(updatedInventario);
        setIsEditMode(false);
        toast.success("✅ ¡Cambios guardados con éxito en la base de datos!");

    } catch (error) {
        console.error("❌ Error al guardar cambios:", error);
        toast.error(`Error al guardar cambios: ${error.message}`);
    } finally {
        setIsSaving(false);
    }
  };

  const handleCancelEdit = () => {
    const originalData = inventarioData.find(row => row.consecutivo === selectedConsecutivo.consecutivo);
    setSelectedConsecutivo(JSON.parse(JSON.stringify(originalData)));
    setIsEditMode(false);
    toast.info("ℹ️ Edición cancelada.");
  }

  const handleReemplazarConSegundoConteo = async (producto, productIndex) => {
    if (!producto.segundo_conteo_ajuste && producto.segundo_conteo_ajuste !== 0) {
      toast.error("No hay segundo conteo disponible para reemplazar.");
      return;
    }

    const itemKey = `${selectedConsecutivo.consecutivo}-${producto.item}`;
    setIsReplacingConteo(itemKey);

    try {
      const url = `${API_BASE_URL}/api/admin/inventario/consecutivos/${selectedConsecutivo.consecutivo}/productos/${producto.item}`;
      const response = await fetch(url, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conteo_cantidad: parseFloat(producto.segundo_conteo_ajuste) }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        let errorMessage = `Error al reemplazar conteo para el ítem ${producto.item}: ${response.statusText}`;
        try {
          const errorData = JSON.parse(errorText);
          errorMessage = `Error al reemplazar conteo para el ítem ${producto.item}: ${errorData.message || response.statusText}`;
        } catch (parseError) {
          console.warn("La respuesta de error no es un JSON válido:", errorText);
        }
        throw new Error(errorMessage);
      }

      // Actualizar el estado local
      const updatedProductos = [...selectedConsecutivo.productos];
      updatedProductos[productIndex] = {
        ...updatedProductos[productIndex],
        conteo_cantidad: parseFloat(producto.segundo_conteo_ajuste),
      };
      
      const updatedConsecutivo = {
        ...selectedConsecutivo,
        productos: updatedProductos,
      };
      
      setSelectedConsecutivo(updatedConsecutivo);

      // Actualizar el inventarioData también
      const updatedInventario = inventarioData.map(inv => 
        inv.consecutivo === selectedConsecutivo.consecutivo ? updatedConsecutivo : inv
      );
      setInventarioData(updatedInventario);

      toast.success(`✅ Conteo total reemplazado con el segundo conteo para el ítem ${producto.item}`);

    } catch (error) {
      console.error("❌ Error al reemplazar conteo:", error);
      toast.error(`Error al reemplazar conteo: ${error.message}`);
    } finally {
      setIsReplacingConteo(null);
    }
  };

  const showDeleteConfirmation = (consecutivoNum) => {
    setConsecutivoToDelete(consecutivoNum);
    setShowDeleteConfirm(true);
  };

  const cancelDelete = () => {
    setShowDeleteConfirm(false);
    setConsecutivoToDelete(null);
  };

  const confirmDelete = async () => {
    if (!consecutivoToDelete) return;

    setShowDeleteConfirm(false);
    setIsDeletingConsecutivo(consecutivoToDelete);

    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/eliminar-consecutivo/${consecutivoToDelete}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (response.status === 404) {
        toast.error(`🔧 Error 404: La ruta de eliminación no está disponible en el servidor.`);
        return;
      }

      if (!response.ok) {
        const data = await response.json().catch(() => ({ message: 'Error desconocido del servidor' }));
        throw new Error(data.message || `Error del servidor: ${response.status}`);
      }

      // Actualizar estado local removiendo el consecutivo eliminado
      setInventarioData(prev => prev.filter(item => item.consecutivo !== consecutivoToDelete));
      
      toast.success(`✅ Consecutivo #${consecutivoToDelete} eliminado correctamente`);

    } catch (error) {
      console.error('Error eliminando consecutivo:', error);
      
      if (error.message.includes('fetch') || error.name === 'TypeError') {
        toast.error(`🔌 Error de conexión: No se pudo conectar al servidor`);
      } else {
        toast.error(`❌ Error al eliminar consecutivo: ${error.message}`);
      }
    } finally {
      setIsDeletingConsecutivo(null);
      setConsecutivoToDelete(null);
    }
  };

  const filterConfig = useMemo(() => ({
    title: "Consecutivos para Exportar",
    showSearch: true,
    showCategory: false, // ✅ CAMBIO: Desactivar category (ya no se usa para sede)
    showDateRange: false,
    showSingleDate: true,
    showSorting: true,
    showItemsPerPage: true,
    searchPlaceholder: "Buscar por consecutivo, nombre o descripción...",
    sortOptions: [
      { value: "consecutivo", label: "Consecutivo" },
      { value: "fecha", label: "Fecha" },
      { value: "productos", label: "Número de Productos" },
      { value: "unidades", label: "Total de Unidades" }
    ],
    itemsPerPageOptions: [
      { value: 8, label: "8 por página" },
      { value: 12, label: "12 por página" },
      { value: 24, label: "24 por página" },
      { value: 48, label: "48 por página" }
    ]
  }), []);

  const handleFilterChange = useCallback((key, value) => {
    setCurrentPage(1);
    if (key === 'itemsPerPage') {
      setItemsPerPage(value);
    }
    const newFilters = { ...filters, [key]: value };
    setFilters(newFilters);
  }, [filters]);

  const clearFilters = useCallback(() => {
    const clearedFilters = {
      search: "",
      dateFilter: "",
      sede: "",
      sortBy: "consecutivo",
      sortOrder: "desc",
      itemsPerPage: 12
    };
    setFilters(clearedFilters);
    setCurrentPage(1);
    setItemsPerPage(12);
  }, []);

  const filteredAndSortedData = useMemo(() => {
    let filtered = [...(inventarioData || [])];

    // ✅ NUEVO: Filtro por búsqueda de texto
    if (filters.search?.trim()) {
      const term = filters.search.toLowerCase();
      filtered = filtered.filter(item => 
        (item.consecutivo?.toString().includes(term)) ||
        (item.nombre?.toLowerCase().includes(term)) ||
        (item.descripcion?.toLowerCase().includes(term))
      );
    }

    // ✅ NUEVO: Filtro por sede
    if (filters.sede?.trim()) {
      filtered = filtered.filter(item => item.sede === filters.sede);
    }

    // ✅ Filtro por fecha (sin cambios)
    if (filters.dateFilter) {
      const [year, month, day] = filters.dateFilter.split('-').map(Number);
      const filterYear = year;
      const filterMonth = month - 1;
      const filterDay = day;

      filtered = filtered.filter(item => {
        if (!item.fecha) return false;
        const itemDate = new Date(item.fecha);
        return itemDate.getFullYear() === filterYear &&
               itemDate.getMonth() === filterMonth &&
               itemDate.getDate() === filterDay;
      });
    }

    filtered.sort((a, b) => {
      let aValue, bValue;
      
      switch (filters.sortBy) {
        case "consecutivo":
          aValue = parseInt(a.consecutivo) || 0;
          bValue = parseInt(b.consecutivo) || 0;
          break;
        case "fecha":
          aValue = new Date(a.fecha || 0);
          bValue = new Date(b.fecha || 0);
          break;
        case "productos":
          aValue = a.productos?.length || 0;
          bValue = b.productos?.length || 0;
          break;
        case "unidades":
          aValue = a.productos?.reduce((acc, p) => acc + (parseFloat(p.conteo_cantidad) || 0), 0) || 0;
          bValue = b.productos?.reduce((acc, p) => acc + (parseFloat(p.conteo_cantidad) || 0), 0) || 0;
          break;
        default:
          aValue = a[filters.sortBy] || "";
          bValue = b[filters.sortBy] || "";
      }

      if (filters.sortOrder === "asc") {
        return aValue > bValue ? 1 : -1;
      } else {
        return aValue < bValue ? 1 : -1;
      }
    });

    return filtered;
  }, [inventarioData, filters]);

  const paginationData = useMemo(() => {
    const totalItems = filteredAndSortedData.length;
    const totalPages = Math.ceil(totalItems / filters.itemsPerPage);
    const startIndex = (currentPage - 1) * filters.itemsPerPage;
    const endIndex = startIndex + filters.itemsPerPage;
    const currentItems = filteredAndSortedData.slice(startIndex, endIndex);

    return {
      totalItems,
      totalPages,
      currentItems,
      startIndex,
      endIndex,
      hasNextPage: currentPage < totalPages,
      hasPrevPage: currentPage > 1
    };
  }, [filteredAndSortedData, currentPage, filters.itemsPerPage]);

  const handlePageChange = useCallback((page) => {
    if (page >= 1 && page <= paginationData.totalPages) {
      setCurrentPage(page);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [paginationData.totalPages]);

  const filteredProductos = useMemo(() => {
    if (!selectedConsecutivo?.productos) {
      return [];
    }

    const term = productSearch.trim().toLowerCase();
    return selectedConsecutivo.productos
      .map((producto, index) => ({ producto, index }))
      .filter(({ producto }) => {
        if (!term) {
          return true;
        }
        const itemText = (producto.item ?? "").toString().toLowerCase();
        const descriptionText = (producto.descripcion ?? "").toString().toLowerCase();
        return itemText.includes(term) || descriptionText.includes(term);
      });
  }, [selectedConsecutivo, productSearch]);

  const totalProductos = selectedConsecutivo?.productos?.length || 0;
  const visibleProductos = totalProductos > 0 ? filteredProductos.length : 0;

  useEffect(() => {
    setCurrentPage(1);
  }, [filters.search, filters.dateFilter, filters.sede, filters.sortBy, filters.sortOrder]); // ✅ NUEVO: Agregar filters.sede

  const customActions = (
    <>
      <button onClick={exportarTotalInventarioTXT} className="fp-button fp-button-outline">
        <FaFileAlt /> Exportar a TXT
      </button>
      <button onClick={exportarTotalInventarioExcel} className="fp-button fp-button-outline">
        <FaFileExcel /> Exportar a Excel
      </button>
    </>
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="cd-container"
    >
      <section className="cd-section">
        <FilterPanel
          showFilters={showFilters}
          setShowFilters={setShowFilters}
          filters={filters}
          onFilterChange={handleFilterChange}
          onClearFilters={clearFilters}
          totalRecords={paginationData.totalItems}
          config={filterConfig}
          customActions={customActions}
          showSede={true} // ✅ NUEVO: Activar filtro independiente de sede
        />

        {paginationData.totalItems === 0 ? (
          <div className="cd-no-data">
            <p>
              {filters.search || filters.dateFilter 
                ? "No se encontraron consecutivos que coincidan con los filtros aplicados." 
                : "No hay consecutivos disponibles para exportar."
              }
            </p>
          </div>
        ) : (
          <>
            <div className="cd-grid">
              {paginationData.currentItems.map((row, index) => (
                <motion.div
                  layout
                  key={`consecutivo-${row.consecutivo}-${index}`}
                  className="cd-card"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  whileHover={{ y: -8, boxShadow: "0 20px 40px rgba(0,0,0,0.1)" }}
                  transition={{ duration: 0.3 }}
                >
                  <div className="cd-card-header">
                    <div className="cd-card-header-content">
                      <div className="cd-card-badge">
                        <FaHashtag className="cd-badge-icon" />
                        <span>#{row.consecutivo}</span>
                      </div>
                      <button
                        onClick={() => showDeleteConfirmation(row.consecutivo)}
                        className="cd-delete-btn"
                        disabled={isDeletingConsecutivo === row.consecutivo}
                        title="Eliminar consecutivo"
                      >
                        {isDeletingConsecutivo === row.consecutivo ? (
                          <div className="cd-spinner-tiny"></div>
                        ) : (
                          <FaTrash />
                        )}
                      </button>
                    </div>
                    <h3 className="cd-card-title">
                      {row.nombre || `Consecutivo ${row.consecutivo}`} - {row.sede}
                    </h3>
                    {row.descripcion && (
                      <p className="cd-card-subtitle">{row.descripcion}</p>
                    )}
                  </div>

                  <div className="cd-card-body">
                    <div className="cd-card-stats">
                      <div className="cd-stat-item">
                        <FaBox className="cd-stat-icon" />
                        <div className="cd-stat-content">
                          <span className="cd-stat-label">Productos</span>
                          <span className="cd-stat-value">{row.productos?.length || 0}</span>
                        </div>
                      </div>
                      
                      <div className="cd-stat-item">
                        <FaCalendarAlt className="cd-stat-icon" />
                        <div className="cd-stat-content">
                          <span className="cd-stat-label">Unidades</span>
                          <span className="cd-stat-value">
                            {mostrarConComa(row.productos?.reduce((acc, p) => acc + (parseFloat(p.conteo_cantidad) || 0), 0) || 0)}
                          </span>
                        </div>
                      </div>
                    </div>

                    {row.fecha && (
                      <div className="cd-card-date">
                        <FaCalendarAlt className="cd-date-icon" />
                        <span>{formatFecha(row.fecha)}</span>
                      </div>
                    )}
                  </div>

                  <div className="cd-card-actions">
                    <button 
                      onClick={() => verDetalleConsecutivo(row)} 
                      className="cd-button cd-button-primary"
                    >
                      <FaEye /> Ver Detalle
                    </button>
                    <button 
                      onClick={() => exportarConsecutivoExcel(row.consecutivo)} 
                      className="cd-button cd-button-success"
                    >
                      <FaDownload /> Excel
                    </button>
                    <button 
                      onClick={() => exportarConsecutivoTXT(row.consecutivo)} 
                      className="cd-button cd-button-outline"
                    >
                      <FaFileAlt /> TXT
                    </button>
                  </div>
                </motion.div>
              ))}
            </div>

            {paginationData.totalPages > 1 && (
              <div className="cd-pagination">
                <div className="cd-pagination-info">
                  <span>
                    Mostrando {paginationData.startIndex + 1}-{Math.min(paginationData.endIndex, paginationData.totalItems)} de {paginationData.totalItems} consecutivos
                  </span>
                </div>
                
                <div className="cd-pagination-controls">
                  <button
                    onClick={() => handlePageChange(currentPage - 1)}
                    disabled={!paginationData.hasPrevPage}
                    className="cd-button cd-button-outline cd-pagination-btn"
                  >
                    <FaChevronLeft /> Anterior
                  </button>

                  <div className="cd-pagination-numbers">
                    {Array.from({ length: Math.min(5, paginationData.totalPages) }, (_, i) => {
                      let pageNum;
                      if (paginationData.totalPages <= 5) {
                        pageNum = i + 1;
                      } else if (currentPage <= 3) {
                        pageNum = i + 1;
                      } else if (currentPage >= paginationData.totalPages - 2) {
                        pageNum = paginationData.totalPages - 4 + i;
                      } else {
                        pageNum = currentPage - 2 + i;
                      }

                      return (
                        <button
                          key={pageNum}
                          onClick={() => handlePageChange(pageNum)}
                          className={`cd-button cd-pagination-number ${
                            currentPage === pageNum ? 'cd-button-primary' : 'cd-button-outline'
                          }`}
                        >
                          {pageNum}
                        </button>
                      );
                    })}
                  </div>

                  <button
                    onClick={() => handlePageChange(currentPage + 1)}
                    disabled={!paginationData.hasNextPage}
                    className="cd-button cd-button-outline cd-pagination-btn"
                  >
                    Siguiente <FaChevronRight />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </section>

      <AnimatePresence>
        {isDetailModalOpen && selectedConsecutivo && (
          <motion.div className="cd-modal-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={cerrarModal}>
            <motion.div
              className="cd-modal cd-modal-xlarge"
              initial={{ y: 50, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 50, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="cd-modal-header">
                <h3 className="cd-modal-title">Detalle Consecutivo: #{selectedConsecutivo.consecutivo}</h3>
                <div className="cd-modal-header-actions">
                  {isEditMode ? (
                    <>
                      <button
                        onClick={handleSaveChanges}
                        className="cd-button cd-button-success"
                        disabled={isSaving}
                      >
                        {isSaving ? 'Guardando...' : <><FaSave /> Guardar Cambios</>}
                      </button>
                      <button
                        onClick={handleCancelEdit}
                        className="cd-button cd-button-danger"
                        disabled={isSaving}
                      >
                        <FaWindowClose /> Cancelar
                      </button>
                    </>
                  ) : (
                    <button onClick={() => setIsEditMode(true)} className="cd-button cd-button-primary"><FaEdit /> Editar</button>
                  )}
                  <button onClick={cerrarModal} className="cd-modal-close"><FaTimes /></button>
                </div>
              </div>
              
              <div className="cd-modal-search-section">
                <div className="cd-search-container">
                  <div className="cd-search-input-wrapper">
                    <FaSearch className="cd-search-icon" />
                    <input
                      type="text"
                      placeholder="Buscar por ítem o descripción..."
                      value={productSearch}
                      onChange={(e) => setProductSearch(e.target.value)}
                      className="cd-search-input"
                    />
                    {productSearch && (
                      <button
                        onClick={() => setProductSearch("")}
                        className="cd-search-clear"
                        title="Limpiar búsqueda"
                      >
                        <FaTimes />
                      </button>
                    )}
                  </div>
                  <div className="cd-search-stats">
                    <span className="cd-search-results">
                      {productSearch ? (
                        <>Mostrando {visibleProductos} de {totalProductos} productos</>
                      ) : (
                        <>Total: {totalProductos} productos</>
                      )}
                    </span>
                  </div>
                </div>
              </div>

              <div className="cd-modal-content">
                <div className="cd-table-wrapper">
                  <table className="cd-table">
                    <thead>
                      <tr>
                        <th>Nombre</th>
                        <th>Descripción</th>
                        <th>Fecha</th>
                        <th>Grupo</th>
                        <th>Item</th>
                        <th>Producto</th>
                        <th>Bodega</th>
                        <th>Cantidad Original</th>
                        <th style={{ backgroundColor: '#e3f2fd' }}>Conteo Punto de Venta</th>
                        <th style={{ backgroundColor: '#fff3e0' }}>Conteo Bodega</th>
                        <th>Conteo Total</th>
                        <th style={{ backgroundColor: '#e6ffe6' }}>2do Conteo (Ajuste)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(!selectedConsecutivo.productos || selectedConsecutivo.productos.length === 0) ? (
                        <tr><td colSpan="12" className="cd-no-data">No hay productos para mostrar.</td></tr>
                      ) : filteredProductos.length === 0 ? (
                        <tr><td colSpan="12" className="cd-no-data">No se encontraron productos que coincidan con la búsqueda "{productSearch}".</td></tr>
                      ) : (
                        filteredProductos.map(({ producto, index: idx }) => {
                          const hasSecond = producto.segundo_conteo_ajuste !== undefined && producto.segundo_conteo_ajuste !== null;
                          const conteoPuntoVenta = parseFloat(producto.conteo_punto_venta) || 0;
                          const conteoBodega = parseFloat(producto.conteo_bodega) || 0;
                          return (
                            <tr key={`producto-${selectedConsecutivo.consecutivo}-${producto.item}-${idx}`}>
                              <td>{selectedConsecutivo.nombre || "—"}</td>
                              <td>{selectedConsecutivo.descripcion || "—"}</td>
                              <td>{formatFecha(selectedConsecutivo.fecha)}</td>
                              <td>{producto.grupo || "—"}</td>
                              <td>{producto.item || "—"}</td>
                              <td>{producto.descripcion || "—"}</td>
                              <td>{producto.bodega || "—"}</td>
                              <td>{mostrarConComa(producto.cantidad) || "0"}</td>
                              <td style={{ backgroundColor: '#e3f2fd', fontWeight: 'bold' }}>
                                {mostrarConComa(conteoPuntoVenta)}
                              </td>
                              <td style={{ backgroundColor: '#fff3e0', fontWeight: 'bold' }}>
                                {mostrarConComa(conteoBodega)}
                              </td>
                              <td>
                                {isEditMode ? (
                                  <input
                                    type="number"
                                    value={producto.conteo_cantidad}
                                    onChange={(e) => handleConteoChange(e.target.value, idx)}
                                    className="cd-table-input"
                                    step="0.0001"
                                  />
                                ) : (
                                  <span style={{ fontWeight: 'bold', color: 'var(--cs-primary-color)' }}>
                                    {mostrarConComa(producto.conteo_cantidad) || "0"}
                                  </span>
                                )}
                              </td>
                              <td className={`cd-second-count-cell ${hasSecond ? 'cd-second-count-cell--filled' : ''}`}>
                                <div className="cd-second-count-tag">
                                  <span className="cd-second-count-label">{hasSecond ? 'Ajuste' : 'Sin ajuste'}</span>
                                  <span className="cd-second-count-value">
                                    {hasSecond ? mostrarConComa(producto.segundo_conteo_ajuste) : "—"}
                                  </span>
                                </div>
                                {hasSecond &&
                                 parseFloat(producto.segundo_conteo_ajuste) !== parseFloat(producto.conteo_cantidad) && (
                                  <button
                                    onClick={() => handleReemplazarConSegundoConteo(producto, idx)}
                                    className="cd-button-mini cd-button-warning cd-second-count-action"
                                    disabled={isReplacingConteo === `${selectedConsecutivo.consecutivo}-${producto.item}`}
                                    title="Reemplazar Conteo Total con este valor"
                                  >
                                    {isReplacingConteo === `${selectedConsecutivo.consecutivo}-${producto.item}` ? (
                                      <div className="cd-spinner-tiny"></div>
                                    ) : (
                                      <FaRedoAlt className="cd-second-count-icon" />
                                    )}
                                  </button>
                                )}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showDeleteConfirm && (
          <motion.div 
            className="cd-modal-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={cancelDelete}
          >
            <motion.div
              className="cd-confirm-modal"
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="cd-confirm-header">
                <div className="cd-confirm-icon">
                  <FaTrash />
                </div>
                <h3 className="cd-confirm-title">Confirmar Eliminación</h3>
              </div>
              
              <div className="cd-confirm-body">
                <p className="cd-confirm-message">
                  ¿Estás seguro de que deseas eliminar el consecutivo <strong>#{consecutivoToDelete}</strong>?
                </p>
                
                <div className="cd-confirm-warning">
                  <div className="cd-warning-list">
                    <p><strong>Esta acción eliminará:</strong></p>
                    <ul>
                      <li>Todos los productos del consecutivo</li>
                      <li>Todos los ajustes de reconteo</li>
                      <li>El registro del inventario</li>
                    </ul>
                  </div>
                  <div className="cd-warning-note">
                    <strong>⚠️ Esta acción NO se puede deshacer</strong>
                  </div>
                </div>
              </div>
              
              <div className="cd-confirm-actions">
                <button
                  onClick={cancelDelete}
                  className="cd-button cd-button-secondary"
                >
                  <FaTimes /> Cancelar
                </button>
                <button
                  onClick={confirmDelete}
                  className="cd-button cd-button-danger"
                >
                  <FaTrash /> Eliminar
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

    </motion.div>
  );
};

export default ConsecutivosDisponibles;