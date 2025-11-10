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

    const handleOpenModal = (item) => {
        setItemToRecontar(item);
        setNewCount('0'); // ✅ siempre iniciar en cero para recontar a conciencia
        setIsModalOpen(true);
    };

    const adjustCount = (delta) => {
        const current = parseFloat(newCount) || 0;
        const adjusted = Math.max(0, current + delta); 
        setNewCount(String(adjusted));
    };

    const handleAjustarConteo = async () => {
        if (!itemToRecontar || !newCount || isNaN(parseFloat(newCount))) {
            toast.error("Cantidad no válida.");
            return;
        }

        const nuevoConteo = parseFloat(newCount);
        const operarioEmail = localStorage.getItem("correo_empleado") || "sistema@merka.com.co";

        // ✅ CAMBIO CRÍTICO: Verificar si ya existe un ajuste previo para este item
        const recontadosMap = getRecontadosFromLocalStorage(selectedInventario.consecutivo);
        const conteoAnteriorAjustado = recontadosMap.has(itemToRecontar.item_id) 
          ? recontadosMap.get(itemToRecontar.item_id) 
          : parseFloat(itemToRecontar.fisico) || 0;

        // ✅ NUEVO: Calcular el conteo ACUMULADO
        const conteoTotalAcumulado = conteoAnteriorAjustado + nuevoConteo;

        const result = await Swal.fire({
          title: 'Confirmar Re-conteo',
          html: `
            <div style="text-align: left; padding: 10px;">
              <p><strong>Item:</strong> ${itemToRecontar.item_id}</p>
              <p><strong>Conteo actual:</strong> ${conteoAnteriorAjustado}</p>
              <p><strong>Cantidad a agregar:</strong> +${nuevoConteo}</p>
              <hr style="margin: 10px 0;">
              <p style="font-size: 18px; color: #28a745;">
                <strong>Nuevo total:</strong> ${conteoTotalAcumulado}
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
            // ✅ CAMBIO: Enviar el total ACUMULADO al backend
            const res = await fetch(`https://backend-inventario.vercel.app/api/operario/registrar-ajuste-reconteo`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                consecutivo: selectedInventario.consecutivo,
                item_id: itemToRecontar.item_id,
                cantidad_ajustada: conteoTotalAcumulado, // ✅ ENVIAR EL TOTAL ACUMULADO
                cantidad_anterior: conteoAnteriorAjustado, // ✅ El valor previo (para trazabilidad)
                operario_email: operarioEmail,
                sede: selectedInventario.sede
              })
            });

            const data = await res.json();
            if (!data.success) {
              console.error("Error del servidor:", data);
              throw new Error(data.message || "Error al registrar el ajuste.");
            }

            console.log(`✅ Ajuste acumulado registrado en BD:`, {
              item_id: itemToRecontar.item_id,
              cantidad_anterior: conteoAnteriorAjustado,
              cantidad_agregada: nuevoConteo,
              cantidad_total: conteoTotalAcumulado,
              operario: operarioEmail
            });

            toast.success(`✅ Se agregaron ${nuevoConteo} unidades. Total: ${conteoTotalAcumulado}`);
            setIsModalOpen(false);
            
            const teorico = parseFloat(itemToRecontar.teorico);

            // 2. Actualización del estado local (Recalcular con el total acumulado)
            setDiferencias(prevDifs => prevDifs.map(d => {
              if (d.item_id === itemToRecontar.item_id) {
                const updatedItem = { 
                  ...d, 
                  fisico: conteoTotalAcumulado, // ✅ Usar el total acumulado
                  diferencia_unidades: conteoTotalAcumulado - teorico, 
                  diferencia_porcentaje: teorico !== 0 
                    ? ((conteoTotalAcumulado - teorico) / teorico * 100).toFixed(2) 
                    : 'N/A',
                  recontado: true
                };
                return updatedItem;
              }
              return d;
            }));
            
            // 3. 💾 Persistir el estado de re-contado en localStorage con el TOTAL ACUMULADO
            recontadosMap.set(itemToRecontar.item_id, conteoTotalAcumulado); // ✅ Guardar el total acumulado
            saveRecontadosToLocalStorage(selectedInventario.consecutivo, recontadosMap);
            
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

            {/* Modal de Conteo Rápido (Optimizado para PDA) */}
            <Modal
                isOpen={isModalOpen}
                onRequestClose={() => setIsModalOpen(false)}
                style={{
                    content: { 
                        top: '50%', left: '50%', right: 'auto', bottom: 'auto', 
                        marginRight: '-50%', transform: 'translate(-50%, -50%)', 
                        maxWidth: '400px', width: '90%', padding: '25px', borderRadius: '12px'
                    }
                }}
            >
                {itemToRecontar && (
                    <div>
                        <h3 style={{ borderBottom: '1px solid #eee', paddingBottom: '10px', marginBottom: '15px' }}>
                            <Repeat size={18} style={{ marginRight: '8px', color: '#007bff' }} /> Ajuste Rápido
                        </h3>
                        
                        {/* Información del Producto */}
                        <p style={{ fontWeight: 'bold', fontSize: '1.1em', marginBottom: '5px' }}>
                            {itemToRecontar.item_id} - {itemToRecontar.descripcion}
                        </p>
                        
                        {/* Línea de Teórico/Físico OCULTA en el modal */}
                        <p style={{ fontSize: '0.9em', color: '#6c757d', display: 'none' }}> 
                            Teórico: {itemToRecontar.teorico} | Físico Anterior: {itemToRecontar.fisico}
                        </p>

                        {/* Énfasis en la Diferencia Actual */}
                        <div className="reconteo-pda-diff-info">
                            <p style={{ fontWeight: 'bold', color: itemToRecontar.diferencia_unidades < 0 ? '#dc3545' : '#28a745', marginBottom: '20px' }}>
                                Diferencia Actual: {itemToRecontar.diferencia_unidades}
                            </p>
                        </div>
                        
                        {/* Indicador de que ya fue recontado */}
                        {itemToRecontar.recontado && (
                            <p style={{ fontWeight: 'bold', color: '#007bff', marginBottom: '15px', padding: '10px', border: '1px solid #007bff', borderRadius: '5px', backgroundColor: '#e9f3ff' }}>
                                Este ítem ya fue **re-contado** previamente.
                            </p>
                        )}


                        <label htmlFor="new-count-input" style={{ display: 'block', fontWeight: 'bold', marginBottom: '8px' }}>
                            Nuevo Conteo TOTAL:
                        </label>
                        
                        {/* Campo de Entrada (Grande para PDA) - SOLO TECLADO FÍSICO */}
                        <input
                            id="new-count-input"
                            type="text"
                            value={newCount}
                            onChange={(e) => setNewCount(e.target.value.replace(/[^0-9.]/g, ""))}
                            className="reconteo-pda-modal-input"
                            placeholder="Total re-contado"
                            autoFocus
                            inputMode="none"
                            autoComplete="off"
                            pattern="[0-9]*"
                            // No uses onFocus ni blur aquí
                        />
                        
                        {/* Botones de Ajuste Rápido (Teclado) */}
                        <div className="reconteo-pda-modal-keyboard" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', marginBottom: '20px' }}>
                            <button 
                                type="button" 
                                onClick={() => adjustCount(-10)} 
                                style={{ padding: '15px', fontSize: '1.1em', backgroundColor: '#e9ecef', color: '#dc3545', border: '1px solid #dc3545', borderRadius: '5px', fontWeight: 'bold' }}>
                                -10
                            </button>
                            <button 
                                type="button" 
                                onClick={() => adjustCount(-1)} 
                                style={{ padding: '15px', fontSize: '1.1em', backgroundColor: '#e9ecef', color: '#dc3545', border: '1px solid #dc3545', borderRadius: '5px', fontWeight: 'bold' }}>
                                -1
                            </button>
                            <button 
                                type="button" 
                                onClick={() => adjustCount(1)} 
                                style={{ padding: '15px', fontSize: '1.1em', backgroundColor: '#e9ecef', color: '#28a745', border: '1px solid #28a745', borderRadius: '5px', fontWeight: 'bold' }}>
                                +1
                            </button>
                            <button 
                                type="button" 
                                onClick={() => adjustCount(10)} 
                                style={{ padding: '15px', fontSize: '1.1em', backgroundColor: '#e9ecef', color: '#28a745', border: '1px solid #28a745', borderRadius: '5px', fontWeight: 'bold' }}>
                                +10
                            </button>
                            <button 
                                type="button" 
                                onClick={() => adjustCount(50)} 
                                style={{ padding: '15px', fontSize: '1.1em', backgroundColor: '#e9ecef', color: '#28a745', border: '1px solid #28a745', borderRadius: '5px', fontWeight: 'bold' }}>
                                +50
                            </button>
                            <button 
                                type="button" 
                                onClick={() => setNewCount('0')} 
                                style={{ padding: '15px', fontSize: '1.1em', backgroundColor: '#6c757d', color: 'white', border: 'none', borderRadius: '5px', fontWeight: 'bold' }}>
                                CERO
                            </button>
                        </div>
                        
                        {/* Botones de Acción Final */}
                        <div style={{ display: 'flex', gap: '10px' }}>
                            <button 
                                onClick={handleAjustarConteo}
                                disabled={loading}
                                className="reconteo-pda-btn-adjust"
                            >
                                Registrar Ajuste
                            </button>
                            <button 
                                onClick={() => setIsModalOpen(false)}
                                className="reconteo-pda-btn-cancel"
                            >
                                Cancelar
                            </button>
                        </div>
                    </div>
                )}
            </Modal>

            {loading && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(255, 255, 255, 0.9)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
                    <div className="loading-spinner"></div>
                </div>
            )}
        </div>
    );
}