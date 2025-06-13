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
  guardarAdminInventarioConExcel,
  obtenerGrupos,
  obtenerInventariosFinalizados,
  compararInventario,
  upload // ✅ Este es el middleware de multer correcto
} from '../controllers/inventarioController.js';

const router = express.Router();

// ✅ Obtener lista de grupos únicos desde productos
router.get('/grupos', obtenerGrupos);

// 🟢 Iniciar un nuevo inventario
router.post('/iniciar-inventario', iniciarInventario);

// 🔼 Subir foto de zona al bucket 'inventario/fotos-inventario'
router.post('/subir-foto', upload, subirFoto);

// 🚀 Registrar escaneo de producto
router.post('/registrar-escaneo', registrarEscaneo);

// 📄 Obtener historial de escaneos por inventario
router.get('/historial/:inventario_id', obtenerHistorialInventario);

// ❌ Eliminar registro específico del inventario
router.delete('/eliminar/:id', eliminarRegistroInventario);

// ✅ Finalizar un inventario
router.post('/finalizar-inventario/:id', finalizarInventario);

// ➕ Importar productos desde archivo Excel (envío como JSON)
router.post('/importar-productos', importarProductosDesdeExcel);

// 🧾 Guardar datos del formulario de administrador (sin Excel)
router.post('/guardar-admin-inventario', guardarAdminInventario);

// 📎 Guardar datos y archivo Excel (subido con FormData)
router.post('/guardar-admin-inventario-con-excel', upload, guardarAdminInventarioConExcel);

router.get("/inventarios-finalizados", obtenerInventariosFinalizados);

router.get("/comparar-inventario/:id", compararInventario);

export default router;
