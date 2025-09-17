import express from "express";
import {
  cic_overview, cic_series_daily, cic_top_items, cic_by_bodega,
} from "../controllers/analyticsController.js";

const router = express.Router();

// Cíclico
router.get("/ciclico/overview",     cic_overview);
router.get("/ciclico/series/daily", cic_series_daily);
router.get("/ciclico/top/items",    cic_top_items);
router.get("/ciclico/by/bodega",    cic_by_bodega);

export default router;
