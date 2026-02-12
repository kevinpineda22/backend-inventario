import React, { useEffect, useState, useRef } from "react";
import { toast, ToastContainer } from "react-toastify";
import Swal from "sweetalert2";
import { supabase } from "../supabaseClient"; 
import CamaraScanner from "./Camara.jsx";
import { LectorScanner } from "./ScannerFisico.jsx";
import { Repeat, Scan } from "lucide-react"; // Importamos Repeat y Scan (por si no estaba)
import "./ScannerInventario.css";
import { getAssetUrl } from "../config/storage";
import BusquedaDescripcion from "./BusquedaDescripcion.jsx"; // ✅ NUEVO: Importar el componente de búsqueda por descripción

// Acepta la nueva prop setParentOpcion
function ScannerInventario({ setParentOpcion }) {
    // --- Estados Principales ---
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [mensaje, setMensaje] = useState("Inicializando...");
    
    // --- Estados del Formulario Inicial ---
    const [inventariosDisponibles, setInventariosDisponibles] = useState([]);
    const [selectedInventarioId, setSelectedInventarioId] = useState("");
    const [descripcionZona, setDescripcionZona] = useState("");
    const [fotoZona, setFotoZona] = useState(null);
    const [fotoURL, setFotoURL] = useState("");
    const [fotoError, setFotoError] = useState(""); // Nuevo estado para error de foto
    const fileInputRef = useRef(null);
    
    // --- Estados del Proceso de Conteo Activo ---
    const [inventarioActivo, setInventarioActivo] = useState(null);
    const [zonaActivaId, setZonaActivaId] = useState(null);
    const [itemsPermitidos, setItemsPermitidos] = useState(new Set());
    const [modoEscaneo, setModoEscaneo] = useState(null);
    const [totalEscaneados, setTotalEscaneados] = useState(0);
    
    // ✅ NUEVO: Estado para ubicación (Punto de Venta o Bodega)
    const [ubicacionActual, setUbicacionActual] = useState("punto_venta");

    // --- LÓGICA DE INICIALIZACIÓN INTELIGENTE (SIN CAMBIOS) ---
    useEffect(() => {
        const initialize = async () => {
            const storedEmail = localStorage.getItem("correo_empleado");
            if (!storedEmail) {
                setMensaje("No se pudo identificar al usuario. Por favor, inicia sesión.");
                setLoading(false);
                return;
            }
            setUser({ email: storedEmail });

            // 1. Intentamos reanudar una sesión de zona existente para este usuario
            try {
                setMensaje("Buscando sesión de conteo activa...");
                const res = await fetch(`https://backend-inventario.vercel.app/api/operario/zona-activa/${storedEmail}`);
                const data = await res.json();

                if (data.success && data.zonaActiva) {
                    // ¡Sesión encontrada! Saltamos el formulario y vamos directo al conteo.
                    const { id: zonaId, descripcion_zona, inventario } = data.zonaActiva;
                    await cargarDatosDeInventario(inventario, zonaId, descripcion_zona);
                    return; // Detenemos la ejecución para no buscar otros inventarios
                }
                
                // 2. Si no hay sesión activa, buscamos inventarios disponibles para iniciar una nueva.
                await fetchActiveInventories();

            } catch (err) {
                setMensaje(`Error de red: ${err.message}`);
                setLoading(false);
            }
        };
        initialize();
    }, []);

    const fetchActiveInventories = async () => {
        setMensaje("Buscando inventarios disponibles...");
        try {
            // ✅ Opcional: Filtrar por sede si se agrega lógica para obtener sede del usuario (ej. desde localStorage o API)
            // const sedeUsuario = localStorage.getItem("sede_usuario") || ""; // Implementar si es necesario
            // const url = sedeUsuario ? `https://backend-inventario.vercel.app/api/operario/inventarios-activos?sede=${encodeURIComponent(sedeUsuario)}` : "https://backend-inventario.vercel.app/api/operario/inventarios-activos";
            const res = await fetch("https://backend-inventario.vercel.app/api/operario/inventarios-activos");
            const data = await res.json();
            if (data.success) {
                setInventariosDisponibles(data.inventarios || []);
                setMensaje(data.inventarios.length > 0 ? "Selecciona un inventario para comenzar tu conteo." : "No hay inventarios activos.");
            } else {
                setInventariosDisponibles([]);
                setMensaje("Error al cargar la lista de inventarios.");
            }
        } catch (err) {
            setInventariosDisponibles([]);
            setMensaje(`Error de red: ${err.message}`);
        } finally {
            setLoading(false);
        }
    };
    
    const cargarDatosDeInventario = async (inventario, zonaId, descZona) => {
        setLoading(true);
        try {
            // ✅ CAMBIO: Bloquear si no hay sede válida, sin asignar por defecto
            if (!inventario.sede || inventario.sede.trim() === "") {
                toast.error("El inventario seleccionado no tiene una sede definida. Contacte al administrador para corregir el inventario.");
                setInventarioActivo(null);
                setZonaActivaId(null);
                setMensaje("Error: Inventario sin sede definida. Selecciona otro inventario.");
                return;
            }

            const resItems = await fetch(`https://backend-inventario.vercel.app/api/operario/items-por-inventario/${inventario.consecutivo}?sede=${encodeURIComponent(inventario.sede)}`);
            const dataItems = await resItems.json();
            if (!dataItems.success) throw new Error(dataItems.message);
            
            console.log(`📡 SEÑAL DEL BACKEND: Se recibieron ${dataItems.count} items.`);

            setInventarioActivo(inventario);
            setZonaActivaId(zonaId);
            setItemsPermitidos(new Set(dataItems.items));
            
            // ✅ NUEVO: Mensaje diferente si es sin código de barras
            if (inventario.sin_codigo_barras) {
                setMensaje(`✅ Conteo en "${descZona || inventario.descripcion}". Este inventario usa búsqueda por DESCRIPCIÓN.`);
            } else {
                setMensaje(`✅ Conteo en "${descZona || inventario.descripcion}". Elige un modo de escaneo.`);
            }
        } catch (error) {
            toast.error(`❌ Error al cargar datos: ${error.message}`);
            setInventarioActivo(null);
            setZonaActivaId(null);
        } finally {
            setLoading(false);
        }
    };

    const handleIniciarConteo = async (e) => {
        e.preventDefault();
        if (!selectedInventarioId || !user?.email) {
            toast.error("Por favor, selecciona un inventario.");
            return;
        }
        if (fotoZona && fotoError) {
            toast.error(fotoError);
            return;
        }
        const inventarioElegido = inventariosDisponibles.find(inv => inv.id === selectedInventarioId);
        if (!inventarioElegido) {
            toast.error("Inventario no encontrado.");
            return;
        }

        setLoading(true);
        setMensaje("Creando sesión de zona...");
        try {
            let uploadedFotoUrl = "";
            if (fotoZona) {
                const formData = new FormData();
                formData.append("file", fotoZona);
                formData.append("filename", fotoZona.name);
                const resFoto = await fetch("https://backend-inventario.vercel.app/api/admin/subir-foto", { method: 'POST', body: formData });
                const dataFoto = await resFoto.json();
                if (!dataFoto.success) throw new Error(dataFoto.message || "No se pudo subir la foto de la zona.");
                uploadedFotoUrl = dataFoto.url;
                setFotoURL(uploadedFotoUrl);
            }

            const resZona = await fetch(`https://backend-inventario.vercel.app/api/operario/iniciar-zona`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    inventarioId: selectedInventarioId,
                    operario_email: user.email,
                    descripcion_zona: descripcionZona,
                    foto_url: uploadedFotoUrl
                })
            });
            
            const dataZona = await resZona.json();
            if (!resZona.ok) throw new Error(dataZona.message);
            
            await cargarDatosDeInventario(inventarioElegido, dataZona.zonaId, descripcionZona);

        } catch (error) {
            toast.error(`❌ Error: ${error.message}`);
        } finally {
            setLoading(false);
        }
    };
    
    const resetParaNuevaZona = () => {
        setInventarioActivo(null);
        setZonaActivaId(null);
        setItemsPermitidos(new Set());
        setModoEscaneo(null);
        setTotalEscaneados(0);
        setSelectedInventarioId("");
        setDescripcionZona("");
        setFotoZona(null);
        setFotoURL("");
        setUbicacionActual("punto_venta"); // ✅ Resetear ubicación
        fetchActiveInventories(); 
    };

    const processFinalization = async () => {
        setLoading(true);
        try {
            const res = await fetch(`https://backend-inventario.vercel.app/api/operario/finalizar-zona/${zonaActivaId}`, { method: 'PATCH' });
            const data = await res.json();
            if (!res.ok) throw new Error(data.message);
            toast.success("✅ ¡Zona finalizada con éxito! Puedes seleccionar otro inventario o zona.");
            resetParaNuevaZona();
        } catch (error) {
            toast.error(`❌ Error al finalizar la zona: ${error.message}`);
        } finally {
            setLoading(false);
        }
    };

    const finalizarMiZona = async () => {
        if (!zonaActivaId) {
            toast.error("❌ No hay una zona activa para finalizar.");
            return;
        }

        // 1. VALIDACIÓN: Obtener productos faltantes (SOLO CON EXISTENCIA > 0, FILTRADO POR SEDE Y CONSECUTIVO)
        setLoading(true);
        let itemsFaltantes = [];
        try {
            // ✅ CAMBIO: Pasar sede y consecutivo para filtrar
            const resFaltantes = await fetch(`https://backend-inventario.vercel.app/api/operario/productos-sin-conteo-con-existencia-global/${zonaActivaId}?sede=${encodeURIComponent(inventarioActivo.sede)}&consecutivo=${encodeURIComponent(inventarioActivo.consecutivo)}`);
            const dataFaltantes = await resFaltantes.json();
            
            if (!resFaltantes.ok || !dataFaltantes.success) {
                throw new Error(dataFaltantes.message || "Error al verificar productos faltantes.");
            }
            itemsFaltantes = dataFaltantes.itemsFaltantes || [];
        } catch (error) {
            toast.error(`Error al validar faltantes: ${error.message}`);
            setLoading(false);
            return;
        } finally {
             setLoading(false);
        }

        if (itemsFaltantes.length === 0) {
            // No hay faltantes con existencia, proceder directamente
            const result = await Swal.fire({
                title: "Finalizar Conteo de Zona",
                text: `¿Estás seguro de que has terminado de contar la zona "${descripcionZona || 'actual'}"? No hay productos con existencia pendientes de contar.`,
                icon: "question",
                showCancelButton: true,
                confirmButtonText: "Sí, Finalizar Zona",
                cancelButtonText: "Cancelar",
            });
            
            if (result.isConfirmed) {
                await processFinalization();
            }
        } else {
            // Hay faltantes con existencia - Mostrar modal personalizado
            setItemsFaltantesList(itemsFaltantes);
            setShowFaltantesModal(true);
        }
    };

    // ✅ NUEVOS ESTADOS para el modal mejorado
    const [itemsFaltantesList, setItemsFaltantesList] = useState([]);
    const [showFaltantesModal, setShowFaltantesModal] = useState(false);
    // ✅ CAMBIO: Cambiar de Map a objeto simple para evitar problemas de estado
    const [faltantesProcessed, setFaltantesProcessed] = useState({}); // item_id -> { status: 'sin_stock' | 'revisar', motivo: string }

    // ✅ FUNCIÓN: Marcar producto como procesado (con logs de depuración)
    const handleMarkProduct = (item_id, status) => {
        console.log("🔍 Marcando producto:", item_id, "con status:", status);
        console.log("🔍 Estado anterior:", faltantesProcessed);
        // ✅ CAMBIO: Usar objeto en lugar de Map
        setFaltantesProcessed(prev => {
            const newState = { ...prev, [item_id]: { status } };
            console.log("🔍 Estado nuevo:", newState);
            return newState;
        });
    };

    // ✅ FUNCIÓN: Finalizar después de procesar faltantes (sin cambios)
    const handleFinalizarConFaltantes = async () => {
        const totalFaltantes = itemsFaltantesList.length;
        const procesados = Object.keys(faltantesProcessed).length;
        const sinProcesar = totalFaltantes - procesados;

        let mensaje = `Total: ${totalFaltantes} productos\n`;
        mensaje += `Procesados: ${procesados}\n`;
        if (sinProcesar > 0) {
            mensaje += `Pendientes: ${sinProcesar}\n\n¿Continuar?`;
        } else {
            mensaje += "\n¡Todos procesados!";
        }

        const result = await Swal.fire({
            title: "Finalizar Zona",
            text: mensaje,
            icon: sinProcesar > 0 ? "warning" : "success",
            showCancelButton: true,
            confirmButtonText: "Sí, Finalizar",
            cancelButtonText: "Continuar",
        });

        if (result.isConfirmed) {
            setShowFaltantesModal(false);
            setItemsFaltantesList([]);
            setFaltantesProcessed({});
            await processFinalization();
        }
    };

    // Validación y manejo de archivos de imagen (sin cambios)
    const handleFotoChange = (e) => {
        setFotoError("");
        const file = e.target.files[0];
        if (!file) {
            setFotoZona(null);
            return;
        }
        const validTypes = [
            "image/jpeg", "image/png", "image/webp", "image/bmp", "image/gif", "image/jpg"
        ];
        if (!validTypes.includes(file.type)) {
            setFotoError("Formato no soportado. Usa JPG, PNG, WEBP, BMP o GIF.");
            setFotoZona(null);
            return;
        }
        if (file.size > 8 * 1024 * 1024) {
            setFotoError("La imagen es demasiado grande. Máximo 8MB.");
            setFotoZona(null);
            return;
        }
        const cleanName = `zona_${Date.now()}.${(file.name.split('.').pop() || 'jpg').replace(/[^a-zA-Z0-9]/g, '')}`;
        Object.defineProperty(file, 'name', { value: cleanName, writable: true });
        setFotoZona(file);
    };

    // --- MANEJO DEL RE-CONTEO ---
    const handleReconteoClick = () => {
        // Llama a la función del componente padre para cambiar la vista
        if (setParentOpcion) {
            setParentOpcion("recontar");
        }
    };

    // --- RENDERIZADO ---
    return (
        <div className="app-container">
            <div className="header-container">
                <img src={getAssetUrl("logoMK.webp")} alt="Logo Merkahorro" className="logo" />
            </div>
            <div className="main-container">
                <div className="scanner-card">
                    <h1 className="scanner-title">Inventario de Operario</h1>
                    <ToastContainer position="top-center" autoClose={3000} hideProgressBar={false} />
                    {loading && <div className="loading-overlay"><div className="loading-spinner"></div></div>}
                    
                    {/* ✅ MEJORADO: Mostrar mensaje más claro */}
                    {mensaje && !inventarioActivo && (
                        <p className="scanner-message">{mensaje}</p>
                    )}

                    {!inventarioActivo ? (
                        <form onSubmit={handleIniciarConteo} className="inventory-start-form">
                            
                            {/* Formulario de Inicio */}
                            <select
                                value={selectedInventarioId}
                                onChange={(e) => setSelectedInventarioId(e.target.value)}
                                className="category-select"
                                required
                                disabled={loading || inventariosDisponibles.length === 0}
                            >
                                <option value="" disabled>
                                    {inventariosDisponibles.length > 0 ? 'Selecciona un Inventario...' : 'No hay inventarios activos'}
                                </option>
                                {inventariosDisponibles.map((inv) => (
                                    <option key={inv.id} value={inv.id}>
                                        {`#${inv.consecutivo} - ${inv.categoria} (${inv.descripcion})`}
                                    </option>
                                ))}
                            </select>

                            <textarea
                                placeholder="Descripción de tu zona (ej. Pasillo 5)"
                                value={descripcionZona}
                                onChange={(e) => setDescripcionZona(e.target.value)}
                                className="zone-description"
                                disabled={!selectedInventarioId || loading}
                            />
                            
                            <div
                                onClick={() => !loading && selectedInventarioId && fileInputRef.current?.click()}
                                className={`photo-upload ${!selectedInventarioId || loading ? 'disabled' : ''}`}
                            >
                                <input
                                    type="file"
                                    accept="image/jpeg,image/png,image/webp,image/bmp,image/gif,image/jpg"
                                    ref={fileInputRef}
                                    className="file-input"
                                    onChange={handleFotoChange}
                                    disabled={!selectedInventarioId || loading}
                                />
                                <span>{fotoZona ? `Archivo: ${fotoZona.name}` : "Haz clic o arrastra una foto"}</span>
                            </div>
                            {fotoError && (
                                <p style={{ color: "red", marginTop: "0.5rem", fontSize: "0.95rem" }}>
                                    {fotoError}
                                </p>
                            )}
                            {fotoURL && <img src={fotoURL} alt="Previsualización" className="photo-preview" />}

                            {/* Botón Iniciar Conteo de Zona */}
                            <button type="submit" className="start-inventory-btn" disabled={!selectedInventarioId || loading}>
                                <Scan size={20} style={{ marginRight: 8 }} /> Iniciar Conteo de Zona 
                            </button>
                            
                            {/* BOTÓN DE RE-CONTEO DENTRO DEL FORMULARIO */}
                            <button
                                type="button"
                                onClick={handleReconteoClick}
                                disabled={loading}
                                className="start-inventory-btn"
                                style={{
                                    marginTop: '15px',
                                    backgroundColor: '#dc3545', // Un color que resalte como "acción especial"
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '10px'
                                }}
                            >
                                <Repeat size={20} /> Recontar por Diferencias Notables
                            </button>

                            {/* ✅ MODIFICADO: Mensaje actualizado */}
                            {selectedInventarioId && inventariosDisponibles.find(inv => inv.id === selectedInventarioId)?.sin_codigo_barras && (
                                <div style={{
                                    padding: '15px',
                                    backgroundColor: '#fff3cd',
                                    border: '2px solid #ffc107',
                                    borderRadius: '8px',
                                    marginTop: '15px',
                                    textAlign: 'center'
                                }}>
                                    <strong style={{ fontSize: '16px' }}>📝 Inventario con Búsqueda por Descripción</strong>
                                    <p style={{ margin: '8px 0 0 0', fontSize: '14px', color: '#856404' }}>
                                        Este inventario permite <strong>buscar por descripción</strong> como método principal Y <strong>usar PDA</strong> para códigos de barras existentes.
                                    </p>
                                </div>
                            )}

                        </form>
                    ) : (
                        <div className="scan-section">
                            {/* Vista de Escaneo Activo (Sin Cambios) */}
                            <h4 className="inventory-in-progress-title">
                                Conteo en marcha: <strong>{inventarioActivo.descripcion}</strong>
                            </h4>
                            <p>Zona: <strong>{descripcionZona || 'General'}</strong></p>
                            
                            {/* ✅ NUEVO: Selector de Ubicación (Punto de Venta o Bodega) */}
                            <div style={{
                                padding: '15px',
                                backgroundColor: '#e8f5e9',
                                border: '2px solid #4caf50',
                                borderRadius: '8px',
                                marginBottom: '15px',
                                textAlign: 'center'
                            }}>
                                <label htmlFor="ubicacion-selector" style={{
                                    display: 'block',
                                    fontSize: '16px',
                                    fontWeight: 'bold',
                                    marginBottom: '10px',
                                    color: '#2e7d32'
                                }}>
                                    📍 Ubicación del Conteo:
                                </label>
                                <select
                                    id="ubicacion-selector"
                                    value={ubicacionActual}
                                    onChange={(e) => {
                                        setUbicacionActual(e.target.value);
                                        toast.success(`Ubicación cambiada a: ${e.target.value === 'punto_venta' ? 'Punto de Venta' : 'Bodega'}`);
                                    }}
                                    style={{
                                        padding: '12px',
                                        fontSize: '16px',
                                        fontWeight: 'bold',
                                        borderRadius: '8px',
                                        border: '2px solid #4caf50',
                                        width: '100%',
                                        maxWidth: '300px',
                                        cursor: 'pointer',
                                        backgroundColor: 'white'
                                    }}
                                    disabled={loading}
                                >
                                    <option value="punto_venta">🏪 Punto de Venta</option>
                                    <option value="bodega">📦 Bodega</option>
                                </select>
                                <p style={{ fontSize: '12px', color: '#666', marginTop: '8px' }}>
                                    Puedes cambiar la ubicación en cualquier momento durante el conteo
                                </p>
                            </div>
                            
                            {/* ✅ MODIFICADO: Badge actualizado */}
                            {inventarioActivo.sin_codigo_barras && (
                                <div style={{
                                    padding: '15px',
                                    backgroundColor: '#d1ecf1',
                                    border: '2px solid #17a2b8',
                                    borderRadius: '8px',
                                    marginBottom: '15px',
                                    textAlign: 'center'
                                }}>
                                    <strong style={{ fontSize: '18px', color: '#0c5460' }}>
                                        ✅ Conteo "{descripcionZona || inventarioActivo.descripcion}"
                                    </strong>
                                    <p style={{ margin: '8px 0 0 0', fontSize: '14px', color: '#0c5460' }}>
                                        Usa <strong>búsqueda por descripción</strong> para la mayoría de productos O <strong>PDA</strong> para los que tengan código de barras.
                                    </p>
                                </div>
                            )}
                            
                            <p className="total-scanned">Unidades contadas en esta zona: {totalEscaneados.toLocaleString('es-CO')}</p>
                            
                            {!modoEscaneo ? (
                                <div className="scan-options-grid">
                                    {!inventarioActivo.sin_codigo_barras ? (
                                        // ✅ Inventarios normales: Cámara o PDA
                                        <>
                                            <button onClick={() => setModoEscaneo("camara")} className="camera-btn" disabled={loading}>
                                                📷 Usar Cámara
                                            </button>
                                            <button onClick={() => setModoEscaneo("lector")} className="scanner-btn" disabled={loading}>
                                                🔍 Usar PDA
                                            </button>
                                        </>
                                    ) : (
                                        // ✅ MODIFICADO: Solo 2 opciones para inventarios sin código de barras
                                        <>
                                            <button 
                                                onClick={() => setModoEscaneo("busqueda")} 
                                                className="scanner-btn" 
                                                disabled={loading}
                                                style={{ 
                                                    backgroundColor: '#17a2b8',
                                                    border: '2px solid #138496',
                                                    fontSize: '16px',
                                                    padding: '18px'
                                                }}
                                            >
                                                📝 Buscar por Descripción
                                            </button>
                                            <button 
                                                onClick={() => setModoEscaneo("lector")} 
                                                className="scanner-btn" 
                                                disabled={loading}
                                                style={{ 
                                                    fontSize: '16px',
                                                    padding: '18px'
                                                }}
                                            >
                                                🔍 Usar PDA
                                            </button>
                                        </>
                                    )}
                                </div>
                            ) : (
                                <>
                                    {modoEscaneo === 'camara' && <CamaraScanner zonaId={zonaActivaId} inventarioId={inventarioActivo.id} user={user} itemsPermitidos={itemsPermitidos} ubicacion={ubicacionActual} setTotalEscaneados={setTotalEscaneados} finalizarZona={finalizarMiZona} setLoading={setLoading} loading={loading} />}
                                    {modoEscaneo === 'lector' && <LectorScanner zonaId={zonaActivaId} inventarioId={inventarioActivo.id} user={user} itemsPermitidos={itemsPermitidos} consecutivo={inventarioActivo.consecutivo} sede={inventarioActivo.sede} categoriaInventario={inventarioActivo.categoria} ubicacion={ubicacionActual} setTotalEscaneados={setTotalEscaneados} finalizarZona={finalizarMiZona} setLoading={setLoading} loading={loading} />}
                                    
                                    {/* ✅ NUEVO: Componente de búsqueda por descripción */}
                                    {modoEscaneo === 'busqueda' && (
                                        <BusquedaDescripcion 
                                            zonaId={zonaActivaId}
                                            inventarioId={inventarioActivo.id}
                                            consecutivo={inventarioActivo.consecutivo}
                                            sede={inventarioActivo.sede}
                                            user={user}
                                            itemsPermitidos={itemsPermitidos}
                                            ubicacion={ubicacionActual}
                                            setTotalEscaneados={setTotalEscaneados}
                                            finalizarZona={finalizarMiZona}
                                            setLoading={setLoading}
                                            loading={loading}
                                        />
                                    )}
                                    
                                    <button onClick={() => setModoEscaneo(null)} className="change-mode-btn" disabled={loading}>
                                        ← Cambiar Modo de Registro
                                    </button>
                                </>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* ✅ MODAL SIMPLIFICADO: Productos Faltantes para PDA (SOLO CON EXISTENCIA) */}
            {showFaltantesModal && (
                <div className="faltantes-modal-overlay">
                    <div className="faltantes-modal-pda">
                        <div className="faltantes-header-pda">
                            <h3 className="faltantes-title-pda">
                                ⚠️ Productos con Existencia Pendientes
                            </h3>
                            <p className="faltantes-subtitle-pda">
                                {itemsFaltantesList.length} productos con existencia sin contar
                            </p>
                            <div className="faltantes-progress-pda">
                                <span>{Object.keys(faltantesProcessed).length} / {itemsFaltantesList.length}</span>
                                <div className="progress-bar-pda">
                                    <div 
                                        className="progress-fill-pda"
                                        style={{ width: `${(Object.keys(faltantesProcessed).length / itemsFaltantesList.length) * 100}%` }}
                                    ></div>
                                </div>
                            </div>
                        </div>

                        <div className="faltantes-body-pda">
                            <div className="faltantes-instructions-pda">
                                <div className="instruction-buttons-pda">
                                    <div className="instruction-btn-demo no-stock">📦 Sin Stock Físico</div>
                                    <div className="instruction-btn-demo scan">📱 Ir a Contar</div>
                                </div>
                                <p style={{ fontSize: '12px', color: '#666', textAlign: 'center', marginTop: '8px' }}>
                                    Solo se muestran productos con existencia teórica &gt; 0
                                </p>
                            </div>

                            <div className="faltantes-list-pda">
                                {itemsFaltantesList.map((item, index) => {
                                    // ✅ CAMBIO: Usar item.item en lugar de item.item_id
                                    const processed = faltantesProcessed[item.item];
                                    const isProcessed = processed !== undefined;
                                    
                                    return (
                                        <div 
                                            // ✅ CAMBIO: Usar item.item como key
                                            key={item.item} 
                                            className={`faltante-item-pda ${isProcessed ? 'processed' : ''}`}
                                        >
                                            <div className="item-info-pda">
                                                <div className="item-header-pda">
                                                    <span className="item-number-pda">#{index + 1}</span>
                                                    {/* ✅ CAMBIO: Mostrar item.item */}
                                                    <span className="item-id-pda">{item.item}</span>
                                                    {/* ✅ NUEVO: Mostrar existencia teórica */}
                                                
                                                    {isProcessed && (
                                                        <span className="status-badge-pda">
                                                            {processed.status === 'sin_stock' ? '📦' : '📱'}
                                                        </span>
                                                    )}
                                                </div>
                                                <p className="item-description-pda">{item.descripcion}</p>
                                            </div>

                                            {!isProcessed ? (
                                                <div className="item-actions-pda">
                                                    <button
                                                        className="action-btn-pda no-stock-btn-pda"
                                                        onClick={(e) => {
                                                            e.stopPropagation(); // ✅ Prevenir propagación
                                                            // ✅ CAMBIO: Usar item.item
                                                            handleMarkProduct(item.item, 'sin_stock');
                                                        }}
                                                        title="Marcar como sin stock físico (aunque existe en sistema)"
                                                    >
                                                        📦 Sin Stock Físico
                                                    </button>
                                                    <button
                                                        className="action-btn-pda scan-btn-pda"
                                                        onClick={(e) => {
                                                            e.stopPropagation(); // ✅ Prevenir propagación
                                                            setShowFaltantesModal(false);
                                                            toast.info(`Busca y cuenta: ${item.item}`);
                                                        }}
                                                    >
                                                        📱 Contar Ahora
                                                    </button>
                                                </div>
                                            ) : (
                                                <button
                                                    className="undo-btn-pda"
                                                    onClick={(e) => {
                                                        e.stopPropagation(); // ✅ Prevenir propagación
                                                        // ✅ CAMBIO: Usar item.item
                                                        setFaltantesProcessed(prev => {
                                                            const newProcessed = { ...prev };
                                                            delete newProcessed[item.item];
                                                            return newProcessed;
                                                        });
                                                    }}
                                                >
                                                    ↩️ Cambiar
                                                </button>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        <div className="faltantes-footer-pda">
                            <button
                                className="modal-btn-pda cancel-btn-pda"
                                onClick={() => {
                                    setShowFaltantesModal(false);
                                    setItemsFaltantesList([]);
                                    setFaltantesProcessed({}); // ✅ Limpiar objeto
                                }}
                            >
                                ❌ Cancelar
                            </button>
                            <button
                                className="modal-btn-pda finish-btn-pda"
                                onClick={handleFinalizarConFaltantes}
                                disabled={Object.keys(faltantesProcessed).length === 0} // ✅ Usar Object.keys
                            >
                                ✅ Finalizar ({Object.keys(faltantesProcessed).length}/{itemsFaltantesList.length}) 
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export { ScannerInventario };