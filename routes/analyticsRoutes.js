import express from "express";
import {
  cic_overview, cic_series_daily, cic_top_items, cic_by_bodega, cic_inventarios_resumen,

  cf_overview, cf_series_daily, cf_top_items, cf_by_bodega, cf_by_operario,
} from "../controllers/analyticsController.js";

const router = express.Router();

// Cíclico
router.get("/ciclico/overview",     cic_overview);
router.get("/ciclico/series/daily", cic_series_daily);
router.get("/ciclico/top/items",    cic_top_items);
router.get("/ciclico/by/bodega",    cic_by_bodega);
router.get("/ciclico/inventarios/resumen", cic_inventarios_resumen); // Nueva ruta

// Carnes & Fruver
router.get("/carnesyfruver/overview",     cf_overview);
router.get("/carnesyfruver/series/daily", cf_series_daily);
router.get("/carnesyfruver/top/items",    cf_top_items);
router.get("/carnesyfruver/by/bodega",    cf_by_bodega);
router.get("/carnesyfruver/by/operario",  cf_by_operario);

export default router;
