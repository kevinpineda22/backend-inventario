import express from 'express';
import {
  compararInventario,
  getInventarioDetalle,
} from '../controllers/reporteController.js';

const router = express.Router();

router.get("/comparar-inventario/:id", compararInventario);
router.get("/TotalInventario", getInventarioDetalle);

export default router;
