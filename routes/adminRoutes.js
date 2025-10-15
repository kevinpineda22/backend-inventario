import express from 'express';
import {
  crearInventarioYDefinirAlcance,
  obtenerInventariosFinalizados,
  actualizarEstadoInventario,
  subirFoto,
  uploadImage, // ✅ Importamos el middleware de IMAGEN
  uploadExcel,  // ✅ Importamos el middleware de EXCEL
  obtenerInventariosConZonas,
  verificarZonaInventario,
  obtenerDetallesZona,
  finalizarInventarioCompleto,
  aplicarConteoDeZonaAprobada,
  notificarOperariosAprobados,  
  actualizarConteoCantidadProducto, 
  eliminarConsecutivo // ✅ Importamos la nueva función para eliminar un consecutivo completo
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


router.get('/detalles-zona/:zona_id', obtenerDetallesZona);

router.patch('/finalizar-inventario/:inventarioId', finalizarInventarioCompleto); 

router.post('/aplicar-conteo/:zona_id', aplicarConteoDeZonaAprobada);

router.post('/notificar-operarios/:inventarioId', notificarOperariosAprobados);

// Ruta para actualizar el conteo de cantidad de un producto específico
router.patch('/inventario/consecutivos/:consecutivoId/productos/:itemId', actualizarConteoCantidadProducto);

// ✅ NUEVA RUTA: Eliminar consecutivo completo
router.delete('/eliminar-consecutivo/:consecutivo', eliminarConsecutivo);

export default router;
