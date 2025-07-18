import express from 'express';
import {
  cargarMaestroDeProductos,
  buscarProductoMaestro,
  obtenerMaestroItems,
  obtenerGruposMaestros,
  obtenerBarcodeParaItem,
  obtenerMaestroItemsPorGrupo,
} from '../controllers/maestroController.js';
// ✅ CORRECCIÓN: Ahora el import funcionará correctamente.
import { upload } from '../controllers/adminController.js'; 

const router = express.Router();

router.post('/cargar-maestro', upload, cargarMaestroDeProductos);
router.get('/producto-maestro/:codigo_barras', buscarProductoMaestro);
router.get('/maestro-items', obtenerMaestroItems);
router.get('/grupos-maestros', obtenerGruposMaestros);
router.get('/barcode-for-item/:item_id', obtenerBarcodeParaItem);
router.get('/maestro-items-por-grupo', obtenerMaestroItemsPorGrupo);

export default router;
