import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config();

// Tu configuración del transportador es correcta para Office 365
const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST || 'smtp.office365.com',
    port: process.env.EMAIL_PORT || 587,
    secure: process.env.EMAIL_SECURE === 'true', // false para 587 (STARTTLS)
    auth: {
        user: process.env.EMAIL_USER, // Tu dirección de correo
        pass: process.env.EMAIL_PASS, // Tu contraseña de correo
    },
    tls: {
        ciphers: 'TLSv1.2',
    }
});

/**
 * Función para enviar correos electrónicos.
 * @param {object} mailData - Datos del correo.
 * @param {string|string[]} mailData.to - Destinatario(s).
 * @param {string} mailData.subject - Asunto del correo.
 * @param {string} mailData.html - Contenido HTML del correo.
 * @param {object[]} [mailData.attachments] - Array de archivos adjuntos (opcional).
 */
export const sendEmail = async ({ to, subject, html, attachments }) => {
    try {
        const mailOptions = {
            from: `"Sistema de Inventarios" <${process.env.EMAIL_USER}>`, // Un nombre de remitente más amigable
            to: Array.isArray(to) ? to.join(', ') : to,
            subject,
            html,
            attachments: attachments || [] // ✅ Añadido para manejar archivos adjuntos
        };

        // Verificación de credenciales
        if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
            console.error('Error de configuración: EMAIL_USER o EMAIL_PASS no están definidos.');
            throw new Error('Configuración de correo incompleta en el servidor.');
        }

        await transporter.sendMail(mailOptions);
        console.log(`Correo enviado a ${mailOptions.to} - Asunto: ${subject}`);
        return { success: true, message: 'Correo enviado exitosamente' };

    } catch (error) {
        console.error('Error al enviar correo (servicio):', error);
        throw new Error(`Error al enviar correo: ${error.message}`);
    }
};
