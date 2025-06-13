import express from 'express';
import {
  registrarEscaneo,
  iniciarInventario,
  subirFoto,
  obtenerHistorialInventario,
  eliminarRegistroInventario,
  finalizarInventario,
  importarProductosDesdeExcel,
  guardarAdminInventario,
  obtenerGrupos,
  upload,
  upload, guardarAdminInventarioConExcel
} from '../controllers/inventarioController.js';

const router = express.Router();

// ✅ Obtener lista de grupos únicos desde productos
router.get('/grupos', obtenerGrupos);

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
router.post('/finalizar-inventario/:id', finalizarInventario);

// ➕ Importar productos desde Excel (nuevo flujo admin)
router.post('/importar-productos', importarProductosDesdeExcel);

router.post("/guardar-admin-inventario", guardarAdminInventario);

router.post("/guardar-admin-inventario-con-excel", upload, guardarAdminInventarioConExcel);


export default router;
