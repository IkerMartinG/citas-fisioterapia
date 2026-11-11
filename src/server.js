import mongoose from "mongoose";
import { createApp } from "./app.js";
import { env } from "./config.js";
import { startReminderJob } from "./services/reminders.js";

if (!env.adminPassword || !env.tokenSecret) {
  console.error("Faltan ADMIN_PASSWORD y TOKEN_SECRET. Revisa el archivo .env (mira .env.example).");
  process.exit(1);
}
if (!env.isProduction && !process.env.ADMIN_PASSWORD) {
  console.warn('Modo desarrollo: la contraseña del panel es "admin".');
}

await mongoose.connect(env.mongoUri);
console.log("Conectado a MongoDB");

const stopReminders = startReminderJob();

const server = createApp().listen(env.port, () => {
  console.log(`Fisio Teide en http://localhost:${env.port}  (panel: /admin)`);
});

async function shutdown() {
  stopReminders();
  server.close();
  await mongoose.disconnect();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
