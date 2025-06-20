import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import escaneoRoutes from './routes/escaneoRoutes.js';

dotenv.config();

const app = express();
// Configurar CORS para permitir solicitudes desde el frontend
app.use(cors({
  origin: '*',  // Permite todas las solicitudes de cualquier origen
  methods: ['GET', 'POST', 'PUT', "PATCH", 'DELETE'],  // Métodos permitidos
  allowedHeaders: ['Content-Type', 'Authorization'],  // Cabeceras permitidas
}));
app.use(express.json());  // Permite manejar solicitudes con body JSON
app.use(express.urlencoded({ extended: true }));  // Permite manejar datos de formularios URL encoded


app.use('/', escaneoRoutes); // 🚀 Aquí montas las rutas del escáner


// Endpoint para verificar que el servidor está corriendo
app.get('/', (req, res) => {
  res.send('♥activo mi papacho♥');
});

// Iniciar el servidor
const PORT = process.env.PORT || 5000;  // Usa el puerto de entorno si está disponible

app.listen(PORT, () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
});