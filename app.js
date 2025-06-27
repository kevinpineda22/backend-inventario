import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import escaneoRoutes from './routes/escaneoRoutes.js';

dotenv.config();

const app = express();

// --- MIDDLEWARE ---
// 1. Configuración de CORS para permitir peticiones desde cualquier origen.
app.use(cors());

// 2. Middlewares para parsear el body de las peticiones a JSON.
app.use(express.json({ limit: '10mb' })); // Aumentamos el límite por si envías lotes grandes
app.use(express.urlencoded({ extended: true, limit: '10mb' }));


// --- RUTAS ---
// ✅ CAMBIO CLAVE: Montamos todas las rutas de la API bajo el prefijo '/api'
// Ahora todas tus rutas comenzarán con /api/...
app.use('/api', escaneoRoutes);


// Endpoint de verificación en la raíz. Ahora no entra en conflicto.
app.get('/', (req, res) => {
 res.send('♥ Servidor de Inventario Activo ♥');
});

// --- INICIAR SERVIDOR ---
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
 console.log(`Servidor corriendo en puerto ${PORT}`);
});
