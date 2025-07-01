import express from 'express';
import {
  obtenerInventariosActivos,
  obtenerItemsPorConsecutivo,
  registrarEscaneo,
  obtenerHistorialInventario,
  eliminarDetalleInventario,
  finalizarInventario,
  asignarInventario
} from '../controllers/operarioController.js';

const router = express.Router();

router.get('/inventarios-activos', obtenerInventariosActivos);
router.get('/items-por-inventario/:consecutivo', obtenerItemsPorConsecutivo);
router.post('/registrar-escaneo', registrarEscaneo);
router.get('/historial/:inventario_id', obtenerHistorialInventario);
router.delete('/detalle-inventario/:id', eliminarDetalleInventario);
router.post('/finalizar-inventario/:id', finalizarInventario);
router.patch('/inventario/asignar/:inventarioId', asignarInventario);

export default router;
