import express from 'express';
import multer from 'multer';
import { 
  iniciarZonaCarnesYFruver, 
  obtenerInventariosCarnesYFruver,
  obtenerItemsPorGrupo, 
  guardarInventario,
  consultarInventario, 
  obtenerZonaActivaCarnes,
  registrarProductoZonaActiva,
  obtenerProductosZonaActiva,
  eliminarProductoCarnesYFruver,
  actualizarEstadoInventarioCarnesYFruver,
  crearInventarioCarnesYFruver,
  buscarProductoPorCodigoDeBarras,
  obtenerHistorialDescargas,
  consecutivoExiste
} from '../controllers/CarnesYfruver.js';

const router = express.Router();

const parseFormData = multer().none(); // Middleware para procesar FormData sin archivos

// Endpoint para iniciar una zona en inventario_activoCarnesYfruver
router.post('/iniciar-inventarioCarnesYfruver', parseFormData, iniciarZonaCarnesYFruver);

// Endpoint para crear un nuevo inventario en inventario_carnesYfruver
router.post('/crear-inventario-carnesYfruver', parseFormData, crearInventarioCarnesYFruver);

// Endpoint para obtener los inventarios activos de carnes y fruver
router.get('/inventarios-carnesYfruver', obtenerInventariosCarnesYFruver);

// Endpoint para consultar el historial de inventarios en inventario_carnesYfruver
router.get('/consultar', consultarInventario);

// Endpoint para obtener los items por grupo en inventario_carnesYfruver
router.get('/items-por-grupo', obtenerItemsPorGrupo);

// Endpoint para obtener la zona activa de un operario en inventario_activoCarnesYfruver
router.get('/zona-activa/:email', obtenerZonaActivaCarnes);

// Endpoint para guardar el inventario
router.post('/guardar-inventario', parseFormData, guardarInventario);

// Endpoint para registrar un producto en tiempo real en la zona activa
router.post('/registrar-producto', parseFormData, registrarProductoZonaActiva);

// Endpoint para obtener los productos de la zona activa
router.get('/productos-zona/:zona_id', obtenerProductosZonaActiva);

// Endpoint para eliminar un producto de la zona activa
router.delete('/producto/:id', eliminarProductoCarnesYFruver);

// Endpoint para actualizar el estado de un inventario
router.patch('/actualizar-estado-inventario/:id', actualizarEstadoInventarioCarnesYFruver);

router.get('/producto-por-codigo', buscarProductoPorCodigoDeBarras);

// Agregar esta ruta al archivo routes/carnesYfruver.js
router.get('/historial-descargas/:email', obtenerHistorialDescargas);

// routes/carnesYfruver.js
router.get('/consecutivo-existe', consecutivoExiste);


export default router;