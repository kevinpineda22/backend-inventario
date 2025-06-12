import express from 'express';
import {
  registrarEscaneo,
  iniciarInventario,
  subirFoto,
  obtenerHistorialInventario,
  eliminarRegistroInventario,
  obtenerCategorias,
  finalizarInventario, // Controlador correcto
  upload // Middleware de multer para subir fotos
} from '../controllers/inventarioController.js';

const router = express.Router();

// 📂 Obtener lista de categorías
router.get('/categorias', obtenerCategorias);

// 🟢 Iniciar un nuevo inventario
router.post('/iniciar-inventario', iniciarInventario);

// 🔼 Subir foto de zona al bucket 'inventario'
router.post('/subir-foto', upload, subirFoto);

// 🚀 Registrar escaneo de producto
router.post('/registrar-escaneo', registrarEscaneo);

// 📄 Obtener historial de escaneos por inventario
router.get('/historial/:inventario_id', obtenerHistorialInventario);

// ❌ Eliminar registro específico del inventario
router.delete('/eliminar/:id', eliminarRegistroInventario);

// ✅ Finalizar un inventario
router.post('/finalizar-inventario/:id', finalizarInventario); // Corregido: usar finalizarInventario

export default router;