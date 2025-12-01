import React, { useState } from 'react';
import * as XLSX from 'xlsx';
import { motion } from "framer-motion";
import { FaFileExcel, FaSyncAlt } from "react-icons/fa";
import Swal from 'sweetalert2';
import './CargaMaestra.css';

const API_BASE_URL = 'https://backend-inventario.vercel.app/api/maestro';

/* ===== Helpers de normalización y detección de headers ===== */
const norm = (v) => String(v ?? '').trim();
const simplify = (s) =>
  String(s ?? '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().trim();

/** Detecta encabezados de códigos de barras:
 *  - “Código barras”, “Código barra principal”, “barcode”, “ean”, “gtin”, “upc”, etc.
 *  - “Código” a secas solo si el archivo también trae una columna ITEM (evita confundirlo con item_id)
 */
const isBarcodeHeader = (h, allHeaders = []) => {
  const t = simplify(h);
  // Palabras clave directas
  if (/(^| )barcode( |$)|(^| )ean(13)?( |$)|(^| )gtin(14)?( |$)|(^| )upc( |$)/.test(t)) return true;
  // "código/cod" + "barra(s)"
  if ((t.includes('codigo') || t.includes('cod')) && t.includes('barra')) return true;
  // "código" exacto solo si también hay ITEM
  if (t === 'codigo') {
    const hasItem = allHeaders.some(hh => simplify(hh) === 'item');
    if (hasItem) return true;
  }
  return false;
};

function CargaMaestra() {
  const [excelFile, setExcelFile] = useState(null);
  const [processedData, setProcessedData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setExcelFile(file);
    setLoading(true);
    setMessage(`Procesando archivo "${file.name}"...`);

    try {
      const reader = new FileReader();
      reader.onload = (evt) => {
        try {
          const bstr = evt.target.result;
          const wb = XLSX.read(bstr, { type: 'array', raw: true });
          const wsname = wb.SheetNames[0];
          const ws = wb.Sheets[wsname];
          const excelRows = XLSX.utils.sheet_to_json(ws, { raw: false, defval: '' });

          if (excelRows.length === 0) {
            throw new Error("El archivo Excel está vacío.");
          }

          // ---------- VALIDACIÓN: Ítems que inician con "0" ----------
          const headers = Object.keys(excelRows[0] || {});
          const lowerHeaders = headers.map(h => String(h).toLowerCase().trim());
          const itemHeaderIdx = lowerHeaders.findIndex(h => h === 'item');
          if (itemHeaderIdx !== -1) {
            const itemHeader = headers[itemHeaderIdx]; // nombre real de la columna
            const bad = [];
            excelRows.forEach((row, i) => {
              const val = String(row[itemHeader] ?? '').trim();
              if (val && val.startsWith('0')) {
                bad.push({ fila: i + 2, item: val }); // +2 por encabezados en Excel
              }
            });
            if (bad.length) {
              const ejemplos = bad.slice(0, 8).map(b => `F${b.fila}: ${b.item}`).join(', ');
              setProcessedData(null);
              setLoading(false);
              setMessage(`❌ Error: Hay ITEMS que inician con '0'. Ejemplos: ${ejemplos}`);
              Swal.fire('Error', 'Hay ITEMS que inician con "0". Corrige el Excel y vuelve a cargar.', 'error');
              return;
            }
          }

          // ---------- Helpers para extraer valores ----------
          const getValue = (row, keys) => {
            for (const key of keys) {
              if (row[key] !== undefined && row[key] !== null) return String(row[key]).trim();
            }
            return '';
          };

          // Detectar dinámicamente la columna de códigos de barras (soporta “Código”, “Código barras”, etc.)
          const barcodeHeader = headers.find(h => isBarcodeHeader(h, headers)) || '';

          // Construcción de items únicos por item_id (NO usamos “Código” aquí para evitar choques con códigos de barras)
          const itemsMap = new Map();
          excelRows.forEach(p => {
            const itemId =
              getValue(p, ['Item', 'ITEM', 'item']) || '';
            if (itemId && !itemsMap.has(itemId)) {
              itemsMap.set(itemId, {
                item_id: itemId,
                descripcion: getValue(p, ['Desc. item', 'DESC. ITEM', 'descripcion']) || 'Sin descripción',
                grupo: getValue(p, ['GRUPO', 'Grupo', 'grupo']) || 'Sin Grupo',
                is_active: true
              });
            }
          });

          // Códigos de barras asociados (usando el header detectado)
          const clean = (v) => String(v ?? '').trim(); // si quieres sólo dígitos: .replace(/[^\d]/g,'').trim()
          const codigos = excelRows.map(p => {
            const codigo = barcodeHeader ? clean(p[barcodeHeader]) : '';
            const item = getValue(p, ['Item', 'ITEM', 'item']);
            const um = getValue(p, ['U.M.', 'U.M', 'UM', 'Um', 'Unidad', 'UNIDAD']) || 'UND';
            if (codigo && item) {
              return { codigo_barras: codigo, item_id: item, unidad_medida: um, is_active: true };
            }
            return null;
          }).filter(Boolean);

          setProcessedData({ items: Array.from(itemsMap.values()), codigos });
          setMessage(`Archivo procesado. Columna de códigos: ${barcodeHeader || '—'} · Items: ${itemsMap.size} · Códigos: ${codigos.length}. Listo para sincronizar.`);
          setLoading(false);

        } catch (readError) {
          setMessage(`❌ Error al procesar el archivo: ${readError.message}`);
          setLoading(false);
        }
      };
      reader.readAsArrayBuffer(file);
    } catch (error) {
      setMessage(`❌ Error al procesar el archivo: ${error.message}`);
      setLoading(false);
    }
  };

  const handleSync = async () => {
    if (!processedData) {
      Swal.fire('Atención', 'Por favor, carga y procesa un archivo Excel válido primero.', 'info');
      return;
    }

    const result = await Swal.fire({
      title: '¿Confirmar Sincronización?',
      text: "Esto comparará el Excel con la base de datos y aplicará los cambios necesarios.",
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Sí, ¡sincronizar!',
    });

    if (!result.isConfirmed) return;

    setLoading(true);
    setMessage('Iniciando sincronización...');

    try {
      // 1. Estado actual de la DB
      setMessage('Paso 1/3: Obteniendo estado actual de la base de datos...');
      const resState = await fetch(`${API_BASE_URL}/estado-actual`);
      if (!resState.ok) throw new Error('No se pudo obtener el estado actual de la base de datos.');
      const dbState = await resState.json();
      const dbItemIds = new Set(dbState.itemIds);
      const dbCodigoBarras = new Set(dbState.codigoBarras);

      // 2. Diferencias
      const excelItemIds = new Set(processedData.items.map(i => i.item_id));
      const excelCodigos = new Set(processedData.codigos.map(c => c.codigo_barras));

      const itemsToUpsert = processedData.items;
      const codigosToUpsert = processedData.codigos;
      const itemsToDeactivate = [...dbItemIds].filter(id => !excelItemIds.has(id));
      const codigosToDeactivate = [...dbCodigoBarras].filter(code => !excelCodigos.has(code));

      // 3. Envío por lotes
      setMessage('Paso 2/3: Enviando actualizaciones y nuevas entradas...');
      const BATCH_SIZE = 400;
      const sendBatch = async (endpoint, data) => {
        for (let i = 0; i < data.length; i += BATCH_SIZE) {
          const batch = data.slice(i, i + BATCH_SIZE);
          const res = await fetch(`${API_BASE_URL}/${endpoint}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(batch),
          });
          if (!res.ok) {
            const errorData = await res.json();
            throw new Error(`Error en lote para ${endpoint}: ${errorData.message}`);
          }
        }
      };

      await sendBatch('upsert-items', itemsToUpsert);
      await sendBatch('upsert-codigos', codigosToUpsert);

      setMessage('Paso 3/3: Desactivando registros obsoletos...');
      await sendBatch('desactivar-items', itemsToDeactivate);
      await sendBatch('desactivar-codigos', codigosToDeactivate);

      Swal.fire('¡Éxito!', 'La base de datos maestra ha sido sincronizada correctamente.', 'success');
      setMessage('Sincronización completada.');
      setProcessedData(null);
      setExcelFile(null);

    } catch (err) {
      Swal.fire('Error', `Ocurrió un error durante la sincronización: ${err.message}`, 'error');
      setMessage(`❌ Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }} 
      animate={{ opacity: 1, y: 0 }} 
      className="master-sync-container"
    >
      <div className="master-sync-card">
        <h2 className="master-sync-title">Sincronizar Base Maestra</h2>
        <p className="master-sync-subtitle">Sube un archivo Excel para añadir, actualizar y desactivar productos.</p>

        <div className="master-sync-form-group">
          <label className="master-sync-label"><FaFileExcel /> Adjuntar Excel Maestro</label>
          <input
            type="file"
            accept=".xlsx, .xls"
            onChange={handleFileChange}
            className="master-sync-file-input"
            key={excelFile ? excelFile.name : 'file-input'}
            disabled={loading}
          />
          {excelFile && <p className="master-sync-file-name">Archivo: <strong>{excelFile.name}</strong></p>}
        </div>

        <button 
          onClick={handleSync} 
          disabled={loading || !processedData} 
          className="master-sync-button"
        >
          {loading ? (
            'Sincronizando...'
          ) : (
            <>
              <FaSyncAlt /> Sincronizar Base Maestra
            </>
          )}
        </button>

        {message && (
          <p className={`master-sync-message ${message.startsWith('❌') ? 'error' : 'success'}`}>
            {message}
          </p>
        )}
      </div>
    </motion.div>
  );
}

export default CargaMaestra;


