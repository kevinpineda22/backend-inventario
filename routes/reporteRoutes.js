import express from 'express';
import {
  compararInventario,
  getInventarioDetalle,
  getDashboardInventarioCiclico 
} from '../controllers/reporteController.js';

const router = express.Router();

router.get("/comparar-inventario/:id", compararInventario);
router.get("/TotalInventario", getInventarioDetalle);
router.get("/dashboard-inventario-ciclico", getDashboardInventarioCiclico);

export default router;
