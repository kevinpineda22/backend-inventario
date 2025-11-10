import express from 'express';
import {
  obtenerInventariosActivos,
  obtenerItemsPorConsecutivo,
  registrarEscaneo,
  obtenerHistorialInventario,
  eliminarDetalleInventario,
  asignarInventario,
  obtenerProductosPorConsecutivo,
  iniciarSesionDeZona,
  finalizarSesionDeZona,
  obtenerZonaActiva,
  getProductosSinConteoConExistenciaGlobal,
  obtenerInventariosParaReconteo,
  registrarAjusteReconteo,
  buscarProductoPorDescripcion,
  guardarReconteoTemporal,
  obtenerGuardadosReconteo,
  actualizarGuardadoReconteo,
  eliminarGuardadoReconteo
} from '../controllers/operarioController.js';

const router = express.Router();

router.get('/inventarios-activos', obtenerInventariosActivos);
router.get('/items-por-inventario/:consecutivo', obtenerItemsPorConsecutivo);
router.post('/registrar-escaneo', registrarEscaneo);
router.get('/historial/:inventario_id', obtenerHistorialInventario);
router.delete('/detalle-inventario/:id', eliminarDetalleInventario);
router.patch('/inventario/asignar/:inventarioId', asignarInventario);
router.get('/productos-por-consecutivo/:consecutivo', obtenerProductosPorConsecutivo);
router.post('/iniciar-zona', iniciarSesionDeZona);
router.patch('/finalizar-zona/:zonaId', finalizarSesionDeZona); // ✅ Usamos la ruta y el método correctos
router.get('/zona-activa/:email', obtenerZonaActiva); 

// Nueva ruta para obtener productos sin conteo pero con existencia en la zona global
router.get('/productos-sin-conteo-con-existencia-global/:zonaId', getProductosSinConteoConExistenciaGlobal);
// ✅ NUEVA RUTA: Utiliza la función corregida para buscar inventarios activos (que pueden recontarse)
router.get('/inventarios-para-reconteo', obtenerInventariosParaReconteo);
// ✅ NUEVA RUTA: Para registrar el ajuste de re-conteo
router.post('/registrar-ajuste-reconteo', registrarAjusteReconteo);

// ✅ NUEVA RUTA: Búsqueda de productos por descripción (para inventarios sin código de barras)
router.get('/buscar-por-descripcion', buscarProductoPorDescripcion);

// ========================================================================
// RUTAS: Guardados Temporales de Reconteo
// ========================================================================
router.post('/guardar-reconteo-temporal', guardarReconteoTemporal);
router.get('/guardados-reconteo/:consecutivo/:item_id', obtenerGuardadosReconteo);
router.put('/guardado-reconteo/:id', actualizarGuardadoReconteo);
router.delete('/guardado-reconteo/:id', eliminarGuardadoReconteo);


export default router;
