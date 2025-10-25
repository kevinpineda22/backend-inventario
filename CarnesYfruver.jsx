import React, { useEffect, useState, useRef, useCallback } from "react";
import { useSnackbar } from 'notistack';
import { FaTrashAlt } from "react-icons/fa";
import Swal from "sweetalert2";
import { gsap } from "gsap";
import * as XLSX from "xlsx";
import "./CarnesYfruver.css";

const BASE_URL = "https://backend-inventario.vercel.app/api/carnesyfruver";

function CarneoFruverScanner({
  inventarioId,
  setTotalEscaneados,
  finalizarZona,
  setLoading,
  loading,
  zonaId,
  bodega,
}) {
  const { enqueueSnackbar } = useSnackbar();
  const [productosDelGrupo, setProductosDelGrupo] = useState([]);
  const [productosFiltrados, setProductosFiltrados] = useState([]);
  const [inputBusqueda, setInputBusqueda] = useState("");
  const [productoSeleccionado, setProductoSeleccionado] = useState(null);

  // --- cantidad total (peso ingresado) ---
  const [cantidad, setCantidad] = useState("");

  // --- nuevos campos: conteos por empaques ---
  const [canas2kg, setCanas2kg] = useState("");        // cantidad de cañas 2.0 kg
  const [canasta18kg, setCanasta18kg] = useState("");  // cantidad de canasta 1.8 kg
  const [canasta16kg, setCanasta16kg] = useState("");  // cantidad de canasta 1.6 kg

  // canasta personalizada
  const [customQty, setCustomQty] = useState("");
  const [customWeight, setCustomWeight] = useState(""); // kg por unidad

  const [historial, setHistorial] = useState([]);
  const [grupoInventario, setGrupoInventario] = useState(null);
  const productInfoRef = useRef(null);
  const historialRef = useRef(null);
  const lastZonaIdRef = useRef(null);
  const [isSearchingByBarcode, setIsSearchingByBarcode] = useState(false);

  // ------- Valida consecutivo duplicado en backend -------
  const checkConsecutivoDuplicado = useCallback(async (consecutivo) => {
    try {
      const url = `${BASE_URL}/consecutivo-existe?consecutivo=${encodeURIComponent(
        String(consecutivo).trim()
      )}`;
      const res = await fetch(url);
      if (!res.ok) return false;
      const data = await res.json();
      return Boolean(data?.exists);
    } catch (e) {
      console.warn("No se pudo validar consecutivo:", e);
      return false; // No bloquea si hay fallo de red; el POST revalida
    }
  }, []);

  // Cargar productos del grupo (maestro_items)
  useEffect(() => {
    if (inventarioId) {
      setLoading(true);
      fetch(`${BASE_URL}/inventarios-carnesYfruver`)
        .then((res) => res.json())
        .then((data) => {
          if (data.success && Array.isArray(data.inventarios)) {
            const inventario = data.inventarios.find(
              (inv) =>
                String(inv.categoria).trim().toLowerCase() ===
                  String(inventarioId).trim().toLowerCase() ||
                String(inv.id).trim() === String(inventarioId).trim()
            );
            const grupo = inventario?.categoria || inventarioId;
            setGrupoInventario(grupo);
            return fetch(
              `${BASE_URL}/items-por-grupo?grupo=${encodeURIComponent(grupo)}`
            );
          } else {
            throw new Error("No se pudo obtener el inventario.");
          }
        })
        .then((res) => res.json())
        .then((maestroData) => {
          if (maestroData.success && Array.isArray(maestroData.items)) {
            setProductosDelGrupo(maestroData.items);
            setProductosFiltrados(maestroData.items);
          } else {
            enqueueSnackbar("❌ No se encontraron ítems para esta categoría.", { variant: 'error' });
            setGrupoInventario(null);
          }
        })
        .catch((err) => {
          enqueueSnackbar(`❌ Error: ${err.message}`, { variant: 'error' });
          setGrupoInventario(null);
        })
        .finally(() => setLoading(false));
    }
  }, [inventarioId, setLoading, enqueueSnackbar]);

  // Cargar productos ya registrados en la zona
  useEffect(() => {
    if (zonaId && zonaId !== lastZonaIdRef.current) {
      lastZonaIdRef.current = zonaId;
      const fetchProductos = async () => {
        setLoading(true);
        try {
          const operarioEmail = localStorage.getItem("correo_empleado");
          console.log(`📋 Cargando productos para zona ${zonaId}, operario: ${operarioEmail}`);

          const response = await fetch(`${BASE_URL}/productos-zona/${zonaId}`);
          const data = await response.json();
          if (data.success && Array.isArray(data.productos)) {
            // ✅ VALIDACIÓN ADICIONAL: Verificar que todos los productos pertenezcan al operario actual
            const productosInvalidos = data.productos.filter(prod => prod.operario_email !== operarioEmail);
            if (productosInvalidos.length > 0) {
              console.warn(`⚠️ Se encontraron ${productosInvalidos.length} productos que no pertenecen al operario actual`);
              console.warn('Productos inválidos:', productosInvalidos);
              enqueueSnackbar(
                `⚠️ Se detectaron productos de otros operarios en el historial. Refrescando datos...`,
                { variant: 'warning' }
              );
              // Filtrar solo los productos del operario actual
              data.productos = data.productos.filter(prod => prod.operario_email === operarioEmail);
            }

            // ✅ Usar datos del backend incluyendo desglose de canastas
            const historialFromDB = data.productos.map((prod) => ({
              id: prod.id,
              producto: {
                item_id: prod.item_id,
                descripcion: prod.item_id, // fallback - se actualizará después
              },
              cantidad: prod.cantidad,
              cantidad_total_ingresada: prod.cantidad_total_ingresada || prod.cantidad,
              canas_2kg: prod.canas_2kg || 0,
              canasta_1_8kg: prod.canasta_1_8kg || 0,
              canasta_1_6kg: prod.canasta_1_6kg || 0,
              custom_qty: prod.custom_qty || 0,
              custom_weight: prod.custom_weight || 0,
              inventarioId,
              zonaId,
            }));
            setHistorial(historialFromDB);
            const total = historialFromDB.reduce(
              (sum, prod) => sum + prod.cantidad,
              0
            );
            setTotalEscaneados(total);

            console.log(`✅ Cargados ${historialFromDB.length} productos válidos para zona ${zonaId}`);
          } else {
            enqueueSnackbar(
              `❌ Error al cargar productos: ${data.message || "Error desconocido"}`,
              { variant: 'error' }
            );
          }
        } catch (err) {
          enqueueSnackbar(`❌ Error de red al cargar productos: ${err.message}`, { variant: 'error' });
        } finally {
          setLoading(false);
        }
      };
      fetchProductos();
    }
  }, [zonaId, inventarioId, setTotalEscaneados, setLoading, enqueueSnackbar]);

  // Actualizar descripciones del historial cuando llegan los items del grupo
  useEffect(() => {
    if (productosDelGrupo.length > 0 && historial.length > 0) {
      setHistorial((prev) =>
        prev.map((item) => ({
          ...item,
          producto: {
            ...item.producto,
            descripcion:
              productosDelGrupo.find((p) => p.item_id === item.producto.item_id)
                ?.descripcion || item.producto.item_id,
          },
        }))
      );
    }
  }, [productosDelGrupo]); // eslint-disable-line react-hooks/exhaustive-deps

  // Filtrado para datalist (por descripción)
  useEffect(() => {
    if (!isSearchingByBarcode) {
      const filtrados = productosDelGrupo.filter((prod) =>
        prod.descripcion.toLowerCase().includes(inputBusqueda.toLowerCase())
      );
      setProductosFiltrados(filtrados);
    }
  }, [inputBusqueda, productosDelGrupo, isSearchingByBarcode]);

  // Buscar por código de barras
  const buscarProductoPorCodigo = useCallback(
    async (codigo) => {
      setLoading(true);
      setProductoSeleccionado(null);
      setIsSearchingByBarcode(true);
      try {
        const response = await fetch(
          `${BASE_URL}/producto-por-codigo?codigo=${encodeURIComponent(codigo)}`
        );
        const data = await response.json();

        if (data.success && data.producto) {
          const productoEnGrupo = productosDelGrupo.find(
            (p) => p.item_id === data.producto.item_id
          );
          if (productoEnGrupo) {
            setProductoSeleccionado(productoEnGrupo);
            setInputBusqueda(productoSeleccionado?.descripcion || productoEnGrupo.descripcion);
            enqueueSnackbar(
              `✅ Producto encontrado por código: ${productoEnGrupo.descripcion}`,
              { variant: 'success' }
            );
            return true;
          } else {
            enqueueSnackbar(
              "⚠️ Código de barras encontrado, pero el producto no pertenece a la categoría actual.",
              { variant: 'warning' }
            );
            return false;
          }
        } else {
          enqueueSnackbar(
            `❌ No se encontró producto con el código de barras "${codigo}".`,
            { variant: 'error' }
          );
        }
      } catch (err) {
        enqueueSnackbar(
          `❌ Error de red al buscar por código de barras: ${err.message}`,
          { variant: 'error' }
        );
      } finally {
        setLoading(false);
        setIsSearchingByBarcode(false);
      }
      return false;
    },
    [setLoading, productosDelGrupo, enqueueSnackbar, productoSeleccionado]
  );

  // Input búsqueda
  const handleInputChange = async (e) => {
    const valor = e.target.value;
    setInputBusqueda(valor);
    setProductoSeleccionado(null);
    setCantidad("");

    // si parece código de barras, intenta buscar
    if (valor.length >= 6 && !isNaN(Number(valor))) {
      const found = await buscarProductoPorCodigo(valor);
      if (found) return;
    }

    const producto = productosDelGrupo.find(
      (prod) => prod.descripcion.toLowerCase() === valor.toLowerCase()
    );
    setProductoSeleccionado(producto || null);
  };

  const handleInputBlur = () => {
    if (inputBusqueda && !productoSeleccionado) {
      if (!isSearchingByBarcode) {
        enqueueSnackbar(
          "⚠️ Por favor, selecciona un producto válido de la lista o verifica el código de barras.",
          { variant: 'warning' }
        );
      }
    }
  };

  // --- utilidad: calcular total kg de las canastas ingresadas ---
  const calcularTotalCanastas = () => {
    const nCanas2 = parseFloat(canas2kg) || 0;
    const nCanasta18 = parseFloat(canasta18kg) || 0;
    const nCanasta16 = parseFloat(canasta16kg) || 0;
    const nCustomQty = parseFloat(customQty) || 0;
    const wCustom = parseFloat(customWeight) || 0;

    const total = nCanas2 * 2 + nCanasta18 * 1.8 + nCanasta16 * 1.6 + nCustomQty * wCustom;
    return total;
  };

  // Registrar producto (FormData porque backend usa multer().none())
  const registrarCarneoFruver = async () => {
    if (!productoSeleccionado) {
      enqueueSnackbar("❌ Selecciona un producto válido.", { variant: 'error' });
      return;
    }

    const totalEntered = parseFloat(cantidad) || 0;
    const totalCanastas = calcularTotalCanastas();

    // si no hay total ni canastas, no hay nada que registrar
    if (totalEntered === 0 && totalCanastas === 0) {
      enqueueSnackbar("❌ Ingresa un peso (Cantidad / Peso) o al menos una canasta.", { variant: 'error' });
      return;
    }

    // if the user provided totalEntered=0 but filled baskets, we assume totalEntered equals baskets total
    const usedTotalReference = totalEntered === 0 && totalCanastas > 0 ? totalCanastas : totalEntered;

    let finalCantidad = +(usedTotalReference - totalCanastas);
    // Redondeo a 2 decimales
    finalCantidad = Math.round((finalCantidad + Number.EPSILON) * 100) / 100;

    if (finalCantidad < 0) {
      // no permitimos negativos: lo dejamos en 0 y avisamos
      enqueueSnackbar("⚠️ La suma de las canastas supera el total. Se registrará 0 kg restante.", { variant: 'warning' });
      finalCantidad = 0;
    }

    setLoading(true);
    try {
      const fd = new FormData();
      fd.append("zona_id", zonaId);
      fd.append("item_id", productoSeleccionado.item_id);
      // Enviamos la cantidad final calculada (restante) — el backend re-calcula también por seguridad
      fd.append("cantidad", String(finalCantidad));
      fd.append("operario_email", localStorage.getItem("correo_empleado") || "");

      // También enviamos el desglose (opcional, el backend no las insertará como columnas directas,
      // pero las usamos para eco en la respuesta si queremos mostrarlo en historial)
      fd.append("cantidad_total_ingresada", String(usedTotalReference));
      fd.append("canas_2kg", String(parseFloat(canas2kg) || 0));
      fd.append("canasta_1_8kg", String(parseFloat(canasta18kg) || 0));
      fd.append("canasta_1_6kg", String(parseFloat(canasta16kg) || 0));
      fd.append("custom_qty", String(parseFloat(customQty) || 0));
      fd.append("custom_weight", String(parseFloat(customWeight) || 0));

      const response = await fetch(`${BASE_URL}/registrar-producto`, {
        method: "POST",
        body: fd,
      });
      const data = await response.json();
      if (data.success && data.producto) {
        // registramos en el historial local incluyendo el desglose para visualización
        const registro = {
          id: data.producto.id,
          producto: {
            item_id: productoSeleccionado.item_id,
            descripcion: productoSeleccionado.descripcion,
          },
          cantidad: finalCantidad,
          cantidad_total_ingresada: usedTotalReference,
          canas_2kg: parseFloat(canas2kg) || 0,
          canasta_1_8kg: parseFloat(canasta18kg) || 0,
          canasta_1_6kg: parseFloat(canasta16kg) || 0,
          custom_qty: parseFloat(customQty) || 0,
          custom_weight: parseFloat(customWeight) || 0,
          inventarioId,
          zonaId,
        };
        setHistorial((prev) => [registro, ...prev]);
        setTotalEscaneados((prev) => prev + finalCantidad);
        enqueueSnackbar("✅ Producto registrado correctamente.", { variant: 'success' });

        // reset campos
        setInputBusqueda("");
        setProductoSeleccionado(null);
        setCantidad("");
        setCanas2kg("");
        setCanasta18kg("");
        setCanasta16kg("");
        setCustomQty("");
        setCustomWeight("");
      } else {
        enqueueSnackbar(
          `❌ Error al registrar producto: ${data.message || "Error desconocido"}`,
          { variant: 'error' }
        );
      }
    } catch (error) {
      enqueueSnackbar(`❌ Error de red al registrar producto: ${error.message}`, { variant: 'error' });
    } finally {
      setLoading(false);
    }
  };

  // Eliminar registro
  const handleEliminarRegistro = async (id) => {
    const result = await Swal.fire({
      title: "¿Estás seguro?",
      text: "Este registro será eliminado del historial.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Eliminar",
      cancelButtonText: "Cancelar",
    });

    if (!result.isConfirmed) return;

    setLoading(true);
    try {
      const response = await fetch(`${BASE_URL}/producto/${id}`, {
        method: "DELETE",
      });
      const data = await response.json();
      if (data.success) {
        const registroEliminado = historial.find((h) => h.id === id);
        setHistorial(historial.filter((h) => h.id !== id));
        setTotalEscaneados(
          (prev) => prev - (registroEliminado?.cantidad || 0)
        );
        enqueueSnackbar("🗑️ Registro eliminado correctamente.", { variant: 'success' });
      } else {
        enqueueSnackbar(
          `❌ Error al eliminar producto: ${data.message || "Error desconocido"}`,
          { variant: 'error' }
        );
      }
    } catch (error) {
      enqueueSnackbar(`❌ Error de red al eliminar producto: ${error.message}`, { variant: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const descargarTxt = useCallback((historial, consecutivo, bodega) => {
    if (!historial || historial.length === 0) {
      enqueueSnackbar("No hay datos para exportar a TXT.", { variant: 'error' });
      return;
    }

    const registrosAgrupados = historial.reduce((acc, registro) => {
      const itemId = registro.producto.item_id;
      const cantidad = parseFloat(registro.cantidad) || 0;
      if (acc[itemId]) acc[itemId].cantidad += cantidad;
      else
        acc[itemId] = {
          item_id: itemId,
          bodega: bodega || "N/A",
          cantidad,
        };
      return acc;
    }, {});

    const lines = ["000000100000001001"];
    let lineNumber = 2;

    Object.values(registrosAgrupados).forEach((registro) => {
      if (registro.cantidad > 0) {
        const num = parseFloat(registro.cantidad) || 0;
        const quantityString = num % 1 === 0 ? `${num}.` : `${num}`;
        const paddedQuantity = quantityString.padStart(16, "0");

        const line =
          `${lineNumber.toString().padStart(7, "0")}` +
          `04120001001` +
          `${(consecutivo || "").toString().padStart(8, "0")}` +
          `${(registro.item_id || "").toString().padStart(7, "0")}` +
          `${" ".repeat(48)}` +
          `${(registro.bodega || "").toString().padEnd(5, " ")}` +
          `${" ".repeat(25)}` +
          `00000000000000000000.000000000000000.` +
          `${paddedQuantity}` +
          `000000000000000.000000000000000.000000000000000.0000`;

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
  }, [enqueueSnackbar]);

  const descargarExcel = useCallback((historial, consecutivo, bodega) => {
    if (!historial || historial.length === 0) {
      enqueueSnackbar("No hay datos para exportar a Excel.", { variant: 'error' });
      return;
    }

    const registrosAgrupados = historial.reduce((acc, registro) => {
      const itemId = registro.producto.item_id;
      const cantidad = registro.cantidad;
      if (acc[itemId]) acc[itemId].CANT_11ENT_PUNTO_4DECIMALES += cantidad;
      else
        acc[itemId] = {
          NRO_INVENTARIO_BODEGA: consecutivo,
          ITEM: itemId,
          BODEGA: bodega || "N/A",
          CANT_11ENT_PUNTO_4DECIMALES: cantidad,
        };
      return acc;
    }, {});

    const datosExcel = Object.values(registrosAgrupados);
    const worksheet = XLSX.utils.json_to_sheet(datosExcel);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Físico");
    worksheet["!cols"] = [{ wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 }];
    XLSX.writeFile(
      workbook,
      `Inventario_${consecutivo}_${new Date().toISOString().split("T")[0]}.xlsx`
    );
  }, [enqueueSnackbar]);

  // Finalizar zona (con validación de consecutivo duplicado)
  const handleFinalizarZona = async () => {
    if (historial.length === 0) {
      enqueueSnackbar("❌ No hay registros para finalizar.", { variant: 'error' });
      return;
    }

    const confirmResult = await Swal.fire({
      title: "¿Estás seguro?",
      text: "Estás a punto de finalizar el conteo de esta zona. ¿Deseas continuar?",
      icon: "question",
      showCancelButton: true,
      confirmButtonText: "Sí, finalizar",
      cancelButtonText: "Cancelar",
    });

    if (!confirmResult.isConfirmed) return;

    const consecutivoResult = await Swal.fire({
      title: "Ingresa el número de consecutivo",
      input: "text",
      inputLabel: "Consecutivo",
      inputPlaceholder: "Ej. INV-001",
      showCancelButton: true,
      confirmButtonText: "Confirmar",
      cancelButtonText: "Cancelar",
      inputValidator: async (value) => {
        const v = String(value || "").trim();
        if (!v) return "¡Debes ingresar un número de consecutivo!";
        const existe = await checkConsecutivoDuplicado(v);
        if (existe)
          return "Ese consecutivo ya fue ingresado previamente. Por favor, ingresa uno diferente.";
        return undefined;
      },
      allowOutsideClick: () => !Swal.isLoading(),
    });

    if (!consecutivoResult.isConfirmed) return;

    const consecutivo = String(consecutivoResult.value || "").trim();

    // Revalidación por seguridad
    const dup = await checkConsecutivoDuplicado(consecutivo);
    if (dup) {
      enqueueSnackbar("❌ Ese consecutivo ya existe. Cámbialo por uno nuevo.", { variant: 'error' });
      return;
    }

    setLoading(true);
    try {
      // usar FormData por multer().none() en backend
      const fd = new FormData();
      fd.append("inventarioId", inventarioId);
      fd.append("zonaId", zonaId);
      fd.append("consecutivo", consecutivo);
      fd.append("operario_email", localStorage.getItem("correo_empleado") || "");

      const response = await fetch(`${BASE_URL}/guardar-inventario`, {
        method: "POST",
        body: fd,
      });

      const result = await response.json();
      if (result.success) {
        enqueueSnackbar("✅ Inventario finalizado y guardado correctamente.", { variant: 'success' });
        descargarExcel(historial, consecutivo, bodega);
        descargarTxt(historial, consecutivo, bodega);
        finalizarZona(historial);
        setHistorial([]);
        setTotalEscaneados(0);
      } else {
        enqueueSnackbar(`❌ ${result.message || "Error al finalizar la zona"}`, { variant: 'error' });
      }
    } catch (error) {
      enqueueSnackbar(`❌ Error al finalizar la zona: ${error.message}`, { variant: 'error' });
    } finally {
      setLoading(false);
    }
  };

  // Animaciones
  useEffect(() => {
    if (productInfoRef.current) {
      gsap.fromTo(
        productInfoRef.current,
        { opacity: 0, y: 20 },
        { opacity: 1, y: 0, duration: 0.5 }
      );
    }
    if (historialRef.current) {
      gsap.fromTo(
        historialRef.current,
        { opacity: 0, x: -20 },
        { opacity: 1, x: 0, duration: 0.5 }
      );
    }
  }, [productoSeleccionado, historial]);

  return (
    <div className="carneo-scanner-content">
      <div className="carneo-search-group">
        <label className="carneo-search-label" htmlFor="carneo-product-search">
          Buscar Producto (Descripción o Código de Barras)
        </label>
        <input
          id="carneo-product-search"
          type="text"
          autoFocus
          placeholder="Escribe descripción o escanea código..."
          value={inputBusqueda}
          onChange={handleInputChange}
          onBlur={handleInputBlur}
          className="carneo-search-input"
          list="carneo-product-suggestions"
          aria-describedby="carneo-search-help"
          disabled={!grupoInventario}
        />
        <datalist id="carneo-product-suggestions">
          {productosFiltrados.map((prod) => (
            <option key={prod.item_id} value={prod.descripcion} />
          ))}
        </datalist>
        <p id="carneo-search-help" className="carneo-search-help">
          {grupoInventario
            ? "Selecciona un producto de la lista o escanea un código de barras."
            : "Cargando grupo del inventario..."}
        </p>
      </div>

      {productoSeleccionado && (
        <div ref={productInfoRef} className="carneo-product-info">
          <p className="carneo-product-item">
            <span className="carneo-label">Item:</span>{" "}
            {productoSeleccionado.item_id || "Sin código"}
          </p>
          <p className="carneo-product-barcode">
            <span className="carneo-label">Descripción:</span>{" "}
            {productoSeleccionado.descripcion || "Sin descripción"}
          </p>
          {isSearchingByBarcode && (
            <p className="carneo-product-barcode-found">
              <span className="carneo-label">Encontrado por:</span> Código de
              Barras
            </p>
          )}
        </div>
      )}

      <div className="carneo-input-group">
        <div className="carneo-quantity-field">
          <label className="carneo-quantity-label" htmlFor="carneo-quantity-input">
            Cantidad Neto (Incluye peso canastas)
          </label>
          <input
            id="carneo-quantity-input"
            type="number"
            inputMode="decimal"
            value={cantidad}
            onChange={(e) => setCantidad(e.target.value)}
            className="carneo-quantity-input"
            placeholder="Ej. 1.55"
            step="0.01"
            disabled={!productoSeleccionado}
            aria-describedby="carneo-quantity-help"
          />
          <p id="carneo-quantity-help" className="carneo-quantity-help">
            Ingresa la cantidad o peso del producto.
          </p>
        </div>

        {/* --- Nuevos campos de canastas --- */}
        <div className="carneo-baskets">
          <label className="carneo-baskets-title">Desglose por canastas</label>

          <div className="baskets-row">
            <label>Canasta 2.0 kg (unidades)</label>
            <input type="number" step="1" min="0" value={canas2kg} onChange={(e) => setCanas2kg(e.target.value)} disabled={!productoSeleccionado} />
          </div>

          <div className="baskets-row">
            <label>Canasta 1.8 kg (unidades)</label>
            <input type="number" step="1" min="0" value={canasta18kg} onChange={(e) => setCanasta18kg(e.target.value)} disabled={!productoSeleccionado} />
          </div>

          <div className="baskets-row">
            <label>Canasta 1.6 kg (unidades)</label>
            <input type="number" step="1" min="0" value={canasta16kg} onChange={(e) => setCanasta16kg(e.target.value)} disabled={!productoSeleccionado} />
          </div>

          <div className="baskets-row">
            <label>Canasta personalizada — Peso (kg) por unidad</label>
            <input type="number" step="0.01" min="0" value={customWeight} onChange={(e) => setCustomWeight(e.target.value)} disabled={!productoSeleccionado} placeholder="Ej. 0.75" />
            <label>Cantidad</label>
            <input type="number" step="1" min="0" value={customQty} onChange={(e) => setCustomQty(e.target.value)} disabled={!productoSeleccionado} placeholder="Ej. 2" />
          </div>

        </div>

        <div className="carneo-register-button">
          <button
            onClick={registrarCarneoFruver}
            disabled={!productoSeleccionado || ( (parseFloat(cantidad)||0) === 0 && calcularTotalCanastas() === 0 ) || loading}
            className="carneo-register-btn"
            aria-label="Registrar producto en el inventario"
          >
            {loading ? "Registrando..." : "Registrar"}
          </button>
        </div>
      </div>

      {historial.length > 0 && (
        <div ref={historialRef} className="carneo-history-section">
          <h3 className="carneo-history-title">Historial Reciente</h3>
          <ul className="carneo-history-list">
            {historial.slice(0, 200).map((h) => (
              <li key={h.id} className="carneo-history-item">
                <span className="carneo-history-description">
                  {h.producto.descripcion} — restante: <strong>{h.cantidad} kg</strong>
                  {" "}
                  <small style={{ display: "block", color: "#666" }}>
                    (total ingresado: {h.cantidad_total_ingresada || "N/A"} kg;
                    cañas2: {h.canas_2kg || 0}, c1.8: {h.canasta_1_8kg || 0}, c1.6: {h.canasta_1_6kg || 0},
                    custom: {h.custom_qty || 0} × {h.custom_weight || 0} kg)
                  </small>
                </span>
                <button
                  onClick={() => handleEliminarRegistro(h.id)}
                  className="carneo-delete-btn"
                  aria-label={`Eliminar registro ${h.producto.descripcion}`}
                >
                  <FaTrashAlt />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="carneo-actions-group">
        <button
          onClick={handleFinalizarZona}
          disabled={loading || historial.length === 0}
          className="carneo-finish-btn"
          aria-label="Finalizar zona"
        >
          Finalizar Zona
        </button>
      </div>
    </div>
  );
}

export { CarneoFruverScanner };
