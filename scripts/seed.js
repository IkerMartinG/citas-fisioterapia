// Rellena la base de datos con fisios, tratamientos, pacientes y citas de ejemplo: npm run seed
import mongoose from "mongoose";
import { clinic as config, env } from "../src/config.js";
import { workingRanges } from "../src/lib/schedule.js";
import { addDays, nowIn, toHHMM } from "../src/lib/time.js";
import { AgendaDay, Appointment, Patient, Professional, Service } from "../src/models/index.js";
import { bookAppointment, changeStatus } from "../src/services/appointments.js";

const week = (days, ranges) => days.map((weekday) => ({ weekday, ranges }));
const M = { start: "09:00", end: "14:00" };
const T = { start: "16:00", end: "20:00" };

const today = nowIn(config.timeZone);

const PROS = [
  {
    name: "Laura Hernández",
    specialty: "Fisioterapia deportiva",
    bio: "Lesiones de corredores, ciclistas y deportes de equipo. Readaptación para volver a entrenar.",
    color: "#0F6E66",
    schedule: [...week([1, 2, 3, 4], [M, T]), ...week([5], [M])],
  },
  {
    name: "Daniel Rodríguez",
    specialty: "Traumatología y espalda",
    bio: "Dolor de espalda y cuello, recuperación después de fracturas y operaciones.",
    color: "#B4532A",
    schedule: [...week([1, 2, 3, 4], [{ start: "15:00", end: "21:00" }]), ...week([5], [M])],
    timeOff: [{ from: addDays(today.date, 9), to: addDays(today.date, 11), reason: "Formación" }],
  },
  {
    name: "Marta Afonso",
    specialty: "Punción seca y dolor crónico",
    bio: "Dolor miofascial, cefaleas tensionales y tratamiento del dolor persistente.",
    color: "#5B4BB7",
    schedule: [...week([1, 3, 5], [{ start: "08:00", end: "15:00" }]), ...week([6], [{ start: "09:00", end: "13:00" }])],
  },
];

const SERVICES = [
  ["Primera valoración", "Entrevista, exploración y plan de tratamiento. Si es tu primera vez, empieza aquí.", 60, 45, [0, 1, 2]],
  ["Sesión de fisioterapia", "Sesión de tratamiento individual con tu fisio.", 45, 35, [0, 1, 2]],
  ["Punción seca", "Tratamiento de puntos gatillo con aguja fina.", 30, 30, [0, 2]],
  ["Drenaje linfático", "Técnica manual para reducir edemas y retención de líquidos.", 60, 40, [1, 2]],
  ["Readaptación deportiva", "Ejercicio guiado para volver a tu deporte con seguridad.", 60, 45, [0]],
];

const PATIENTS = [
  "Carmen Díaz", "Acerina Rodríguez", "Jonay Hernández", "Yaiza Pérez", "Airam González", "Nira Expósito",
  "Beneharo Martín", "Dácil Afonso", "Guillermo Suárez", "Tamara Cabrera", "Echedey Delgado", "Laura Mesa",
  "Iballa Torres", "Adrián Castro", "Raquel Báez", "Tinerfe Ramos", "Marta Padrón", "Aday Morales",
  "Elena García", "Pablo Rivero", "Sara León", "Óscar Trujillo", "Cristina Plasencia", "Javier Alonso",
].map((name, i) => ({ name, phone: `6${String(10000000 + i * 3731917).slice(0, 8)}` }));

const REASONS = ["", "", "Dolor lumbar desde hace dos semanas", "Esguince de tobillo", "Revisión", "Dolor de hombro al nadar", "Cervicalgia", ""];
const NOTES = [
  "Lumbalgia mecánica. Buena respuesta a terapia manual. Pautados ejercicios de control motor.",
  "Esguince de tobillo grado I. Inicio de carga progresiva.",
  "Tendinopatía rotuliana. Ejercicio isométrico diario, revisar en dos semanas.",
  "Cervicalgia por postura en el trabajo. Recomendaciones de ergonomía.",
  "Mejoría clara de la movilidad. Reducir frecuencia a una sesión semanal.",
];

const pick = (list) => list[Math.floor(Math.random() * list.length)];

await mongoose.connect(env.mongoUri);
await Promise.all([Professional, Service, Patient, Appointment, AgendaDay].map((m) => m.deleteMany({})));
await Promise.all([Professional, Service, Patient, Appointment, AgendaDay].map((m) => m.syncIndexes()));

const pros = await Professional.insertMany(PROS);
const services = await Service.insertMany(
  SERVICES.map(([name, description, durationMinutes, price, who], order) => ({
    name, description, durationMinutes, price, order, professionals: who.map((i) => pros[i]._id),
  })),
);

let created = 0;
const past = [];

for (let d = -14; d <= 12; d++) {
  const date = addDays(today.date, d);
  const fill = d < 0 ? 0.7 : d === 0 ? 0.75 : Math.max(0.15, 0.6 - d * 0.04);

  for (const pro of pros) {
    const offered = services.filter((s) => s.professionals.some((id) => id.equals(pro._id)));
    for (const range of workingRanges(pro.toObject(), date)) {
      let t = range.start;
      while (t < range.end) {
        const service = pick(offered);
        if (t + service.durationMinutes > range.end) break;
        if (Math.random() > fill) { t += 30; continue; }
        if (d === 0 && t > today.minutes && t < today.minutes + 30) { t += 15; continue; }
        const patient = pick(PATIENTS);
        const { appointment } = await bookAppointment(
          { serviceId: String(service._id), professionalId: String(pro._id), date, time: toHHMM(t), name: patient.name, phone: patient.phone, reason: pick(REASONS) },
          { source: Math.random() < 0.4 ? "clinica" : "web", notify: false, allowPast: true },
        );
        created++;
        if (d < 0 || (d === 0 && appointment.end <= today.minutes)) past.push(appointment);
        t += service.durationMinutes;
      }
    }
  }
}

// Las citas pasadas: casi todas atendidas, alguna no presentada o cancelada
for (const a of past) {
  const r = Math.random();
  await changeStatus(a._id, r < 0.86 ? "atendida" : r < 0.94 ? "no_show" : "cancelada");
}

// Notas clínicas para algunos pacientes
const withHistory = await Patient.find().limit(10);
for (const p of withHistory) {
  const count = 1 + Math.floor(Math.random() * 3);
  for (let i = 0; i < count; i++) {
    p.notes.push({ text: pick(NOTES), professional: pick(pros)._id, createdAt: new Date(Date.now() - (i + 1) * 5 * 86_400_000) });
  }
  await p.save();
}

console.log(`Listo: ${pros.length} fisios, ${services.length} tratamientos, ${await Patient.countDocuments()} pacientes y ${created} citas.`);
console.log('Contraseña del panel: la de ADMIN_PASSWORD (o "admin" en desarrollo).');
await mongoose.disconnect();
