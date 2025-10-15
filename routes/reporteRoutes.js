import express from 'express';
import {
  compararInventario,
  getInventarioDetalle,
  obtenerDiferenciasNotables,
} from '../controllers/reporteController.js';

const router = express.Router();

router.get("/comparar-inventario/:id", compararInventario);
router.get("/TotalInventario", getInventarioDetalle);
// ✅ NUEVA RUTA: Para el módulo de re-conteo
router.get("/diferencias-notables/:consecutivo", obtenerDiferenciasNotables);

export default router;
