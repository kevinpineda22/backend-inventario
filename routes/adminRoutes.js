import express from 'express';
import {
  crearInventarioYDefinirAlcance,
  obtenerInventariosFinalizados,
  actualizarEstadoInventario,
  subirFoto,
  uploadImage, // ✅ Importamos el middleware de IMAGEN
  uploadExcel,  // ✅ Importamos el middleware de EXCEL
  obtenerInventariosConZonas,
  crearInventarioCarnesYFruver,
  verificarZonaInventario,
  obtenerDetallesZona,
  finalizarInventarioCompleto,
  aplicarConteoDeZonaAprobada,
  notificarOperariosAprobados,  
  actualizarConteoCantidadProducto
} from '../controllers/adminController.js';
import multer from "multer"; // <-- agrega esta línea

const router = express.Router();
const parseFormData = multer().none(); // <-- agrega esta línea

// Ahora la ruta usa el 'upload' que se importa del mismo controlador
router.post('/crear-inventario', uploadExcel, crearInventarioYDefinirAlcance);
router.get("/inventarios-finalizados", obtenerInventariosFinalizados);
router.post('/actualizar-estado-inventario/:id', actualizarEstadoInventario);
router.post('/subir-foto', uploadImage, subirFoto);
router.get('/inventarios-con-zonas', obtenerInventariosConZonas);
router.post('/verificar-zona/:zona_id', verificarZonaInventario);

// Nuevo endpoint para crear inventario de carnes y fruver desde la maestra
router.post('/crear-inventario-carnesYfruver', parseFormData, crearInventarioCarnesYFruver);



router.get('/detalles-zona/:zona_id', obtenerDetallesZona);

router.patch('/finalizar-inventario/:inventarioId', finalizarInventarioCompleto); 

router.post('/aplicar-conteo/:zona_id', aplicarConteoDeZonaAprobada);

router.post('/notificar-operarios/:inventarioId', notificarOperariosAprobados);

// Ruta para actualizar el conteo de cantidad de un producto específico
router.patch('/inventario/consecutivos/:consecutivoId/productos/:itemId', actualizarConteoCantidadProducto);

export default router;
