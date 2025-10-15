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
  getProductosSinConteo, // ✅ Importamos la nueva función del controlador
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
// ✅ NUEVA RUTA: Para la validación de productos faltantes antes de finalizar la zona
router.get("/productos-sin-conteo/:zonaId", getProductosSinConteo); 

export default router;
