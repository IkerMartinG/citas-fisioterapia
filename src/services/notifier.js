// Avisos a pacientes. En desarrollo se escriben en la consola.
// Para enviarlos de verdad, sustituye `send` por nodemailer, Resend o la API de WhatsApp Business.
import { toHHMM } from "../lib/time.js";

function send(to, subject, body) {
  console.log(`\n[aviso] Para: ${to}\n        Asunto: ${subject}\n        ${body}\n`);
}

const when = (a) => `${a.date} a las ${toHHMM(a.start)}`;
const contact = (patient) => patient.email || patient.phone;

export const notifier = {
  appointmentBooked(appointment, patient, service, professional) {
    send(contact(patient), `Cita confirmada ${appointment.code}`,
      `Hola ${patient.name}: ${service.name} con ${professional.name} el ${when(appointment)}. Código: ${appointment.code}.`);
  },
  reminder(appointment, patient, service, professional) {
    send(contact(patient), "Recordatorio de tu cita de mañana",
      `Hola ${patient.name}, te recordamos tu cita de ${service.name} con ${professional.name} el ${when(appointment)}. Si no puedes venir, cancélala con el código ${appointment.code}.`);
  },
  appointmentCancelled(appointment, patient) {
    send("recepcion@fisio-teide.test", `Cita cancelada ${appointment.code}`, `${patient.name} ha cancelado la cita del ${when(appointment)}.`);
  },
};
