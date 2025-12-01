import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { FaSearch, FaCalendarAlt, FaFilter, FaSync, FaMapMarkerAlt } from "react-icons/fa";
import "./FilterPanel.css";

const FilterPanel = ({
  showFilters,
  setShowFilters,
  filters,
  onFilterChange,
  onClearFilters,
  onRefresh,
  isRefreshing = false,
  totalRecords = 0,
  config = {},
  customActions = null,
  categoriasDisponibles = [],
  isLoadingCategorias = false,
  onReloadCategorias = null,
  showConsecutivo = false, // ✅ NUEVO: Prop para mostrar el campo de Consecutivo
  showSede = false // ✅ Nuevo prop
}) => {
  const defaultConfig = {
    showSearch: true,
    showCategory: false,
    showDateRange: true,
    showSorting: true,
    showItemsPerPage: false,
    searchPlaceholder: "Buscar...",
    categoryLabel: "Categoría",
    sortOptions: [
      { value: "fecha_inicio", label: "Fecha" },
      { value: "descripcion", label: "Descripción" },
      { value: "categoria", label: "Categoría" },
      { value: "consecutivo", label: "Consecutivo" }
    ],
    itemsPerPageOptions: [
      { value: 8, label: "8 por página" },
      { value: 12, label: "12 por página" },
      { value: 24, label: "24 por página" },
      { value: 48, label: "48 por página" }
    ]
  };

  const finalConfig = { ...defaultConfig, ...config };

  return (
    <div className="fp-container">
      <div className="fp-header">
        <h1 className="fp-title">
          {config.title}
          <span className="fp-records-count">({totalRecords} registros)</span>
        </h1>
        <div className="fp-header-actions">
          <button
            className={`fp-button ${showFilters ? 'fp-button-primary' : 'fp-button-outline'}`}
            onClick={() => setShowFilters(!showFilters)}
          >
            <FaFilter /> Filtros
          </button>
          {onRefresh && (
            <button
              className="fp-button fp-button-outline"
              onClick={onRefresh}
              disabled={isRefreshing}
            >
              {isRefreshing ? <div className="fp-spinner-small" /> : <FaSync />}
            </button>
          )}
          {customActions}
        </div>
      </div>

      <AnimatePresence>
        {showFilters && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="fp-filters-panel"
          >
            <div className="fp-filters-grid">
              {/* Búsqueda */}
              {finalConfig.showSearch && (
                <div className="fp-filter-group">
                  <label className="fp-filter-label">
                    <FaSearch /> Buscar
                  </label>
                  <input
                    type="text"
                    placeholder={finalConfig.searchPlaceholder}
                    value={filters.search || ""}
                    onChange={(e) => onFilterChange('search', e.target.value)}
                    className="fp-filter-input"
                  />
                </div>
              )}

              {/* ✅ NUEVO: Búsqueda por Consecutivo */}
              {showConsecutivo && (
                <div className="fp-filter-group">
                  <label className="fp-filter-label">
                    <FaSearch /> Consecutivo
                  </label>
                  <input
                    type="number"
                    placeholder="Buscar por consecutivo..."
                    value={filters.consecutivo || ""}
                    onChange={(e) => onFilterChange('consecutivo', e.target.value)}
                    className="fp-filter-input"
                  />
                </div>
              )}

              {/* ✅ NUEVO: Filtro por Sede */}
              {showSede && (
                <div className="fp-filter-group">
                  <label className="fp-filter-label">
                    <FaMapMarkerAlt /> Sede
                  </label>
                  <select
                    value={filters.sede || ""}
                    onChange={(e) => onFilterChange('sede', e.target.value)}
                    className="fp-filter-select"
                  >
                    <option value="">Todas las sedes</option>
                    <option value="Plaza">Plaza</option>
                    <option value="Villa Hermosa">Villa Hermosa</option>
                    <option value="Girardota Parque">Girardota Parque</option>
                    <option value="Llano">Llano</option>
                    <option value="Vegas">Vegas</option>
                    <option value="Barbosa">Barbosa</option>
                    <option value="San Juan">San Juan</option>
                  </select>
                </div>
              )}

              {/* Fecha única (para ConsecutivosDisponibles) */}
              {finalConfig.showSingleDate && (
                <div className="fp-filter-group">
                  <label className="fp-filter-label">
                    <FaCalendarAlt /> Fecha
                  </label>
                  <input
                    type="date"
                    value={filters.dateFilter || ""}
                    onChange={(e) => onFilterChange('dateFilter', e.target.value)}
                    className="fp-filter-input"
                  />
                </div>
              )}

              {/* Ordenamiento */}
              {finalConfig.showSorting && (
                <>
                  <div className="fp-filter-group">
                    <label className="fp-filter-label">Ordenar por</label>
                    <select
                      value={filters.sortBy || finalConfig.sortOptions[0]?.value}
                      onChange={(e) => onFilterChange('sortBy', e.target.value)}
                      className="fp-filter-select"
                    >
                      {finalConfig.sortOptions.map(option => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="fp-filter-group">
                    <label className="fp-filter-label">Orden</label>
                    <select
                      value={filters.sortOrder || "desc"}
                      onChange={(e) => onFilterChange('sortOrder', e.target.value)}
                      className="fp-filter-select"
                    >
                      <option value="desc">Descendente</option>
                      <option value="asc">Ascendente</option>
                    </select>
                  </div>
                </>
              )}

              {/* Items por página */}
              {finalConfig.showItemsPerPage && (
                <div className="fp-filter-group">
                  <label className="fp-filter-label">Items por página</label>
                  <select
                    value={filters.itemsPerPage || 12}
                    onChange={(e) => onFilterChange('itemsPerPage', parseInt(e.target.value))}
                    className="fp-filter-select"
                  >
                    {finalConfig.itemsPerPageOptions.map(option => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <div className="fp-filters-actions">
              <button onClick={onClearFilters} className="fp-button fp-button-secondary">
                Limpiar Filtros
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default FilterPanel;
