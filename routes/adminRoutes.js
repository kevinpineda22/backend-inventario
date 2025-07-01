import express from 'express';
import {
  crearInventarioYDefinirAlcance,
  obtenerInventariosFinalizados,
  actualizarEstadoInventario,
  // ✅ CORRECCIÓN: Importamos 'upload' desde aquí mismo
  upload 
} from '../controllers/adminController.js';

const router = express.Router();

// Ahora la ruta usa el 'upload' que se importa del mismo controlador
router.post('/crear-inventario', upload, crearInventarioYDefinirAlcance);
router.get("/inventarios-finalizados", obtenerInventariosFinalizados);
router.post('/actualizar-estado-inventario/:id', actualizarEstadoInventario);

export default router;
