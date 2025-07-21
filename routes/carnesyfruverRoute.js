import express from 'express';
import { iniciarZonaCarnesYFruver, obtenerInventariosCarnesYFruver,obtenerItemsPorGrupo, guardarInventario,consultarInventario, obtenerZonaActivaCarnes,registrarProductoZonaActiva,obtenerProductosZonaActiva } from '../controllers/CarnesYfruver.js';

const router = express.Router();

// Endpoint para iniciar zona en inventario_carnesYfruver
router.post('/iniciar-inventarioCarnesYfruver',iniciarZonaCarnesYFruver);

// Endpoint para obtener los inventarios que suben de carnes y fruver
router.get('/inventarios-carnesYfruver', obtenerInventariosCarnesYFruver);

// Endpoint para consultar un inventario específico en inventario_carnesYfruver
router.get('/consultar', consultarInventario);

// Endpoint para obtener los items por grupo en inventario_carnesYfruver
router.get('/items-por-grupo', obtenerItemsPorGrupo);

// Endpoint para obtener la zona activa de un operario en inventario_carnesYfruver
router.get('/zona-activa/:email', obtenerZonaActivaCarnes);

// Endpoint para guardar el inventario
router.post('/guardar-inventario', guardarInventario);

// Endpoint para registrar un producto en tiempo real en la zona activa
router.post('/registrar-producto', registrarProductoZonaActiva);

// Endpoint para obtener los productos de la zona activa
router.get('/productos-zona/:zona_id', obtenerProductosZonaActiva);

export default router;
