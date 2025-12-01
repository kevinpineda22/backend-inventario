// src/components/ExportCarnesYfruver.jsx (MODIFICADO)

import React, { useState, useEffect, useCallback } from "react";
import * as XLSX from "xlsx";
import { Download, ChevronDown, RefreshCcw, Search, Plus, Filter, X, Package, TrendingUp, Calendar } from "lucide-react"; // Add more icons
import { toast } from 'react-toastify';
import './ExportCarnesYfruver.css'; // ¡Importa los estilos del nuevo componente!

// El componente ahora acepta 'inventariosAgrupados' y 'onRefreshData' como props
const ExportCarnesYfruver = ({ inventariosAgrupados, onRefreshData }) => {
  const [consecutivosProcesados, setConsecutivosProcesados] = useState([]);
  const [selectedConsecutivo, setSelectedConsecutivo] = useState(null);
  const [loadingRefresh, setLoadingRefresh] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [displayedCount, setDisplayedCount] = useState(10);

  const formatQuantity = useCallback((quantity) => {
    const num = parseFloat(quantity);
    if (isNaN(num)) {
      return "0,0000";
    }
    return num.toLocaleString("es-CO", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 4,
      useGrouping: false
    });
  }, []);

  // ✅ MODIFICADO: Procesar datos agrupando por consecutivo Y bodega
  useEffect(() => {
    const processedData = {};

    Object.values(inventariosAgrupados).forEach(inv => {
      Object.values(inv.dates).forEach(recordsForDate => {
        recordsForDate.forEach(reg => {
          if (reg.consecutivo && reg.bodega) {
            // ✅ CAMBIO CLAVE: Usar consecutivo + bodega como clave única
            const key = `${reg.consecutivo}_${reg.bodega}`;
            
            if (!processedData[key]) {
              processedData[key] = {
                consecutivo: reg.consecutivo,
                bodega: reg.bodega, // ✅ NUEVO: Guardar bodega
                fecha_creacion: reg.fecha_registro || new Date().toISOString(),
                productos: []
              };
            }
            processedData[key].productos.push({
              item: reg.item_id,
              bodega: reg.bodega,
              conteo_cantidad: reg.cantidad,
              descripcion_zona: reg.descripcion_zona,
              operario_email: reg.operario_email || reg.activo_operario_email,
              fecha_registro_individual: reg.fecha_registro
            });
          }
        });
      });
    });
    
    setConsecutivosProcesados(Object.values(processedData));
  }, [inventariosAgrupados]);

  // ✅ MODIFICADO: Exportar con bodega incluida en el nombre del archivo
  const exportarConsecutivoExcel = useCallback((consecutivoKey) => {
    const consecutivoData = consecutivosProcesados.find(
      row => `${row.consecutivo}_${row.bodega}` === consecutivoKey
    );
    
    if (!consecutivoData || !consecutivoData.productos || consecutivoData.productos.length === 0) {
      toast.error("No hay datos para exportar para este consecutivo y bodega.");
      return;
    }

    const excelRows = consecutivoData.productos
      .filter(producto => parseFloat(producto.conteo_cantidad) > 0)
      .map(producto => ({
        NRO_INVENTARIO_BODEGA: consecutivoData.consecutivo ?? "",
        ITEM: producto.item ?? "",
        BODEGA: producto.bodega ?? "",
        CANT_11ENT_PUNTO_4DECIMALES: formatQuantity(producto.conteo_cantidad),
      }));

    if (excelRows.length === 0) {
      toast.info(`No hay productos con conteo registrado (> 0) para el consecutivo #${consecutivoData.consecutivo} en bodega ${consecutivoData.bodega}.`);
      return;
    }

    const ws = XLSX.utils.json_to_sheet(excelRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Físico");
    
    // ✅ CAMBIO: Nombre de archivo incluye bodega
    XLSX.writeFile(wb, `inventario_${consecutivoData.consecutivo}_${consecutivoData.bodega}_${new Date().toISOString().split('T')[0]}.xlsx`);

    toast.success(`Datos del consecutivo #${consecutivoData.consecutivo} (Bodega: ${consecutivoData.bodega}) exportados correctamente.`);
  }, [consecutivosProcesados, formatQuantity]);

  // ✅ MODIFICADO: Manejar selección usando clave compuesta
  const handleConsecutivoClick = useCallback((consecutivoKey) => {
    setSelectedConsecutivo(consecutivoKey);
  }, []);

  const handleRefreshClick = async () => {
    setLoadingRefresh(true);
    if (onRefreshData) {
      await onRefreshData();
    }
    setLoadingRefresh(false);
    toast.info("🔄 Datos de inventario actualizados.");
  };

  // ✅ MODIFICADO: Filtrar por consecutivo o bodega
  const filteredConsecutivos = consecutivosProcesados.filter(consec => {
    if (!searchTerm) return true;
    const searchLower = searchTerm.trim().toLowerCase();
    return consec.consecutivo.toString().includes(searchLower) || 
           consec.bodega.toLowerCase().includes(searchLower);
  });

  const clearFilters = () => {
    setSearchTerm("");
    setDisplayedCount(10);
  };

  const displayedConsecutivos = filteredConsecutivos.slice(0, displayedCount);

  const handleLoadMore = () => {
    setDisplayedCount(prev => prev + 10);
  };

  const totalConsecutivos = filteredConsecutivos.length;
  const totalProducts = filteredConsecutivos.reduce((sum, c) => sum + c.productos.length, 0);

  const calculateStats = useCallback((productos) => {
    const totalQuantity = productos.reduce((sum, p) => sum + parseFloat(p.conteo_cantidad || 0), 0);
    const uniqueItems = new Set(productos.map(p => p.item)).size;
    return { totalQuantity, uniqueItems, totalProducts: productos.length };
  }, []);

  return (
    <div className="export-cf-panel-container">
      {/* Header with stats */}
      <div className="export-cf-panel-header">
        <h2>Gestión de Inventarios por Consecutivo y Bodega</h2>
        <div className="export-cf-summary-stats">
          <div className="export-cf-stat-card">
            <div className="export-cf-stat-icon">
              <Package size={24} />
            </div>
            <div className="export-cf-stat-content">
              <span className="export-cf-stat-value">{totalConsecutivos}</span>
              <span className="export-cf-stat-label">Inventarios</span>
            </div>
          </div>
          <div className="export-cf-stat-card">
            <div className="export-cf-stat-icon">
              <TrendingUp size={24} />
            </div>
            <div className="export-cf-stat-content">
              <span className="export-cf-stat-value">{totalProducts}</span>
              <span className="export-cf-stat-label">Productos Total</span>
            </div>
          </div>
        </div>
        <button
          onClick={handleRefreshClick}
          className="export-cf-refresh-button"
          disabled={loadingRefresh}
          title="Recargar datos"
        >
          <RefreshCcw size={20} className={loadingRefresh ? 'export-cf-spin' : ''} />
          {loadingRefresh ? "Actualizando..." : "Recargar"}
        </button>
      </div>

      {/* Split Panel Layout */}
      <div className="export-cf-split-panel-layout">
        {/* Left Sidebar */}
        <div className="export-cf-left-sidebar">
          {/* Search Filter */}
          <div className="export-cf-sidebar-filters">
            <div className="export-cf-search-input-wrapper">
              <Search size={18} className="export-cf-search-icon" />
              <input
                type="text"
                placeholder="Buscar por consecutivo o bodega..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="export-cf-search-input"
              />
            </div>

            {searchTerm && (
              <button onClick={clearFilters} className="export-cf-clear-button-compact">
                <X size={14} />
                Limpiar búsqueda
              </button>
            )}

            {filteredConsecutivos.length > 0 && (
              <div className="export-cf-results-count">
                {filteredConsecutivos.length} inventario{filteredConsecutivos.length !== 1 ? 's' : ''} encontrado{filteredConsecutivos.length !== 1 ? 's' : ''}
              </div>
            )}
          </div>

          {/* Consecutivos List */}
          <div className="export-cf-consecutivos-list-sidebar">
            {filteredConsecutivos.length === 0 ? (
              <div className="export-cf-empty-state-compact">
                <Package size={32} />
                <p>{searchTerm ? 'No se encontraron inventarios' : 'No hay inventarios'}</p>
              </div>
            ) : (
              <>
                {displayedConsecutivos.map((consecutivoItem) => {
                  const stats = calculateStats(consecutivoItem.productos);
                  // ✅ CAMBIO: Usar clave compuesta para identificación
                  const itemKey = `${consecutivoItem.consecutivo}_${consecutivoItem.bodega}`;
                  const isSelected = selectedConsecutivo === itemKey;
                  
                  return (
                    <div
                      key={itemKey}
                      className={`export-cf-consecutivo-card-compact ${isSelected ? 'export-cf-selected' : ''}`}
                      onClick={() => handleConsecutivoClick(itemKey)}
                    >
                      <div className="export-cf-card-compact-header">
                        <div className="export-cf-consecutivo-number">
                          <Package size={16} />
                          <span>#{consecutivoItem.consecutivo}</span>
                        </div>
                        <span className="export-cf-product-count-badge">{consecutivoItem.productos.length}</span>
                      </div>
                      {/* ✅ NUEVO: Mostrar bodega en la tarjeta */}
                      <div className="export-cf-card-bodega-tag">
                        📦 {consecutivoItem.bodega}
                      </div>
                      <div className="export-cf-card-compact-meta">
                        <span className="export-cf-meta-date">
                          {new Date(consecutivoItem.fecha_creacion).toLocaleDateString("es-CO", {
                            day: '2-digit',
                            month: 'short'
                          })}
                        </span>
                        <span className="export-cf-meta-items">{stats.uniqueItems} items</span>
                      </div>
                    </div>
                  );
                })}
                
                {displayedCount < filteredConsecutivos.length && (
                  <button onClick={handleLoadMore} className="export-cf-load-more-compact">
                    <Plus size={16} />
                    Cargar más ({filteredConsecutivos.length - displayedCount})
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        {/* Right Detail Panel */}
        <div className="export-cf-right-detail-panel">
          {!selectedConsecutivo ? (
            <div className="export-cf-detail-empty-state">
              <Package size={64} />
              <h3>Selecciona un inventario</h3>
              <p>Haz clic en una tarjeta de la izquierda para ver los detalles</p>
            </div>
          ) : (() => {
            const consecutivoData = consecutivosProcesados.find(
              c => `${c.consecutivo}_${c.bodega}` === selectedConsecutivo
            );
            if (!consecutivoData) return null;
            
            const stats = calculateStats(consecutivoData.productos);
            
            return (
              <div className="export-cf-detail-content">
                {/* Detail Header */}
                <div className="export-cf-detail-header">
                  <div className="export-cf-detail-title-section">
                    <h2>
                      <Package size={24} />
                      Consecutivo #{consecutivoData.consecutivo}
                    </h2>
                    {/* ✅ NUEVO: Mostrar bodega en el detalle */}
                    <div className="export-cf-detail-bodega-badge">
                      📦 Bodega: <strong>{consecutivoData.bodega}</strong>
                    </div>
                    <p className="export-cf-detail-date">
                      {new Date(consecutivoData.fecha_creacion).toLocaleDateString("es-CO", {
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit"
                      })}
                    </p>
                  </div>
                  <button
                    className="export-cf-export-button-detail"
                    onClick={() => exportarConsecutivoExcel(selectedConsecutivo)}
                  >
                    <Download size={18} />
                    Exportar Excel
                  </button>
                </div>

                {/* Statistics Cards */}
                <div className="export-cf-detail-stats-grid">
                  <div className="export-cf-detail-stat-card">
                    <span className="export-cf-stat-card-label">Total Items Únicos</span>
                    <span className="export-cf-stat-card-value">{stats.uniqueItems}</span>
                  </div>
                  <div className="export-cf-detail-stat-card">
                    <span className="export-cf-stat-card-label">Total Registros</span>
                    <span className="export-cf-stat-card-value">{stats.totalProducts}</span>
                  </div>
                  <div className="export-cf-detail-stat-card">
                    <span className="export-cf-stat-card-label">Cantidad Total</span>
                    <span className="export-cf-stat-card-value">{formatQuantity(stats.totalQuantity)}</span>
                  </div>
                </div>

                {/* Products Table */}
                <div className="export-cf-detail-table-section">
                  <h3>Detalle de Productos ({consecutivoData.productos.length})</h3>
                  <div className="export-cf-table-wrapper-detail">
                    <table className="export-cf-products-table-detail">
                      <thead>
                        <tr>
                          <th>ITEM</th>
                          <th>CANTIDAD</th>
                          <th>OPERARIO</th>
                          <th>ZONA</th>
                          <th>FECHA</th>
                        </tr>
                      </thead>
                      <tbody>
                        {consecutivoData.productos.map((producto, idx) => (
                          <tr key={idx}>
                            <td className="export-cf-font-mono">{producto.item}</td>
                            <td className="export-cf-text-right export-cf-font-semibold">
                              {formatQuantity(producto.conteo_cantidad)}
                            </td>
                            <td>{producto.operario_email || "N/A"}</td>
                            <td>{producto.descripcion_zona || "N/A"}</td>
                            <td className="export-cf-font-small">
                              {new Date(producto.fecha_registro_individual).toLocaleString("es-CO", {
                                timeZone: "America/Bogota",
                                month: "2-digit",
                                day: "2-digit",
                                hour: "2-digit",
                                minute: "2-digit"
                              })}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            );
          })()}
        </div>
      </div>
    </div>
  );
};

export default ExportCarnesYfruver;