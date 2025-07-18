import express from 'express';
import {
  cargarMaestroDeProductos,
  buscarProductoMaestro,
  obtenerMaestroItems,
  obtenerGruposMaestros,
  obtenerBarcodeParaItem,
  obtenerMaestroItemsPorGrupo,
  getEstadoActualMaestra,
  upsertItemsBatch,
  upsertCodigosBatch,
  desactivarItemsBatch,
  desactivarCodigosBatch
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

// Obtiene todos los IDs de items y códigos de barras existentes.
router.get('/estado-actual', getEstadoActualMaestra);

// POST /api/maestro/upsert-items
// Inserta o actualiza un lote de items.
router.post('/upsert-items', upsertItemsBatch);

// POST /api/maestro/upsert-codigos
// Inserta o actualiza un lote de códigos de barras.
router.post('/upsert-codigos', upsertCodigosBatch);

// POST /api/maestro/desactivar-items
// Desactiva (borrado lógico) un lote de items que ya no están en el Excel.
router.post('/desactivar-items', desactivarItemsBatch);

// POST /api/maestro/desactivar-codigos
// Desactiva (borrado lógico) un lote de códigos que ya no están en el Excel.
router.post('/desactivar-codigos', desactivarCodigosBatch);

export default router;
