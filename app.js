import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

// 1. Importamos todos nuestros nuevos routers, uno para cada área funcional
import maestroRoutes from './routes/maestroRoutes.js';
import adminRoutes from './routes/adminRoutes.js';
import operarioRoutes from './routes/operarioRoutes.js';
import reporteRoutes from './routes/reporteRoutes.js';
import carnesyfruverRoutes from './routes/carnesyfruverRoute.js';
import analyticsRoutes from "./routes/analyticsRoutes.js";

dotenv.config();
const app = express();

// --- Middleware ---
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// --- RUTAS ---
// 2. Usamos prefijos para cada grupo de rutas. Esto mantiene todo ordenado.
// Por ejemplo, todas las rutas de administrador empezarán con /api/admin/...
app.use('/api/maestro', maestroRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/operario', operarioRoutes);
app.use('/api/reportes', reporteRoutes);
app.use('/api/carnesyfruver', carnesyfruverRoutes);
app.use("/api/analytics", analyticsRoutes);

// Endpoint de verificación en la raíz
app.get('/', (req, res) => {
  res.send('♥ Servidor de Inventario Activo y Organizado ♥');
});

// --- Iniciar Servidor ---
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
});