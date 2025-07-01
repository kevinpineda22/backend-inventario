import express from 'express';
import {
  crearInventarioYDefinirAlcance,
  obtenerInventariosFinalizados,
  actualizarEstadoInventario
} from '../controllers/adminController.js';
import { upload } from '../controllers/adminController.js';

const router = express.Router();

router.post('/crear-inventario', upload, crearInventarioYDefinirAlcance);
router.get("/inventarios-finalizados", obtenerInventariosFinalizados);
router.post('/actualizar-estado-inventario/:id', actualizarEstadoInventario);

export default router;
