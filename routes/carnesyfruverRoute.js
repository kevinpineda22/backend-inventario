import express from 'express';
import { iniciarZonaCarnesYfruver } from '../controllers/CarnesYfruver.js';

const router = express.Router();

// Endpoint para iniciar zona en inventario_carnesYfruver
router.post('/iniciar-inventarioCarnesYfruver',iniciarZonaCarnesYfruver);

export default router;
