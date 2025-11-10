import React, { useState, useEffect } from 'react';
import { toast } from "react-toastify";
import Swal from "sweetalert2";
import { Search, ListOrdered, ArrowLeft, Layers, Repeat, CheckCircle } from 'lucide-react';
import Modal from "react-modal";
import './ReconteoDiferencias.css';

Modal.setAppElement(document.body);

// =========================================================================
// FUNCIONES DE UTILIDAD PARA LOCAL STORAGE (Asegurando la serialización)
// =========================================================================

// La clave ahora depende del consecutivo para no mezclar inventarios
const getLocalStorageKey = (consecutivo) => `reconteo_state_${consecutivo}`;

// Guarda el estado de re-conteo (un simple objeto para mejor serialización)
const saveRecontadosToLocalStorage = (consecutivo, recontadosMap) => {
    try {
        const key = getLocalStorageKey(consecutivo);
        // Guardamos el Map como un Objeto simple para la serialización
        const recontadosObject = Object.fromEntries(recontadosMap); 
        localStorage.setItem(key, JSON.stringify(recontadosObject));
    } catch (error) {
        console.error("Error saving to localStorage:", error);
    }
};

// Carga el estado de re-conteo (devuelve un Map para facilitar el uso)
const getRecontadosFromLocalStorage = (consecutivo) => {
    try {
        const key = getLocalStorageKey(consecutivo);
        const storedData = localStorage.getItem(key);
        if (storedData) {
            const parsedObject = JSON.parse(storedData);
            // Convertimos el objeto de vuelta a Map para usarlo en el código
            return new Map(Object.entries(parsedObject)); 
        }
        return new Map();
    } catch (error) {
        console.error("Error loading from localStorage:", error);
        return new Map();
    }
};

// Componente para la interfaz de Re-conteo
export function ReconteoDiferencias({ onBack }) {
    const [inventarios, setInventarios] = useState([]);
    const [selectedConsecutivo, setSelectedConsecutivo] = useState('');
    const [selectedInventario, setSelectedInventario] = useState(null);
    const [diferencias, setDiferencias] = useState([]);
    const [loading, setLoading] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [itemToRecontar, setItemToRecontar] = useState(null);
    const [newCount, setNewCount] = useState('');
    
    // ✅ Estados para guardados temporales
    const [ubicacionActual, setUbicacionActual] = useState('punto_venta');
    const [guardadosTemporales, setGuardadosTemporales] = useState([]);
    const [loadingGuardados, setLoadingGuardados] = useState(false);

    const MAX_ITEMS_SHOWN = 20;

    useEffect(() => {
        fetchInventariosParaReconteo();
    }, []);

    const fetchInventariosParaReconteo = async () => {
        setLoading(true);
        try {
            // ✅ Cargar TODOS los inventarios disponibles inicialmente (sin filtrar por sede)
            const url = "https://backend-inventario.vercel.app/api/operario/inventarios-para-reconteo";
            const res = await fetch(url);
            const data = await res.json();
            if (data.success) {
                setInventarios(data.inventarios || []); 
            } else {
                toast.error("Error al cargar inventarios para re-conteo.");
            }
        } catch (error) {
            toast.error(`Error de red al cargar inventarios: ${error.message}`);
        } finally {
            setLoading(false);
        }
    };    const fetchDiferencias = async () => {
        if (!selectedInventario) {
            toast.info("Selecciona un inventario.");
            return;
        }
        setLoading(true);
        setDiferencias([]);
        setSearchTerm('');

        try {
            // ✅ Obtener sede del inventario seleccionado
            const sede = selectedInventario.sede;
            
            console.log(`[DEBUG] Frontend - Consecutivo: ${selectedInventario.consecutivo}, Sede: "${sede || 'SIN_SEDE'}"`);
            
            // Si encontramos una sede válida, guardarla para futuras consultas
            if (sede) {
                localStorage.setItem("sede_usuario", sede);
                console.log(`[DEBUG] Sede guardada en localStorage: "${sede}"`);
            }
            
            const url = sede 
                ? `https://backend-inventario.vercel.app/api/reportes/diferencias-notables/${selectedInventario.consecutivo}?sede=${encodeURIComponent(sede)}`
                : `https://backend-inventario.vercel.app/api/reportes/diferencias-notables/${selectedInventario.consecutivo}`;
            
            console.log(`[DEBUG] Frontend - URL final: ${url}`);
            const res = await fetch(url);
            const data = await res.json();
            
            if (data.success) {
                // ✅ Si la consulta fue exitosa y tenemos sede, guardarla para futuras consultas
                if (sede) {
                    localStorage.setItem("sede_usuario", sede);
                }
                
                // 1. Cargar el estado persistente
                const recontadosMap = getRecontadosFromLocalStorage(selectedInventario.consecutivo);
                
                const diferenciasConEstado = data.diferencias.map(diff => {
                    let item = { ...diff };

                    // 2. 🚀 Lógica de SOBRESCRITURA MEJORADA: Aplicar datos de localStorage
                    if (recontadosMap.has(item.item_id)) {
                        const nuevoFisico = recontadosMap.get(item.item_id);
                        const teorico = parseFloat(item.teorico);
                        
                        // Sobrescribir el valor físico y recalcular diferencias
                        item.fisico = nuevoFisico;
                        item.diferencia_unidades = nuevoFisico - teorico;
                        item.diferencia_porcentaje = teorico !== 0 
                            ? ((nuevoFisico - teorico) / teorico * 100).toFixed(2) 
                            : 'N/A';
                        item.recontado = true; // Marcar como recontado
                    } else {
                        // Si no está en localStorage, usar el estado del backend (o false)
                        item.recontado = item.reconteo_realizado || false;
                    }
                    return item;
                });

                setDiferencias(diferenciasConEstado);
                toast.success(`Se encontraron ${data.diferencias.length} diferencias notables.`);
            } else {
                toast.error(`Error al buscar diferencias: ${data.message}`);
            }
        } catch (error) {
            toast.error(`Error de red: ${error.message}`);
        } finally {
            setLoading(false);
        }
    };
    
    useEffect(() => {
        if (selectedInventario) {
            // ✅ Cuando se selecciona un inventario, guardar su sede en localStorage
            if (selectedInventario.sede) {
                localStorage.setItem("sede_usuario", selectedInventario.sede);
                console.log(`[DEBUG] Sede del inventario seleccionado guardada: "${selectedInventario.sede}"`);
            }
            
            fetchDiferencias();
        } else {
            setDiferencias([]); 
        }
    }, [selectedInventario]);

    const handleOpenModal = async (item) => {
        setItemToRecontar(item);
        setNewCount('0'); // ✅ siempre iniciar en cero para recontar a conciencia
        setUbicacionActual('punto_venta'); // ✅ Resetear ubicación
        setIsModalOpen(true);
        
        // ✅ Cargar guardados temporales del item
        await fetchGuardadosTemporales(item.item_id);
    };
    
    // ✅ NUEVO: Obtener guardados temporales de un item
    const fetchGuardadosTemporales = async (item_id) => {
        if (!selectedInventario || !item_id) return;
        
        setLoadingGuardados(true);
        try {
            const operarioEmail = localStorage.getItem("correo_empleado") || "";
            const url = `https://backend-inventario.vercel.app/api/operario/guardados-reconteo/${selectedInventario.consecutivo}/${item_id}?operario_email=${encodeURIComponent(operarioEmail)}`;
            
            const res = await fetch(url);
            const data = await res.json();
            
            if (data.success) {
                setGuardadosTemporales(data.guardados || []);
            } else {
                console.error("Error al cargar guardados:", data.message);
                setGuardadosTemporales([]);
            }
        } catch (error) {
            console.error("Error al cargar guardados temporales:", error);
            toast.error(`Error al cargar guardados: ${error.message}`);
            setGuardadosTemporales([]);
        } finally {
            setLoadingGuardados(false);
        }
    };
    
    // ✅ NUEVO: Guardar conteo temporal
    const handleGuardarTemporal = async () => {
        if (!itemToRecontar || !newCount || isNaN(parseFloat(newCount))) {
            toast.error("Cantidad no válida.");
            return;
        }
        
        const cantidadGuardar = parseFloat(newCount);
        if (cantidadGuardar <= 0) {
            toast.error("La cantidad debe ser mayor a 0.");
            return;
        }
        
        const operarioEmail = localStorage.getItem("correo_empleado") || "sistema@merka.com.co";
        
        setLoading(true);
        try {
            const res = await fetch('https://backend-inventario.vercel.app/api/operario/guardar-reconteo-temporal', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    consecutivo: selectedInventario.consecutivo,
                    item_id: itemToRecontar.item_id,
                    ubicacion: ubicacionActual,
                    cantidad: cantidadGuardar,
                    operario_email: operarioEmail
                })
            });
            
            const data = await res.json();
            if (!data.success) {
                throw new Error(data.message || "Error al guardar.");
            }
            
            toast.success(`✅ Guardado: ${cantidadGuardar} en ${ubicacionActual === 'bodega' ? 'Bodega' : 'Punto de Venta'}`);
            
            // Recargar guardados
            await fetchGuardadosTemporales(itemToRecontar.item_id);
            
            // Limpiar cantidad
            setNewCount('0');
            
        } catch (error) {
            console.error("Error al guardar temporal:", error);
            toast.error(`❌ Error: ${error.message}`);
        } finally {
            setLoading(false);
        }
    };
    
    // ✅ NUEVO: Eliminar guardado temporal
    const handleEliminarGuardado = async (guardadoId) => {
        const result = await Swal.fire({
            title: '¿Eliminar este guardado?',
            text: "Esta acción no se puede deshacer.",
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'Sí, eliminar',
            cancelButtonText: 'Cancelar'
        });
        
        if (!result.isConfirmed) return;
        
        setLoading(true);
        try {
            const res = await fetch(`https://backend-inventario.vercel.app/api/operario/guardado-reconteo/${guardadoId}`, {
                method: 'DELETE'
            });
            
            const data = await res.json();
            if (!data.success) {
                throw new Error(data.message || "Error al eliminar.");
            }
            
            toast.success("✅ Guardado eliminado");
            await fetchGuardadosTemporales(itemToRecontar.item_id);
            
        } catch (error) {
            console.error("Error al eliminar guardado:", error);
            toast.error(`❌ Error: ${error.message}`);
        } finally {
            setLoading(false);
        }
    };

    const adjustCount = (delta) => {
        const current = parseFloat(newCount) || 0;
        const adjusted = Math.max(0, current + delta); 
        setNewCount(String(adjusted));
    };

    const handleAjustarConteo = async () => {
        if (!itemToRecontar) {
            toast.error("No hay item seleccionado.");
            return;
        }

        // ✅ NUEVO: Verificar que haya guardados temporales
        if (guardadosTemporales.length === 0) {
            toast.error("No hay guardados temporales. Primero guarda al menos un conteo.");
            return;
        }

        const operarioEmail = localStorage.getItem("correo_empleado") || "sistema@merka.com.co";

        // ✅ NUEVO: Calcular totales por ubicación desde guardados
        const totales = {
            bodega: 0,
            punto_venta: 0,
            total: 0
        };

        guardadosTemporales.forEach(g => {
            const cant = parseFloat(g.cantidad) || 0;
            if (g.ubicacion === 'bodega') {
                totales.bodega += cant;
            } else if (g.ubicacion === 'punto_venta') {
                totales.punto_venta += cant;
            }
            totales.total += cant;
        });

        // Mostrar confirmación con desglose
        const result = await Swal.fire({
          title: 'Confirmar Ajuste Final',
          html: `
            <div style="text-align: left; padding: 10px;">
              <p><strong>Item:</strong> ${itemToRecontar.item_id}</p>
              <p><strong>Descripción:</strong> ${itemToRecontar.descripcion}</p>
              <hr style="margin: 10px 0;">
              <p><strong>📦 Bodega:</strong> ${totales.bodega}</p>
              <p><strong>🏪 Punto de Venta:</strong> ${totales.punto_venta}</p>
              <hr style="margin: 10px 0;">
              <p style="font-size: 18px; color: #28a745;">
                <strong>Total a Registrar:</strong> ${totales.total}
              </p>
              <p style="font-size: 12px; color: #666;">
                Se registrará el ajuste y se eliminarán los ${guardadosTemporales.length} guardados temporales.
              </p>
            </div>
          `,
          icon: 'question',
          showCancelButton: true,
          confirmButtonText: 'Sí, Registrar Ajuste',
          cancelButtonText: 'Cancelar'
        });

        if (result.isConfirmed) {
          setLoading(true);
          try {
            // ✅ NUEVO: Enviar sin cantidad_ajustada para que el backend sume los guardados
            const res = await fetch(`https://backend-inventario.vercel.app/api/operario/registrar-ajuste-reconteo`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                consecutivo: selectedInventario.consecutivo,
                item_id: itemToRecontar.item_id,
                // ✅ NO enviamos cantidad_ajustada para que el backend sume los guardados
                cantidad_anterior: parseFloat(itemToRecontar.fisico) || 0,
                operario_email: operarioEmail,
                sede: selectedInventario.sede
              })
            });

            const data = await res.json();
            if (!data.success) {
              console.error("Error del servidor:", data);
              throw new Error(data.message || "Error al registrar el ajuste.");
            }

            console.log(`✅ Ajuste registrado con ${guardadosTemporales.length} guardados:`, {
              item_id: itemToRecontar.item_id,
              bodega: totales.bodega,
              punto_venta: totales.punto_venta,
              total: totales.total,
              operario: operarioEmail
            });

            toast.success(`✅ Ajuste registrado: ${totales.total} unidades (${totales.bodega} Bodega + ${totales.punto_venta} PV)`);
            setIsModalOpen(false);
            
            const teorico = parseFloat(itemToRecontar.teorico);

            // Actualización del estado local
            setDiferencias(prevDifs => prevDifs.map(d => {
              if (d.item_id === itemToRecontar.item_id) {
                const updatedItem = { 
                  ...d, 
                  fisico: totales.total,
                  diferencia_unidades: totales.total - teorico, 
                  diferencia_porcentaje: teorico !== 0 
                    ? ((totales.total - teorico) / teorico * 100).toFixed(2) 
                    : 'N/A',
                  recontado: true
                };
                return updatedItem;
              }
              return d;
            }));
            
            // Persistir estado en localStorage
            const recontadosMap = getRecontadosFromLocalStorage(selectedInventario.consecutivo);
            recontadosMap.set(itemToRecontar.item_id, totales.total);
            saveRecontadosToLocalStorage(selectedInventario.consecutivo, recontadosMap);
            
            // Limpiar guardados temporales del estado local
            setGuardadosTemporales([]);
            
          } catch (error) {
            console.error("❌ Error en handleAjustarConteo:", error);
            toast.error(`❌ Error al registrar ajuste: ${error.message}`);
          } finally {
            setLoading(false);
          }
        }
    };
    
    // Lógica de filtrado y visualización (MODIFICADA: Solo buscar por item)
    const filteredDiferencias = diferencias.filter(item => 
        item.item_id.includes(searchTerm)
        // ✅ REMOVIDO: || item.descripcion.toLowerCase().includes(searchTerm.toLowerCase())
    );
    
    const itemsToShow = searchTerm 
        ? filteredDiferencias 
        : filteredDiferencias.slice(0, MAX_ITEMS_SHOWN);

    const getDiffPillClass = (diff) => {
        if (diff > 0) return 'reconteo-pda-diff-pill positive';
        if (diff < 0) return 'reconteo-pda-diff-pill negative';
        return 'reconteo-pda-diff-pill';
    };

    return (
        <div className="reconteo-pda-container">
            <div className="reconteo-pda-header">
                <h2 className="reconteo-pda-title">
                    <Layers size={22} color="#dc3545" /> Re-conteo
                </h2>
                <button onClick={onBack} className="reconteo-pda-back-button">
                    <ArrowLeft size={20} style={{ marginRight: '4px' }}/> Volver
                </button>
            </div>
            
            <p className="reconteo-pda-description">
                Selecciona el inventario para ver ítems con discrepancia notable.
            </p>

            <select
                className="reconteo-pda-select"
                value={selectedConsecutivo}
                onChange={(e) => {
                    const selectedId = e.target.value;
                    setSelectedConsecutivo(selectedId);
                    // Guardar el inventario seleccionado completo o resetear si está vacío
                    if (selectedId) {
                        const inventario = inventarios.find(inv => inv.id === selectedId);
                        setSelectedInventario(inventario);
                    } else {
                        setSelectedInventario(null);
                    }
                }}
                disabled={loading}
            >
                <option value="">Seleccionar Inventario...</option>
                {inventarios.map(inv => (
                    // ✅ CAMBIO: Usar inv.id como key único y value único
                    <option key={inv.id} value={inv.id}>
                        {`#${inv.consecutivo} - ${inv.categoria || inv.descripcion || 'Sin descripción'} (${inv.sede})`}
                    </option>
                ))}
            </select>

            <button
                onClick={fetchDiferencias} 
                disabled={loading || !selectedInventario}
                className="reconteo-pda-btn-primary"
            >
                {loading ? 'Cargando...' : <><Search size={18} style={{ marginRight: '8px' }} /> Buscar Diferencias</>}
            </button>
            
            {diferencias.length > 0 && (
                <input
                    type="text"
                    placeholder="Buscar por ITEM ID..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="reconteo-pda-search-input"
                    inputMode="none"
                    autoComplete="off"
                />
            )}

            <h3 className="reconteo-pda-results-header">
                <ListOrdered size={16} style={{ marginRight: '8px' }} /> 
                Mostrando {itemsToShow.length} de {diferencias.length} Diferencias
                {diferencias.length > MAX_ITEMS_SHOWN && !searchTerm && (
                    <span style={{ fontSize: '0.8em', color: '#007bff', marginLeft: '10px' }}>(Busca para ver el resto)</span>
                )}
            </h3>
            

            {diferencias.length === 0 && !loading && selectedInventario && (
                <p style={{ textAlign: 'center', color: '#6c757d', padding: '20px' }}>
                    No se encontraron diferencias notables para este inventario.
                </p>
            )}

            <ul className="reconteo-pda-list">
                {itemsToShow.map(item => (
                    <li 
                        key={item.item_id} 
                        className={`reconteo-pda-list-item ${item.recontado ? 'recontado-item' : ''}`}
                        onClick={() => handleOpenModal(item)}
                    >
                        <p className="reconteo-pda-item-title">
                            {item.item_id} - {item.descripcion}
                        </p>
                        
                        {/* Línea de Teórico/Físico oculta en la lista */}
                        <div className="reconteo-pda-info-line" style={{ display: 'none' }}> 
                            <span style={{ color: '#007bff' }}>Teórico: <strong>{item.teorico}</strong></span>
                            <span style={{ color: '#17a2b8' }}>Físico: <strong>{item.fisico}</strong></span>
                        </div>
                        
                        {/* Indicador de Diferencia o Re-contado */}
                        {item.recontado ? (
                            <span className="reconteo-pda-diff-pill recontado">
                                <CheckCircle size={14} style={{ marginRight: '5px' }} /> Re-contado
                            </span>
                        ) : (
                            <span className={getDiffPillClass(item.diferencia_unidades)}>
                                Dif: {item.diferencia_unidades} ({item.diferencia_porcentaje}%)
                            </span>
                        )}

                        <small className="reconteo-pda-touch-hint">
                            {item.recontado ? 'Toca para Revisar Ajuste' : 'Toca para Re-contar'}
                        </small>
                    </li>
                ))}
            </ul>

            {/* Modal de Conteo Rápido con Guardados Temporales */}
            <Modal
                isOpen={isModalOpen}
                onRequestClose={() => setIsModalOpen(false)}
                style={{
                    content: { 
                        top: '50%', left: '50%', right: 'auto', bottom: 'auto', 
                        marginRight: '-50%', transform: 'translate(-50%, -50%)', 
                        maxWidth: '550px', width: '95%', padding: '25px', borderRadius: '12px',
                        maxHeight: '90vh', overflowY: 'auto'
                    }
                }}
            >
                {itemToRecontar && (
                    <div>
                        <h3 style={{ borderBottom: '1px solid #eee', paddingBottom: '10px', marginBottom: '15px' }}>
                            <Repeat size={18} style={{ marginRight: '8px', color: '#007bff' }} /> Re-conteo con Guardados
                        </h3>
                        
                        {/* Información del Producto */}
                        <p style={{ fontWeight: 'bold', fontSize: '1.1em', marginBottom: '5px' }}>
                            {itemToRecontar.item_id} - {itemToRecontar.descripcion}
                        </p>

                        {/* Diferencia Actual */}
                        <div className="reconteo-pda-diff-info">
                            <p style={{ fontWeight: 'bold', color: itemToRecontar.diferencia_unidades < 0 ? '#dc3545' : '#28a745', marginBottom: '20px' }}>
                                Diferencia Actual: {itemToRecontar.diferencia_unidades}
                            </p>
                        </div>
                        
                        {/* ✅ NUEVO: Selector de Ubicación */}
                        <div style={{ marginBottom: '15px' }}>
                            <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '8px' }}>
                                📍 Ubicación:
                            </label>
                            <select
                                value={ubicacionActual}
                                onChange={(e) => setUbicacionActual(e.target.value)}
                                style={{
                                    width: '100%',
                                    padding: '10px',
                                    fontSize: '1em',
                                    borderRadius: '5px',
                                    border: '1px solid #ccc'
                                }}
                                disabled={loading}
                            >
                                <option value="punto_venta">🏪 Punto de Venta</option>
                                <option value="bodega">📦 Bodega</option>
                            </select>
                        </div>

                        {/* Campo de Cantidad */}
                        <div style={{ marginBottom: '15px' }}>
                            <label htmlFor="new-count-input" style={{ display: 'block', fontWeight: 'bold', marginBottom: '8px' }}>
                                Cantidad Encontrada:
                            </label>
                            <input
                                id="new-count-input"
                                type="text"
                                value={newCount}
                                onChange={(e) => setNewCount(e.target.value.replace(/[^0-9.]/g, ""))}
                                className="reconteo-pda-modal-input"
                                placeholder="0"
                                autoFocus
                                inputMode="none"
                                autoComplete="off"
                                style={{
                                    width: '100%',
                                    padding: '12px',
                                    fontSize: '1.2em',
                                    borderRadius: '5px',
                                    border: '2px solid #007bff',
                                    textAlign: 'center'
                                }}
                            />
                        </div>
                        
                        {/* Botones de Ajuste Rápido */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', marginBottom: '15px' }}>
                            <button 
                                type="button" 
                                onClick={() => adjustCount(-10)} 
                                style={{ padding: '12px', fontSize: '1em', backgroundColor: '#e9ecef', color: '#dc3545', border: '1px solid #dc3545', borderRadius: '5px', fontWeight: 'bold' }}>
                                -10
                            </button>
                            <button 
                                type="button" 
                                onClick={() => adjustCount(-1)} 
                                style={{ padding: '12px', fontSize: '1em', backgroundColor: '#e9ecef', color: '#dc3545', border: '1px solid #dc3545', borderRadius: '5px', fontWeight: 'bold' }}>
                                -1
                            </button>
                            <button 
                                type="button" 
                                onClick={() => adjustCount(1)} 
                                style={{ padding: '12px', fontSize: '1em', backgroundColor: '#e9ecef', color: '#28a745', border: '1px solid #28a745', borderRadius: '5px', fontWeight: 'bold' }}>
                                +1
                            </button>
                            <button 
                                type="button" 
                                onClick={() => adjustCount(10)} 
                                style={{ padding: '12px', fontSize: '1em', backgroundColor: '#e9ecef', color: '#28a745', border: '1px solid #28a745', borderRadius: '5px', fontWeight: 'bold' }}>
                                +10
                            </button>
                            <button 
                                type="button" 
                                onClick={() => adjustCount(50)} 
                                style={{ padding: '12px', fontSize: '1em', backgroundColor: '#e9ecef', color: '#28a745', border: '1px solid #28a745', borderRadius: '5px', fontWeight: 'bold' }}>
                                +50
                            </button>
                            <button 
                                type="button" 
                                onClick={() => setNewCount('0')} 
                                style={{ padding: '12px', fontSize: '1em', backgroundColor: '#6c757d', color: 'white', border: 'none', borderRadius: '5px', fontWeight: 'bold' }}>
                                CERO
                            </button>
                        </div>

                        {/* ✅ NUEVO: Botón de Guardar Temporal */}
                        <button 
                            onClick={handleGuardarTemporal}
                            disabled={loading || !newCount || parseFloat(newCount) === 0}
                            style={{
                                width: '100%',
                                padding: '14px',
                                fontSize: '1.1em',
                                backgroundColor: loading || !newCount || parseFloat(newCount) === 0 ? '#ccc' : '#17a2b8',
                                color: 'white',
                                border: 'none',
                                borderRadius: '5px',
                                fontWeight: 'bold',
                                cursor: loading || !newCount || parseFloat(newCount) === 0 ? 'not-allowed' : 'pointer',
                                marginBottom: '20px'
                            }}
                        >
                            💾 Guardar
                        </button>

                        {/* ✅ NUEVO: Tabla de Guardados Temporales */}
                        {loadingGuardados ? (
                            <div style={{ textAlign: 'center', padding: '20px', color: '#6c757d' }}>
                                Cargando guardados...
                            </div>
                        ) : guardadosTemporales.length > 0 ? (
                            <div style={{ marginBottom: '20px' }}>
                                <h4 style={{ marginBottom: '10px', color: '#495057' }}>📋 Guardados Temporales:</h4>
                                <div style={{ maxHeight: '250px', overflowY: 'auto', border: '1px solid #dee2e6', borderRadius: '5px' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9em' }}>
                                        <thead style={{ backgroundColor: '#f8f9fa', position: 'sticky', top: 0 }}>
                                            <tr>
                                                <th style={{ padding: '10px', textAlign: 'left', borderBottom: '2px solid #dee2e6' }}>Ubicación</th>
                                                <th style={{ padding: '10px', textAlign: 'center', borderBottom: '2px solid #dee2e6' }}>Cantidad</th>
                                                <th style={{ padding: '10px', textAlign: 'center', borderBottom: '2px solid #dee2e6' }}>Acción</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {guardadosTemporales.map((guardado) => (
                                                <tr key={guardado.id} style={{ borderBottom: '1px solid #dee2e6' }}>
                                                    <td style={{ padding: '10px' }}>
                                                        {guardado.ubicacion === 'bodega' ? '📦 Bodega' : '🏪 PV'}
                                                    </td>
                                                    <td style={{ padding: '10px', textAlign: 'center', fontWeight: 'bold', fontSize: '1.1em' }}>
                                                        {guardado.cantidad}
                                                    </td>
                                                    <td style={{ padding: '10px', textAlign: 'center' }}>
                                                        <button
                                                            onClick={() => handleEliminarGuardado(guardado.id)}
                                                            disabled={loading}
                                                            style={{
                                                                padding: '6px 12px',
                                                                fontSize: '0.9em',
                                                                backgroundColor: '#dc3545',
                                                                color: 'white',
                                                                border: 'none',
                                                                borderRadius: '3px',
                                                                cursor: loading ? 'not-allowed' : 'pointer'
                                                            }}
                                                        >
                                                            🗑️
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                        <tfoot style={{ backgroundColor: '#e9ecef', fontWeight: 'bold' }}>
                                            <tr>
                                                <td style={{ padding: '10px' }}>Totales:</td>
                                                <td colSpan="3" style={{ padding: '10px' }}>
                                                    📦 Bodega: {guardadosTemporales.filter(g => g.ubicacion === 'bodega').reduce((sum, g) => sum + parseFloat(g.cantidad), 0)} | 
                                                    🏪 PV: {guardadosTemporales.filter(g => g.ubicacion === 'punto_venta').reduce((sum, g) => sum + parseFloat(g.cantidad), 0)} | 
                                                    Total: {guardadosTemporales.reduce((sum, g) => sum + parseFloat(g.cantidad), 0)}
                                                </td>
                                            </tr>
                                        </tfoot>
                                    </table>
                                </div>
                            </div>
                        ) : (
                            <div style={{ textAlign: 'center', padding: '20px', color: '#6c757d', marginBottom: '20px', border: '1px dashed #ccc', borderRadius: '5px' }}>
                                No hay guardados temporales para este ítem.
                            </div>
                        )}
                        
                        {/* Botones de Acción Final */}
                        <div style={{ display: 'flex', gap: '10px' }}>
                            <button 
                                onClick={handleAjustarConteo}
                                disabled={loading || guardadosTemporales.length === 0}
                                style={{
                                    flex: 1,
                                    padding: '14px',
                                    fontSize: '1em',
                                    backgroundColor: loading || guardadosTemporales.length === 0 ? '#ccc' : '#28a745',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '5px',
                                    fontWeight: 'bold',
                                    cursor: loading || guardadosTemporales.length === 0 ? 'not-allowed' : 'pointer'
                                }}
                            >
                                ✅ Registrar Ajuste Final
                            </button>
                            <button 
                                onClick={() => setIsModalOpen(false)}
                                style={{
                                    flex: 1,
                                    padding: '14px',
                                    fontSize: '1em',
                                    backgroundColor: '#6c757d',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '5px',
                                    fontWeight: 'bold',
                                    cursor: 'pointer'
                                }}
                            >
                                Cancelar
                            </button>
                        </div>
                    </div>
                )}
            </Modal>            {loading && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(255, 255, 255, 0.9)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
                    <div className="loading-spinner"></div>
                </div>
            )}
        </div>
    );
}