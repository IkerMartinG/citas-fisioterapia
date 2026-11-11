// Recordatorios automáticos 24 h antes de cada cita.
//
// El trabajo se "reclama" con findOneAndUpdate({ reminderSentAt: null }): si hay varias
// instancias del servidor corriendo a la vez, solo una consigue marcar cada cita y nadie
// recibe el recordatorio dos veces.
import { clinic as config } from "../config.js";
import { dueForReminder } from "../lib/schedule.js";
import { addDays } from "../lib/time.js";
import { Appointment } from "../models/index.js";
import { now } from "./appointments.js";
import { notifier } from "./notifier.js";

export async function sendDueReminders(at = now()) {
  const horizonDays = Math.ceil(config.reminderMinutesBefore / 1440);
  const dates = Array.from({ length: horizonDays + 1 }, (_, i) => addDays(at.date, i));
  const candidates = await Appointment.find({ status: "confirmada", reminderSentAt: null, date: { $in: dates } }).lean();

  let sent = 0;
  for (const a of dueForReminder(candidates, at, config.reminderMinutesBefore)) {
    const claimed = await Appointment.findOneAndUpdate(
      { _id: a._id, reminderSentAt: null, status: "confirmada" },
      { $set: { reminderSentAt: new Date() } },
      { new: true },
    )
      .populate("patient", "name phone email")
      .populate("service", "name")
      .populate("professional", "name");
    if (!claimed) continue; // otra instancia se adelantó o la cita cambió
    notifier.reminder(claimed, claimed.patient, claimed.service, claimed.professional);
    sent++;
  }
  return sent;
}

export function startReminderJob() {
  const run = () => sendDueReminders().catch((err) => console.error("Error enviando recordatorios:", err));
  run();
  const timer = setInterval(run, config.reminderEveryMs);
  timer.unref();
  return () => clearInterval(timer);
}
