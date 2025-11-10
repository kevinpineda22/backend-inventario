import React, { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { toast } from "react-toastify";
import { FaTrashAlt } from "react-icons/fa";
import Swal from "sweetalert2";
import { supabase } from "../supabaseClient";
import "./Camara.css";

const unidadMedidaOptions = {
  UND: 1, P2: 2, P3: 3, P4: 4, P5: 5, P6: 6, P7: 7, P8: 8, P9: 9, P10: 10,
  P12: 12, P13: 13, P14: 14, P15: 15, P20: 20, P24: 24, P25: 25, P28: 28,
  P30: 30, P40: 40, P48: 48, P50: 50, P54: 54, P60: 60, P84: 84, P100: 100,
};

function CamaraScanner({
  inventarioId,
  zonaId,
  user,
  itemsPermitidos,
  ubicacion, // ✅ NUEVO: Agregar ubicación como prop
  setTotalEscaneados,
  finalizarZona,
  setLoading,
  loading,
}) {
  const [lastScanned, setLastScanned] = useState(null);
  const [cantidadMultiplicador, setCantidadMultiplicador] = useState("1");
  const [historial, setHistorial] = useState([]);
  const [error, setError] = useState("");
  const [unidadesDisponibles, setUnidadesDisponibles] = useState([]);
  const [selectedBarcode, setSelectedBarcode] = useState("");
  const [pendingProduct, setPendingProduct] = useState(null);
  const [loadingHistorial, setLoadingHistorial] = useState(true);
  const scannerRef = useRef(null);
  const html5QrCodeRef = useRef(null);
  const isScanning = useRef(false);
  const scannerInfoRef = useRef(null);

  useEffect(() => {
    console.log("Props recibidas en CamaraScanner:", { inventarioId, zonaId, user });
    if (scannerRef.current) iniciarEscaner();
    return () => detenerEscaner();
  }, [inventarioId]);

  useEffect(() => {
    console.log("useEffect para historial", { inventarioId, zonaId, user: user?.email });
    setLoadingHistorial(true);
    if (inventarioId && zonaId && user?.email) {
      obtenerHistorial();
    } else {
      console.warn("Faltan datos para cargar historial", { inventarioId, zonaId, user });
      setLoadingHistorial(false);
    }
  }, [inventarioId, zonaId, user]);

  useEffect(() => {
    if (lastScanned && scannerInfoRef.current) {
      scannerInfoRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [lastScanned]);

  const iniciarEscaner = () => {
    setError("");
    scannerRef.current.innerHTML = "";
    const readerId = scannerRef.current.id || "reader";
    scannerRef.current.id = readerId;
    const html5QrCode = new Html5Qrcode(readerId);
    html5QrCodeRef.current = html5QrCode;

    const procesarEscaneo = async (codigoEscaneado) => {
      if (isScanning.current || !codigoEscaneado || loading || pendingProduct) return;
      isScanning.current = true;
      setLoading(true);
      setLastScanned({ codigo: codigoEscaneado, descripcion: "Buscando...", item: "..." });
      setUnidadesDisponibles([]);
      setSelectedBarcode("");

      try {
        console.log("Escaneando código:", codigoEscaneado);
        const resMaestro = await fetch(
          `https://backend-inventario.vercel.app/api/maestro/producto-maestro/${codigoEscaneado}`
        );
        const dataMaestro = await resMaestro.json();
        if (!resMaestro.ok || !dataMaestro.success || !dataMaestro.producto) {
          toast.error(`❌ Código "${codigoEscaneado}" no reconocido.`);
          setLastScanned({ codigo: codigoEscaneado, descripcion: "No encontrado en BD Maestra", item: "N/A" });
          return;
        }

        const producto = dataMaestro.producto;
        const permitidos = new Set(Array.from(itemsPermitidos || []).map((i) => parseInt(i, 10)));
        if (!permitidos.has(parseInt(producto.item, 10))) {
          toast.error(`❌ "${producto.descripcion}" no pertenece a este inventario.`);
          setLastScanned({ codigo: codigoEscaneado, descripcion: "No permitido en este inventario", item: producto.item });
          return;
        }

        const unidades = dataMaestro.unidades || [];
        setUnidadesDisponibles(unidades);
        const esBarcodeValido = unidades.some((u) => u.codigo_barras === codigoEscaneado);
        const barcodeInicial = esBarcodeValido
          ? codigoEscaneado
          : unidades.length > 0
          ? unidades[0].codigo_barras
          : null;

        if (!barcodeInicial) {
          toast.error(`El producto ${producto.item} no tiene códigos de barras asociados.`);
          setLastScanned({ ...producto, codigo: codigoEscaneado, descripcion: "Sin códigos de barras" });
          return;
        }

        setSelectedBarcode(barcodeInicial);
        setPendingProduct({ producto, codigoBarras: barcodeInicial });
        setLastScanned({ ...producto, codigo: barcodeInicial });
      } catch (error) {
        toast.error(`❌ Error: ${error.message}`);
        setLastScanned((prev) => ({ ...prev, descripcion: "Error de registro" }));
      } finally {
        setLoading(false);
        setTimeout(() => {
          isScanning.current = false;
        }, 1500);
      }
    };

    html5QrCode
      .start(
        { facingMode: "environment" },
        { fps: 10, disableFlip: false },
        procesarEscaneo,
        () => {}
      )
      .catch((err) => {
        console.error("Error al iniciar cámara:", err);
        setError("Error al iniciar la cámara. Revisa permisos.");
        setLoading(false);
      });
  };

  const detenerEscaner = async () => {
    if (html5QrCodeRef.current && html5QrCodeRef.current.isScanning) {
      try {
        await html5QrCodeRef.current.stop();
      } catch (e) {
        console.warn("Fallo al detener escáner:", e);
      }
    }
  };

  const registrarProductoValidado = async (producto, codigoBarrasParaRegistrar) => {
    const unidadSeleccionadaObj = unidadesDisponibles.find((u) => u.codigo_barras === codigoBarrasParaRegistrar);
    const nombreUnidad = unidadSeleccionadaObj ? unidadSeleccionadaObj.unidad_medida : "UND";
    const multiplicador = parseInt(cantidadMultiplicador) || 1;
    const factorUnidad = unidadMedidaOptions[nombreUnidad] || 1;
    const cantidadNumerica = factorUnidad * multiplicador;

    console.log("Calculando cantidad para registro:", {
      nombreUnidad,
      factorUnidad,
      cantidadMultiplicador,
      multiplicador,
      cantidadNumerica,
    });

    try {
      const payload = {
        zona_id: zonaId,
        codigo_barras: codigoBarrasParaRegistrar,
        cantidad: cantidadNumerica,
        inventario_id: inventarioId,
        usuario_email: user.email,
        item_id: producto.item,
        ubicacion: ubicacion || 'punto_venta' // ✅ NUEVO: Enviar ubicación
      };
      console.log("Payload enviado al backend:", payload);

      const resRegistro = await fetch(
        "https://backend-inventario.vercel.app/api/operario/registrar-escaneo",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      const jsonRegistro = await resRegistro.json();
      if (!resRegistro.ok || !jsonRegistro.success) {
        throw new Error(jsonRegistro.message || "Error al guardar el conteo.");
      }

      toast.success(`✅ ${producto.descripcion} (x${cantidadNumerica}) registrado!`);
      await obtenerHistorial();
    } catch (error) {
      toast.error(`❌ Error: ${error.message}`);
    } finally {
      setPendingProduct(null);
      setLastScanned(null);
      setCantidadMultiplicador("1"); // Reinicia cantidadMultiplicador a "1" después de registrar
    }
  };

  const obtenerHistorial = async () => {
    if (!inventarioId || !zonaId || !user?.email) {
      console.warn("No se puede cargar historial, datos incompletos", { inventarioId, zonaId, user });
      setLoadingHistorial(false);
      return;
    }
    try {
      console.log("Solicitando historial para inventarioId:", inventarioId);
      const res = await fetch(`https://backend-inventario.vercel.app/api/operario/historial/${inventarioId}`);
      if (!res.ok) throw new Error(`Error de red: ${res.status}`);
      const json = await res.json();
      console.log("Respuesta del backend:", json);
      if (json.success && Array.isArray(json.historial)) {
        json.historial.forEach((detalle) => {
          console.log("Detalle del historial:", {
            zona_id: detalle.zona_id,
            usuario_email: detalle.usuario_email,
            zonaId: zonaId,
            userEmail: user.email,
          });
        });
        const historialDeMiZona = json.historial.filter((detalle) => {
          const emailMatch = !detalle.usuario_email || detalle.usuario_email === user.email;
          return detalle.zona_id === zonaId && emailMatch;
        });
        console.log("Historial filtrado:", historialDeMiZona);
        setHistorial(historialDeMiZona);
        const total = historialDeMiZona.reduce((sum, item) => sum + (parseFloat(item.cantidad) || 0), 0);
        setTotalEscaneados(total);
      } else {
        throw new Error("Respuesta del backend no válida");
      }
    } catch (e) {
      console.error("Error obtenerHistorial:", e);
      toast.error("No se pudo cargar el historial de la zona.");
    } finally {
      setLoadingHistorial(false);
    }
  };

  const handleEliminarRegistro = async (id) => {
    const result = await Swal.fire({
      title: "¿Eliminar registro?",
      text: "Esta acción no se puede deshacer.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#d33",
      cancelButtonColor: "#3085d6",
      confirmButtonText: "Sí, eliminar",
      cancelButtonText: "Cancelar",
      customClass: { popup: "swal2-popup-custom" },
    });
    if (result.isConfirmed) {
      setLoading(true);
      try {
        const res = await fetch(
          `https://backend-inventario.vercel.app/api/operario/detalle-inventario/${id}`,
          { method: "DELETE" }
        );
        const json = await res.json();
        if (json.success) {
          toast.success("Registro eliminado.");
          await obtenerHistorial();
        } else {
          throw new Error(json.message);
        }
      } catch (e) {
        toast.error(`❌ ${e.message}`);
      } finally {
        setLoading(false);
      }
    }
  };

  const handleUnidadMedidaChange = (e) => {
    const newValue = e.target.value;
    console.log("Antes de actualizar selectedBarcode:", { current: selectedBarcode, newValue });
    setSelectedBarcode(newValue);
    console.log("Después de actualizar selectedBarcode:", { updated: newValue });
  };

  const handleCantidadChange = (e) => {
    const newValue = e.target.value;
    console.log("Antes de actualizar cantidadMultiplicador:", { current: cantidadMultiplicador, newValue });
    setCantidadMultiplicador(newValue);
    console.log("Después de actualizar cantidadMultiplicador:", { updated: newValue });
  };

  const handleConfirmarRegistro = () => {
    if (pendingProduct) {
      registrarProductoValidado(pendingProduct.producto, pendingProduct.codigoBarras);
    }
  };

  const handleCancelarRegistro = () => {
    setPendingProduct(null);
    setLastScanned(null);
    toast.info("Registro cancelado.");
  };

  return (
    <div className="cs-scanner-container">
      <div className="cs-scanner-video-wrapper">
        <div id="reader" ref={scannerRef}></div>
        <div className="cs-scanner-overlay">
          <div className="cs-scanner-target"></div>
        </div>
        {error && <p className="cs-scanner-error-message">{error}</p>}
      </div>

      <div className="cs-input-group">
        <div className="cs-input-field">
          <label className="cs-input-label" htmlFor="cs-unit-select">
            Unidad de Empaque
          </label>
          <select
            id="cs-unit-select"
            value={selectedBarcode}
            onChange={handleUnidadMedidaChange}
            className="cs-input-select"
            disabled={loading || unidadesDisponibles.length === 0 || pendingProduct !== null}
            aria-describedby="cs-unit-help"
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
          <p id="cs-unit-help" className="cs-unit-help">
            Selecciona la unidad de medida para el conteo.
          </p>
        </div>
        <div className="cs-input-field">
          <label className="cs-input-label" htmlFor="cs-multiplier-input">
            Cantidad por Escaneo
          </label>
          <input
            id="cs-multiplier-input"
            type="number"
            value={cantidadMultiplicador}
            onChange={handleCantidadChange}
            min="1"
            className="cs-input-text"
            placeholder="Ej: 1"
            disabled={loading}
            aria-describedby="cs-multiplier-help"
          />
          <p id="cs-multiplier-help" className="cs-multiplier-help">
            Ingresa el número de unidades a multiplicar.
          </p>
        </div>
      </div>

      {lastScanned && (
        <div ref={scannerInfoRef} className={`cs-scanner-info ${pendingProduct ? 'pending' : ''}`}>
          <p>
            <strong>Código:</strong> {lastScanned.codigo} <br />
            <strong>Descripción:</strong> {lastScanned.descripcion} <br />
            <strong>Item:</strong> {lastScanned.item}
          </p>
          {pendingProduct && (
            <>
              <p>
                <strong>Unidad:</strong>{" "}
                {unidadesDisponibles.find((u) => u.codigo_barras === pendingProduct.codigoBarras)?.unidad_medida || "UND"}
              </p>
              <p>
                <strong>Cantidad:</strong>{" "}
                {(unidadMedidaOptions[
                  unidadesDisponibles.find((u) => u.codigo_barras === pendingProduct.codigoBarras)?.unidad_medida || "UND"
                ] || 1) * (parseInt(cantidadMultiplicador) || 1)}
              </p>
              <div className="cs-scanner-acciones">
                <button className="cs-confirmacion-btn-registrar" onClick={handleConfirmarRegistro}>
                  Registrar
                </button>
                <button className="cs-confirmacion-btn-cancelar" onClick={handleCancelarRegistro}>
                  Cancelar
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {loadingHistorial ? (
        <div className="cs-history-section">
          <p>Cargando historial...</p>
        </div>
      ) : historial.length > 0 ? (
        <div className="cs-history-section">
          <div className="cs-history-header">
            <h3 className="cs-history-title">Historial Reciente ({historial.length})</h3>
          </div>
          <ul className="cs-history-list">
            {historial.map((h) => {
              const fechaValida = h.fecha_escaneo && !isNaN(new Date(h.fecha_escaneo));
              return (
                <li key={h.id} className="cs-history-item">
                  <div className="cs-history-item-content">
                    <span className="cs-history-item-time">
                      {fechaValida ? `${new Date(h.fecha_escaneo).toLocaleTimeString("es-CO")} - ` : ""}
                    </span>
                    <span className="cs-history-item-desc">
                      {h.producto.descripcion || "Producto sin descripción"}
                    </span>
                    <span className="cs-history-item-quantity">
                      (x{h.cantidad})
                    </span>
                  </div>
                  <button
                    onClick={() => handleEliminarRegistro(h.id)}
                    className="cs-delete-btn"
                    disabled={loading}
                    aria-label={`Eliminar registro ${h.producto.descripcion}`}
                  >
                    <FaTrashAlt />
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : (
        <div className="cs-history-section">
          <p>No hay historial disponible.</p>
        </div>
      )}

      <div className="cs-button-group">
        <button
          onClick={() => finalizarZona(historial)}
          disabled={loading || historial.length === 0 || pendingProduct !== null}
          className="cs-finish-inventory-btn"
          aria-label="Finalizar inventario"
        >
          Finalizar Inventario
        </button>
      </div>
    </div>
  );
}

export default CamaraScanner;