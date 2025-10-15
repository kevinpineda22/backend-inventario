import express from 'express';
import {
  compararInventario,
  getInventarioDetalle,
  obtenerDiferenciasNotables,
} from '../controllers/reporteController.js';

const router = express.Router();

router.get("/comparar-inventario/:id", compararInventario);
router.get("/TotalInventario", getInventarioDetalle);
// ✅ RUTA REQUERIDA: Define el endpoint con el parámetro dinámico
router.get("/diferencias-notables/:consecutivo", obtenerDiferenciasNotables);

export default router;
