import express from 'express';
import { iniciarZonaCarnesYFruver, obtenerInventariosCarnesYFruver,obtenerItemsPorGrupo } from '../controllers/CarnesYfruver.js';

const router = express.Router();

// Endpoint para iniciar zona en inventario_carnesYfruver
router.post('/iniciar-inventarioCarnesYfruver',iniciarZonaCarnesYFruver);

// Endpoint para obtener los inventarios que suben de carnes y fruver
router.get('/inventarios-carnesYfruver', obtenerInventariosCarnesYFruver);

// Endpoint para obtener los items por grupo en inventario_carnesYfruver
router.get('/items-por-grupo', obtenerItemsPorGrupo);

export default router;
