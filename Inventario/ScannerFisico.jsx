import React, { useEffect, useRef, useState } from "react";
import { toast } from "react-toastify";
import { FaTrashAlt } from "react-icons/fa";
import Swal from "sweetalert2";
import { gsap } from "gsap";
import { supabase } from "../supabaseClient";
import "./ScannerFisico.css";

const unidadMedidaOptions = {
  UND: 1, P2: 2, P3: 3, P4: 4, P5: 5, P6: 6, P7: 7, P8: 8, P9: 9, P10: 10,
  P12: 12, P13: 13, P14: 14, P15: 15, P20: 20, P24: 24, P25: 25, P28: 28,
  P30: 30, P40: 40, P48: 48, P50: 50, P54: 54, P60: 60, P84: 84, P100: 100,
};

function LectorScanner({
  zonaId,
  inventarioId,
  user,
  itemsPermitidos,
  consecutivo,
  sede, // ✅ Agregar sede como prop
  setTotalEscaneados,
  finalizarZona,
  setLoading,
  loading,
}) {
  // El estado inicial del multiplicador es "0" por defecto.
  const [cantidadMultiplicador, setCantidadMultiplicador] = useState("0");
  
  const [lastScanned, setLastScanned] = useState({ codigo: '', descripcion: '', item: '' });
  const [historial, setHistorial] = useState([]);
  const [unidadesDisponibles, setUnidadesDisponibles] = useState([]);
  const [selectedBarcode, setSelectedBarcode] = useState('');
  
  const mainInputRef = useRef(null);
  const multiplierInputRef = useRef(null);
  const historialRef = useRef(null);
  const scannerInfoRef = useRef(null);

  const scanBuffer = useRef("");
  const scanTimeout = useRef(null);

  useEffect(() => {
    const handleGlobalKeyDown = (e) => {
      // Ignora la captura si el foco está en el campo de multiplicador
      if (document.activeElement === multiplierInputRef.current) {
        return;
      }

      if (e.key === "Enter") {
        if (scanBuffer.current.length > 4) {
          procesarCodigo(scanBuffer.current);
        }
        scanBuffer.current = "";
        e.preventDefault();
        return;
      }
      
      // Lógica estricta: solo captura letras y números de un solo caracter.
      // Previene la captura de "Unidentified", "Shift", etc.
      if (/^[a-zA-Z0-9]$/.test(e.key)) {
        scanBuffer.current += e.key;
      }
      
      if (scanTimeout.current) {
        clearTimeout(scanTimeout.current);
      }
      scanTimeout.current = setTimeout(() => {
        scanBuffer.current = "";
      }, 100);
    };
    
    window.addEventListener('keydown', handleGlobalKeyDown);

    return () => {
      window.removeEventListener('keydown', handleGlobalKeyDown);
    };
  }, []);

  const handleMultiplierKeyDown = (e) => {
    e.preventDefault();

    if (e.key >= '0' && e.key <= '9') {
      setCantidadMultiplicador(prev => {
        // Lógica corregida: Si el valor es "0", lo reemplaza. Si no, lo concatena.
        // Esto permite componer CUALQUIER número, incluyendo 10, 12, etc.
        if (prev === '0') {
           return e.key;
        }
        return prev + e.key;
      });
    } else if (e.key === 'Backspace') {
      // Al borrar, si no quedan números, regresa a "0".
      setCantidadMultiplicador(prev => prev.slice(0, -1) || '0');
    } else if (e.key === 'Enter') {
      if (lastScanned.codigo && !loading) {
        registrarProducto(lastScanned, selectedBarcode);
      }
    }
  };

  useEffect(() => {
    if (zonaId) {
      obtenerHistorial();
    }
    mainInputRef.current?.focus();
  }, [zonaId]);

  const procesarCodigo = async (codigoEscaneado) => {
    if (!codigoEscaneado || loading) return;
    setLoading(true);
    setLastScanned({ codigo: codigoEscaneado, descripcion: 'Buscando...', item: '...' });
    setUnidadesDisponibles([]);
    setSelectedBarcode('');

    try {
      const resMaestro = await fetch(`https://backend-inventario.vercel.app/api/maestro/producto-maestro/${codigoEscaneado}`);
      if (!resMaestro.ok) {
        toast.error(`Error del servidor: ${resMaestro.status} - ${resMaestro.statusText}`);
        setLastScanned({ codigo: codigoEscaneado, descripcion: 'No encontrado en BD Maestra', item: 'N/A' });
        return;
      }
      const dataMaestro = await resMaestro.json();
      if (dataMaestro.matchType === 'exact') {
        const unidades = dataMaestro.unidades || [];
        setUnidadesDisponibles(unidades);
        const esBarcodeValido = unidades.some(u => u.codigo_barras === codigoEscaneado);
        const barcodeInicial = esBarcodeValido ? codigoEscaneado : (unidades.length > 0 ? unidades[0].codigo_barras : null);
        if (!barcodeInicial) {
          toast.error(`El producto ${dataMaestro.producto.item} no tiene códigos de barras asociados.`);
          setLastScanned({ ...dataMaestro.producto, descripcion: "Sin códigos de barras" });
          return;
        }
        setSelectedBarcode(barcodeInicial);
        setLastScanned({ ...dataMaestro.producto, codigo: barcodeInicial });
        multiplierInputRef.current?.focus();
      } else if (dataMaestro.matchType === 'similar') {
        const productoSeleccionado = await mostrarModalDeSugerencias(dataMaestro.sugerencias);
        if (productoSeleccionado) {
          await procesarCodigo(productoSeleccionado.codigo_barras);
        } else {
          setLastScanned({ codigo: codigoEscaneado, descripcion: 'Selección cancelada', item: 'N/A' });
          toast.info("Operación cancelada.");
        }
      } else {
        toast.error("Respuesta inesperada del servidor.");
      }
    } catch (error) {
      toast.error(`❌ Error de red o de código: ${error.message}`);
      setLastScanned(prev => ({ ...prev, descripcion: 'Error de registro' }));
    } finally {
      setLoading(false);
    }
  };

  const mostrarModalDeSugerencias = async (sugerencias) => {
    const inputOptions = new Map();
    sugerencias.forEach(sug => {
      inputOptions.set(JSON.stringify(sug), `${sug.descripcion} (Cód: ${sug.codigo_barras})`);
    });
    const { value: productoSeleccionadoString } = await Swal.fire({
      title: 'Código no encontrado, ¿quisiste decir?',
      input: 'radio',
      inputOptions,
      showCancelButton: true,
      confirmButtonText: 'Confirmar Selección',
      cancelButtonText: 'Cancelar',
      inputValidator: (value) => !value && '¡Debes elegir una opción!'
    });
    return productoSeleccionadoString ? JSON.parse(productoSeleccionadoString) : null;
  };

  const registrarProducto = async (producto, codigoBarrasParaRegistrar) => {
    const itemAValidarNumerico = parseInt(producto.item, 10);
    const itemsPermitidosNumericos = new Set(Array.from(itemsPermitidos).map(item => parseInt(item, 10)));
    if (!itemsPermitidosNumericos.has(itemAValidarNumerico)) {
      toast.error(`"${producto.descripcion}" no pertenece al inventario #${consecutivo}.`);
      setLastScanned({ ...producto, codigo: codigoBarrasParaRegistrar, descripcion: `NO PERMITIDO EN INVENTARIO #${consecutivo}` });
      return;
    }
    const unidadSeleccionadaObj = unidadesDisponibles.find(u => u.codigo_barras === codigoBarrasParaRegistrar);
    const nombreUnidad = unidadSeleccionadaObj ? unidadSeleccionadaObj.unidad_medida : 'UND';
    // Si el usuario deja "0", lo tratamos como "1" para evitar registrar cero unidades.
    const multiplicador = parseInt(cantidadMultiplicador) || 1;
    const factorUnidad = unidadMedidaOptions[nombreUnidad] || 1;
    const cantidadNumerica = factorUnidad * multiplicador;

    try {
      setLoading(true);
      const resRegistro = await fetch("https://backend-inventario.vercel.app/api/operario/registrar-escaneo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          zona_id: zonaId,
          codigo_barras: codigoBarrasParaRegistrar,
          cantidad: cantidadNumerica,
          inventario_id: inventarioId,
          usuario_email: user.email,
          item_id: producto.item
        }),
      });
      const jsonRegistro = await resRegistro.json();
      if (!resRegistro.ok || !jsonRegistro.success) {
        throw new Error(jsonRegistro.message || "Error al guardar el conteo.");
      }
      toast.success(`✅ ${producto.descripcion} (x${cantidadNumerica}) registrado!`);
      await obtenerHistorial();
    } catch (error) {
      toast.error(`❌ Error: ${error.message}`);
    } finally {
      setLastScanned({ codigo: '', descripcion: '', item: '' });
      // Al terminar, el multiplicador se reinicia a "0".
      setCantidadMultiplicador("0");
      setUnidadesDisponibles([]);
      setSelectedBarcode('');
      mainInputRef.current?.focus();
      setLoading(false);
    }
  };

  const obtenerHistorial = async () => {
    if (!inventarioId || !zonaId) return;
    try {
      const res = await fetch(`https://backend-inventario.vercel.app/api/operario/historial/${inventarioId}`);
      if (!res.ok) throw new Error(`Error de red: ${res.status}`);
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
    <div className="lector-scanner-content">
      <div className="lector-input-group">
        <label className="lector-input-label" htmlFor="lector-main-input">Escanear Código</label>
        <input
          id="lector-main-input"
          ref={mainInputRef}
          type="text"
          autoFocus
          readOnly 
          placeholder="Esperando código del lector físico..."
          value={(lastScanned.codigo) || ''}
          className="lector-main-input"
        />
      </div>
      <div className="lector-controls-group">
        <div className="lector-unit-field">
          <label className="lector-unit-label" htmlFor="lector-unit-select">Unidad de Medida</label>
          <select
            id="lector-unit-select"
            value={selectedBarcode}
            onChange={(e) => setSelectedBarcode(e.target.value)}
            className="lector-unit-select"
            disabled={unidadesDisponibles.length === 0}
          >
            {unidadesDisponibles.length > 0 ? (
              unidadesDisponibles.map((unidad) => (
                <option key={unidad.codigo_barras} value={unidad.codigo_barras}>
                  {unidad.unidad_medida}
                </option>
              ))
            ) : (
              <option value="">Escanee un producto</option>
            )}
          </select>
        </div>
        <div className="lector-multiplier-field">
          <label className="lector-multiplier-label" htmlFor="lector-multiplier-input">Multiplicador</label>
          <input
            id="lector-multiplier-input"
            ref={multiplierInputRef}
            type="text"
            readOnly
            value={cantidadMultiplicador}
            onKeyDown={handleMultiplierKeyDown}
            className="lector-multiplier-input"
          />
        </div>
      </div>
      {lastScanned.codigo && (
        <div ref={scannerInfoRef} className="lector-scanner-info">
          <p className="lector-info-item">
            <span className="lector-info-label">Código:</span> {lastScanned.codigo}
          </p>
          <p className="lector-info-item">
            <span className="lector-info-label">Descripción:</span> {lastScanned.descripcion}
          </p>
          <p className="lector-info-item">
            <span className="lector-info-label">Item:</span> {lastScanned.item}
          </p>
          <p className="lector-info-item">
            <span className="lector-info-label">Unidad:</span> 
            {unidadesDisponibles.find(u => u.codigo_barras === selectedBarcode)?.unidad_medida || 'UND'}
          </p>
          <p className="lector-info-item">
            <span className="lector-info-label">Cantidad:</span> 
            {(unidadMedidaOptions[unidadesDisponibles.find(u => u.codigo_barras === selectedBarcode)?.unidad_medida || 'UND'] || 1) * (parseInt(cantidadMultiplicador) || 1)}
          </p>
        </div>
      )}
      {historial.length > 0 && (
        <div ref={historialRef} className="lector-history-section">
          <h3 className="lector-history-title">Historial Reciente</h3>
          <ul className="lector-history-list">
            {historial.slice(0, 100).map((h) => (
              <li key={h.id} className="lector-history-item">
                <span className="lector-history-description">
                  {h.producto.descripcion || 'Producto sin descripción'} (x{h.cantidad})
                </span>
                <button
                  onClick={() => handleEliminarRegistro(h.id)}
                  className="lector-delete-btn"
                  aria-label={`Eliminar registro ${h.producto.descripcion}`}
                >
                  <FaTrashAlt />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="lector-actions-group">
        <button
          onClick={() => finalizarZona()}
          disabled={loading || historial.length === 0}
          className="lector-finish-btn"
        >
          Finalizar Zona
        </button>
      </div>
    </div>
  );
}

export { LectorScanner };