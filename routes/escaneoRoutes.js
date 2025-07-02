/* import express from 'express';
import {
  // MAESTROS
  cargarMaestroDeProductos,
  buscarProductoMaestro,
  obtenerMaestroItems,
  obtenerGruposMaestros,
  // ADMIN
  crearInventarioYDefinirAlcance,
  obtenerInventariosFinalizados,
  actualizarEstadoInventario,
  // OPERARIO
  obtenerInventariosActivos,
  obtenerItemsPorConsecutivo,
  registrarEscaneo,
  obtenerHistorialInventario,
  eliminarDetalleInventario,
  finalizarInventario,
  obtenerBarcodeParaItem,
  obtenerMaestroItemsPorGrupo,
  obtenerProductosPorConsecutivo,
  // REPORTES (necesitan refactorizarse después)
  compararInventario,
  getInventarioDetalle,
  asignarInventario,
  // MIDDLEWARE
  upload
} from '../controllers/inventarioController.js';

const router = express.Router();

// =======================================================
// RUTAS PARA LA BASE DE DATOS MAESTRA
// =======================================================
// Para subir el Excel maestro y poblar las tablas
router.post('/cargar-maestro', upload, cargarMaestroDeProductos);

// Para buscar un producto por su código de barras en tiempo real
router.get('/producto-maestro/:codigo_barras', buscarProductoMaestro);

// Para el autocompletado del scanner de Carnes/Fruver
router.get('/maestro-items', obtenerMaestroItems);

// Para el dropdown de Categorías del Administrador
router.get('/grupos-maestros', obtenerGruposMaestros);


// =======================================================
// RUTAS PARA EL PANEL DE ADMINISTRADOR
// =======================================================
// Crea el inventario, sube el excel y define el alcance en una sola operación
router.post('/admin/crear-inventario', upload, crearInventarioYDefinirAlcance);

// Obtiene los inventarios ya finalizados para la aprobación
router.get("/inventarios-finalizados", obtenerInventariosFinalizados);

// Aprueba o rechaza un inventario finalizado
router.post('/actualizar-estado-inventario/:id', actualizarEstadoInventario);


// =======================================================
// RUTAS PARA EL OPERARIO (VISTA DEL SCANNER)
// =======================================================
// Obtiene la lista de inventarios con estado 'activo'
router.get('/inventarios-activos', obtenerInventariosActivos);

// Obtiene los items permitidos para un inventario, una vez seleccionado
router.get('/items-por-inventario/:consecutivo', obtenerItemsPorConsecutivo);

// Registra un nuevo conteo en `detalles_inventario`
router.post('/registrar-escaneo', registrarEscaneo);

// Obtiene el historial de escaneos para mostrarlo en la app
router.get('/historial/:inventario_id', obtenerHistorialInventario);

// Elimina un registro de escaneo específico
router.delete('/detalle-inventario/:id', eliminarDetalleInventario);

// Permite al operario finalizar su sesión de conteo
router.post('/finalizar-inventario/:id', finalizarInventario);


// =======================================================
// RUTAS DE REPORTES Y OTROS
// =======================================================
// TODO: Refactorizar 'compararInventario' para que sume desde 'detalles_inventario'
router.get("/comparar-inventario/:id", compararInventario);

// TODO: Refactorizar 'getInventarioDetalle' para el nuevo modelo de datos
router.get("/TotalInventario", getInventarioDetalle);

router.get('/barcode-for-item/:item_id', obtenerBarcodeParaItem);

router.get('/maestro-items-por-grupo', obtenerMaestroItemsPorGrupo);

router.get('/productos-por-consecutivo/:consecutivo', obtenerProductosPorConsecutivo);

router.patch('/inventario/asignar/:inventarioId', asignarInventario);

export default router;
 */