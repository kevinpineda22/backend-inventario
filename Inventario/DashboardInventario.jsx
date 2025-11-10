// src/components/DashboardInventario.jsx
import React, { useState } from "react";
import { motion } from "framer-motion";
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faBoxesStacked, faUsers } from '@fortawesome/free-solid-svg-icons';
import DashboardCiclico from './DashboardCiclico';
import DashboardCarnesFruver from './DashboardCarnesFruver';
import "./DashboardInventario.css";

function DashboardInventario() {
  const [fuente, setFuente] = useState("ciclico");

  return (
    <div className="dashboard-inv-container">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="dashboard-inv-header">
        <h2 className="dashboard-inv-main-title">
          <FontAwesomeIcon icon={faBoxesStacked} /> Tabla de Control — Inventarios
        </h2>
        <div className="dashboard-inv-tabs">
          <button
            onClick={() => setFuente("ciclico")}
            className={`dashboard-inv-tab-btn ${fuente === "ciclico" ? "dashboard-inv-tab-btn-active" : ""}`}
          >
            <FontAwesomeIcon icon={faBoxesStacked} /> Cíclico
          </button>
          <button
            onClick={() => setFuente("carnesfruver")}
            className={`dashboard-inv-tab-btn ${fuente === "carnesfruver" ? "dashboard-inv-tab-btn-active" : ""}`}
          >
            <FontAwesomeIcon icon={faUsers} /> Carnes & Fruver
          </button>
        </div>
      </motion.div>

      {fuente === "ciclico" && <DashboardCiclico />}
      {fuente === "carnesfruver" && <DashboardCarnesFruver />}
    </div>
  );
}

export default DashboardInventario;