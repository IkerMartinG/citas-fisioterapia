// Configuración de la clínica. Los tratamientos y los fisios están en la base de datos;
// aquí van las reglas generales.
export const clinic = {
  name: "Fisio Teide",
  timeZone: "Atlantic/Canary",

  stepMinutes: 15, // las citas empiezan en múltiplos de 15 minutos
  bookingWindowDays: 45, // cuántos días hacia delante se puede pedir cita
  minNoticeMinutes: 120, // antelación mínima para pedir cita online
  cancelUntilMinutes: 12 * 60, // hasta cuándo puede cancelar el paciente desde la web
  reminderMinutesBefore: 24 * 60, // el recordatorio sale 24 h antes
  reminderEveryMs: 60_000, // cada cuánto revisa el servidor si hay recordatorios pendientes
};

const isProduction = process.env.NODE_ENV === "production";

export const env = {
  isProduction,
  port: Number(process.env.PORT) || 3000,
  mongoUri: process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/fisio-teide",
  adminPassword: process.env.ADMIN_PASSWORD || (isProduction ? "" : "admin"),
  tokenSecret: process.env.TOKEN_SECRET || (isProduction ? "" : "solo-para-desarrollo"),
  tokenTtlSeconds: 60 * 60 * 12,
};
