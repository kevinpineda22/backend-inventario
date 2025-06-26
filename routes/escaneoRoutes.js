import express from 'express';
import {
  // --- Controladores para la Base de Datos Maestra ---
  cargarMaestroDeProductos,
  buscarProductoMaestro,
  obtenerMaestroItems, // <-- Importamos el nuevo controlador para Carneo/Fruver

  // --- Controladores para el Administrador ---
  definirAlcanceInventario, // <-- Reemplaza al viejo 'importarProductosDesdeExcel'
  guardarAdminInventarioConExcel,
  obtenerInventariosFinalizados,
  actualizarEstadoInventario,

  // --- Controladores para el Operario (Scanner) ---
  obtenerInventariosActivos,
  obtenerItemsPorConsecutivo,
  registrarEscaneo, // <-- Unifica a 'registrarEscaneo' y 'EscaneoCamarayFisico'
  obtenerHistorialInventario,
  finalizarInventario,
  
  // --- Controladores de Reportes y Otros ---
  compararInventario,
  getInventarioDetalle,
  
  // --- Middleware ---
  upload
} from '../controllers/inventarioController.js'; // Asegúrate que la ruta a tu controlador sea correcta

const router = express.Router();


// =======================================================
// RUTAS PARA LA BASE DE DATOS MAESTRA
// =======================================================
// 1. Para subir el Excel de 68,000 productos y poblar las tablas maestras
router.post('/cargar-maestro', upload, cargarMaestroDeProductos);

// 2. Para buscar la info de un producto en tiempo real al escanear
router.get('/producto-maestro/:codigo_barras', buscarProductoMaestro);

// 3. Para el autocompletado del scanner de Carnes/Fruver
router.get('/maestro-items', obtenerMaestroItems); // <-- ¡NUEVA!


// =======================================================
// RUTAS PARA EL PANEL DE ADMINISTRADOR
// =======================================================
// 1. Guarda los datos del formulario y el archivo Excel del admin
router.post('/guardar-admin-inventario-con-excel', upload, guardarAdminInventarioConExcel);

// 2. Define el alcance (los items a contar) de un inventario específico
router.post('/definir-alcance-inventario', definirAlcanceInventario);

// 3. Obtiene los inventarios ya finalizados para la aprobación
router.get("/inventarios-finalizados", obtenerInventariosFinalizados);

// 4. Aprueba o rechaza un inventario finalizado
router.post('/actualizar-estado-inventario/:id', actualizarEstadoInventario);


// =======================================================
// RUTAS PARA EL OPERARIO (VISTA DEL SCANNER)
// =======================================================
// 1. Obtiene la lista de inventarios con estado 'activo' para el dropdown de selección
router.get('/inventarios-activos', obtenerInventariosActivos);

// 2. Obtiene los items permitidos para un inventario, una vez seleccionado
router.get('/items-por-inventario/:consecutivo', obtenerItemsPorConsecutivo);

// 3. Registra un nuevo conteo en `detalles_inventario`. Es el único endpoint para esto.
router.post('/registrar-escaneo', registrarEscaneo);

// 4. Obtiene el historial de escaneos para mostrarlo en la app del operario
router.get('/historial/:inventario_id', obtenerHistorialInventario);

// 5. Permite al operario finalizar su sesión de conteo
router.post('/finalizar-inventario/:id', finalizarInventario);


// =======================================================
// RUTAS DE REPORTES Y OTROS (Algunas necesitan refactorización futura)
// =======================================================
// TODO: Refactorizar 'compararInventario' para que sume desde 'detalles_inventario'
router.get("/comparar-inventario/:id", compararInventario);

// TODO: Refactorizar 'getInventarioDetalle' para el nuevo modelo de datos
router.get("/TotalInventario", getInventarioDetalle);


export default router;