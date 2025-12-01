import React, { useState, useEffect, useRef } from "react";
import { toast } from "react-toastify";
import { FaTrashAlt, FaSearch } from "react-icons/fa";
import Swal from "sweetalert2";
import "./BusquedaDescripcion.css";

function BusquedaDescripcion({
  zonaId,
  inventarioId,
  consecutivo,
  sede,
  user,
  itemsPermitidos,
  ubicacion, // ✅ NUEVO: Agregar ubicación como prop
  setTotalEscaneados,
  finalizarZona,
  setLoading,
  loading,
}) {
  const [searchTerm, setSearchTerm] = useState("");
  const [resultados, setResultados] = useState([]);
  const [productoSeleccionado, setProductoSeleccionado] = useState(null);
  const [cantidad, setCantidad] = useState("1");
  const [historial, setHistorial] = useState([]);
  const searchInputRef = useRef(null);

  useEffect(() => {
    if (zonaId) {
      obtenerHistorial();
    }
    searchInputRef.current?.focus();
  }, [zonaId]);

  const buscarProductos = async (termino) => {
    if (!termino || termino.length < 2) {
      setResultados([]);
      return;
    }

    try {
      const res = await fetch(
        `https://backend-inventario.vercel.app/api/operario/buscar-por-descripcion?consecutivo=${consecutivo}&sede=${encodeURIComponent(sede)}&descripcion=${encodeURIComponent(termino)}`
      );
      const data = await res.json();
      
      if (data.success) {
        setResultados(data.productos || []);
      } else {
        toast.error(data.message || "Error en la búsqueda");
        setResultados([]);
      }
    } catch (error) {
      console.error("Error buscando productos:", error);
      toast.error("Error de red al buscar productos");
      setResultados([]);
    }
  };

  const handleSearchChange = (e) => {
    const value = e.target.value;
    setSearchTerm(value);
    buscarProductos(value);
  };

  const seleccionarProducto = (producto) => {
    setProductoSeleccionado(producto);
    setSearchTerm(producto.descripcion);
    setResultados([]);
  };

  const registrarProducto = async () => {
    if (!productoSeleccionado) {
      toast.error("Selecciona un producto primero");
      return;
    }

    const itemAValidarNumerico = parseInt(productoSeleccionado.item, 10);
    const itemsPermitidosNumericos = new Set(Array.from(itemsPermitidos).map(item => parseInt(item, 10)));
    
    if (!itemsPermitidosNumericos.has(itemAValidarNumerico)) {
      toast.error(`"${productoSeleccionado.descripcion}" no pertenece a este inventario.`);
      return;
    }

    const cantidadNumerica = parseFloat(cantidad) || 1;

    try {
      setLoading(true);
      const resRegistro = await fetch("https://backend-inventario.vercel.app/api/operario/registrar-escaneo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          zona_id: zonaId,
          // ✅ CAMBIO: Si no hay código de barras real, enviar null en lugar de ITEM_xxx
          codigo_barras: productoSeleccionado.codigo_barras || null, // Cambiado de `ITEM_${item}` a null
          cantidad: cantidadNumerica,
          inventario_id: inventarioId,
          usuario_email: user.email,
          item_id: productoSeleccionado.item,
          ubicacion: ubicacion || 'punto_venta' // ✅ NUEVO: Enviar ubicación
        }),
      });
      
      const jsonRegistro = await resRegistro.json();
      if (!resRegistro.ok || !jsonRegistro.success) {
        throw new Error(jsonRegistro.message || "Error al guardar el conteo.");
      }
      
      toast.success(`✅ ${productoSeleccionado.descripcion} (x${cantidadNumerica}) registrado!`);
      await obtenerHistorial();
      
      // Limpiar formulario
      setProductoSeleccionado(null);
      setSearchTerm("");
      setCantidad("1");
      searchInputRef.current?.focus();
    } catch (error) {
      toast.error(`❌ Error: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const obtenerHistorial = async () => {
    if (!inventarioId || !zonaId) return;
    try {
      const res = await fetch(`https://backend-inventario.vercel.app/api/operario/historial/${inventarioId}`);
      const json = await res.json();
      if (json.success && Array.isArray(json.historial)) {
        const historialDeMiZona = json.historial.filter(detalle => detalle.zona_id === zonaId);
        setHistorial(historialDeMiZona);
        const total = historialDeMiZona.reduce((sum, item) => sum + (parseFloat(item.cantidad) || 0), 0);
        setTotalEscaneados(total);
      }
    } catch (e) {
      console.error("Error en obtenerHistorial:", e);
      toast.error("No se pudo cargar el historial de la zona.");
    }
  };

  const handleEliminarRegistro = async (id) => {
    const result = await Swal.fire({
      title: '¿Estás seguro?',
      text: "Esta acción no se puede deshacer.",
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Sí, ¡elimínalo!',
      cancelButtonText: 'Cancelar',
    });
    
    if (result.isConfirmed) {
      setLoading(true);
      try {
        const res = await fetch(`https://backend-inventario.vercel.app/api/operario/detalle-inventario/${id}`, { method: 'DELETE' });
        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(data.message || "Error al eliminar.");
        toast.success("✅ Registro eliminado.");
        await obtenerHistorial();
      } catch (error) {
        toast.error(`❌ Error: ${error.message}`);
      } finally {
        setLoading(false);
      }
    }
  };

  return (
    <div className="busq-desc-container">
      <div className="busq-desc-banner">
        <h3 className="busq-desc-banner-title">
          📝 Modo de Búsqueda por Descripción
        </h3>
        <p className="busq-desc-banner-text">
          Escribe el nombre del producto que deseas contar, selecciónalo de la lista y registra la cantidad.
        </p>
      </div>

      <div className="busq-desc-search-section">
        <label className="busq-desc-label" htmlFor="busq-desc-search-input">
          🔍 Buscar Producto por Descripción
        </label>
        <div className="busq-desc-input-wrapper">
          <FaSearch className="busq-desc-search-icon" />
          <input
            id="busq-desc-search-input"
            ref={searchInputRef}
            type="text"
            value={searchTerm}
            onChange={handleSearchChange}
            placeholder="Escribe el nombre del producto... (ej: Leche, Arroz, etc.)"
            className="busq-desc-input"
            disabled={loading}
            autoFocus
          />
        </div>

        {searchTerm.length > 0 && searchTerm.length < 2 && (
          <p className="busq-desc-hint">
            Escribe al menos 2 caracteres para buscar...
          </p>
        )}

        {resultados.length > 0 && (
          <div className="busq-desc-resultados">
            <div className="busq-desc-resultados-header">
              {resultados.length} {resultados.length === 1 ? 'resultado encontrado' : 'resultados encontrados'}
            </div>
            {resultados.map((producto) => (
              <div
                key={producto.item}
                className="busq-desc-resultado-item"
                onClick={() => seleccionarProducto(producto)}
              >
                <div className="busq-desc-resultado-header">
                  <strong className="busq-desc-resultado-nombre">{producto.descripcion}</strong>
                  <span className="busq-desc-item-badge">Item: {producto.item}</span>
                </div>
                {producto.codigo_barras && (
                  <small className="busq-desc-codigo">Código: {producto.codigo_barras}</small>
                )}
              </div>
            ))}
          </div>
        )}

        {searchTerm.length >= 2 && resultados.length === 0 && !loading && (
          <div className="busq-desc-no-results">
            <p className="busq-desc-no-results-title">
              ❌ No se encontraron productos con "<strong>{searchTerm}</strong>"
            </p>
            <p className="busq-desc-no-results-hint">
              Intenta con otro nombre o verifica la ortografía.
            </p>
          </div>
        )}
      </div>

      {productoSeleccionado && (
        <div className="busq-desc-producto-seleccionado">
          <h4 className="busq-desc-selected-title">✅ Producto Seleccionado:</h4>
          <p className="busq-desc-selected-name">
            {productoSeleccionado.descripcion}
          </p>
          <p className="busq-desc-selected-item">
            <strong>Item:</strong> {productoSeleccionado.item}
          </p>
          
          <div className="busq-desc-cantidad-section">
            <label className="busq-desc-label" htmlFor="busq-desc-cantidad-input">
              📦 Cantidad a Registrar
            </label>
            <input
              id="busq-desc-cantidad-input"
              type="number"
              min="0.01"
              step="0.01"
              value={cantidad}
              onChange={(e) => setCantidad(e.target.value)}
              className="busq-desc-cantidad-input"
              disabled={loading}
              autoFocus
            />
          </div>

          <button
            onClick={registrarProducto}
            disabled={loading}
            className="busq-desc-registrar-btn"
          >
            ✅ Registrar Producto
          </button>

          <button
            onClick={() => {
              setProductoSeleccionado(null);
              setSearchTerm("");
              setCantidad("1");
              searchInputRef.current?.focus();
            }}
            disabled={loading}
            className="busq-desc-cancel-btn"
          >
            ❌ Cancelar Selección
          </button>
        </div>
      )}

      {historial.length > 0 && (
        <div className="busq-desc-historial-section">
          <h3 className="busq-desc-historial-title">Historial Reciente</h3>
          <ul className="busq-desc-historial-list">
            {historial.slice(0, 100).map((h) => (
              <li key={h.id} className="busq-desc-historial-item">
                <span className="busq-desc-historial-description">
                  {h.producto.descripcion || 'Producto sin descripción'} (x{h.cantidad})
                </span>
                <button
                  onClick={() => handleEliminarRegistro(h.id)}
                  className="busq-desc-delete-btn"
                  aria-label={`Eliminar registro ${h.producto.descripcion}`}
                >
                  <FaTrashAlt />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="busq-desc-actions-group">
        <button
          onClick={() => finalizarZona()}
          disabled={loading || historial.length === 0}
          className="busq-desc-finish-btn"
        >
          Finalizar Zona
        </button>
      </div>
    </div>
  );
}

export default BusquedaDescripcion;


