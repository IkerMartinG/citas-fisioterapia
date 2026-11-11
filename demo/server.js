// Backend simulado para la demo de GitHub Pages.
// Responde a las mismas rutas que la API real usando la misma lógica de agenda (src/lib/schedule.js),
// con datos de ejemplo guardados en el navegador (localStorage).
// No se usa en producción: solo lo carga js/api.js cuando la página está en modo demo.
import { clinic as config } from "../lib/clinic.js";
import { canPatientCancel, daySlots, earliestStart, fitsSchedule, workingRanges } from "../lib/schedule.js";
import { addDays, isISODate, nowIn, overlaps, toHHMM, toMinutes } from "../lib/time.js";
import { normalizePhone, validateAppointment } from "../lib/validate.js";

const STORE_KEY = "fisio-teide-demo-v1";
const TOKEN = "demo-token";
export const DEMO_PASSWORD = "demo";

const now = () => nowIn(config.timeZone);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

class DemoError extends Error {
  constructor(status, message, code = "error") {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/* ---------- Catálogo fijo ---------- */

const week = (days, ranges) => days.map((weekday) => ({ weekday, ranges }));
const M = { start: "09:00", end: "14:00" };
const T = { start: "16:00", end: "20:00" };

function professionals(today) {
  return [
    {
      id: "laura", name: "Laura Hernández", specialty: "Fisioterapia deportiva", color: "#0F6E66",
      bio: "Lesiones de corredores, ciclistas y deportes de equipo. Readaptación para volver a entrenar.",
      schedule: [...week([1, 2, 3, 4], [M, T]), ...week([5], [M])], timeOff: [],
    },
    {
      id: "daniel", name: "Daniel Rodríguez", specialty: "Traumatología y espalda", color: "#B4532A",
      bio: "Dolor de espalda y cuello, recuperación después de fracturas y operaciones.",
      schedule: [...week([1, 2, 3, 4], [{ start: "15:00", end: "21:00" }]), ...week([5], [M])],
      timeOff: [{ from: addDays(today, 9), to: addDays(today, 11), reason: "Formación" }],
    },
    {
      id: "marta", name: "Marta Afonso", specialty: "Punción seca y dolor crónico", color: "#5B4BB7",
      bio: "Dolor miofascial, cefaleas tensionales y tratamiento del dolor persistente.",
      schedule: [...week([1, 3, 5], [{ start: "08:00", end: "15:00" }]), ...week([6], [{ start: "09:00", end: "13:00" }])],
      timeOff: [],
    },
  ];
}

const SERVICES = [
  { id: "valoracion", name: "Primera valoración", description: "Entrevista, exploración y plan de tratamiento. Si es tu primera vez, empieza aquí.", durationMinutes: 60, price: 45, professionals: ["laura", "daniel", "marta"] },
  { id: "sesion", name: "Sesión de fisioterapia", description: "Sesión de tratamiento individual con tu fisio.", durationMinutes: 45, price: 35, professionals: ["laura", "daniel", "marta"] },
  { id: "puncion", name: "Punción seca", description: "Tratamiento de puntos gatillo con aguja fina.", durationMinutes: 30, price: 30, professionals: ["laura", "marta"] },
  { id: "drenaje", name: "Drenaje linfático", description: "Técnica manual para reducir edemas y retención de líquidos.", durationMinutes: 60, price: 40, professionals: ["daniel", "marta"] },
  { id: "readaptacion", name: "Readaptación deportiva", description: "Ejercicio guiado para volver a tu deporte con seguridad.", durationMinutes: 60, price: 45, professionals: ["laura"] },
];

const PATIENT_NAMES = [
  "Carmen Díaz", "Acerina Rodríguez", "Jonay Hernández", "Yaiza Pérez", "Airam González", "Nira Expósito",
  "Beneharo Martín", "Dácil Afonso", "Guillermo Suárez", "Tamara Cabrera", "Echedey Delgado", "Laura Mesa",
  "Iballa Torres", "Adrián Castro", "Raquel Báez", "Tinerfe Ramos", "Marta Padrón", "Aday Morales",
  "Elena García", "Pablo Rivero", "Sara León", "Óscar Trujillo", "Cristina Plasencia", "Javier Alonso",
];
const REASONS = ["", "", "Dolor lumbar desde hace dos semanas", "Esguince de tobillo", "Revisión", "Dolor de hombro al nadar", "Cervicalgia", ""];
const NOTES = [
  "Lumbalgia mecánica. Buena respuesta a terapia manual. Pautados ejercicios de control motor.",
  "Esguince de tobillo grado I. Inicio de carga progresiva.",
  "Tendinopatía rotuliana. Ejercicio isométrico diario, revisar en dos semanas.",
  "Cervicalgia por postura en el trabajo. Recomendaciones de ergonomía.",
  "Mejoría clara de la movilidad. Reducir frecuencia a una sesión semanal.",
];

/* ---------- Datos ---------- */

// Generador pseudoaleatorio con semilla (mulberry32): los datos de ejemplo salen igual todo el día.
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function code(random = Math.random) {
  let c = "";
  for (let i = 0; i < 6; i++) c += ALPHABET[Math.floor(random() * ALPHABET.length)];
  return c;
}

const bookedFor = (db, proId, date) =>
  db.appointments.filter((a) => a.professionalId === proId && a.date === date && a.status !== "cancelada");

function seed() {
  const today = now();
  const random = rng(Number(today.date.replaceAll("-", "")));
  const pick = (list) => list[Math.floor(random() * list.length)];
  const pros = professionals(today.date);
  const db = {
    seededFor: today.date,
    pros,
    patients: PATIENT_NAMES.map((name, i) => ({
      id: `pa${i + 1}`, name, phone: `6${String(10000000 + i * 3731917).slice(0, 8)}`, email: "",
      createdAt: new Date(Date.now() - (60 + i * 7) * 86_400_000).toISOString(), notes: [],
    })),
    appointments: [],
    nextId: 1,
  };

  for (let d = -14; d <= 12; d++) {
    const date = addDays(today.date, d);
    const fill = d < 0 ? 0.7 : d === 0 ? 0.75 : Math.max(0.15, 0.6 - d * 0.04);
    for (const pro of pros) {
      const offered = SERVICES.filter((s) => s.professionals.includes(pro.id));
      for (const range of workingRanges(pro, date)) {
        let t = range.start;
        while (t < range.end) {
          const service = pick(offered);
          if (t + service.durationMinutes > range.end) break;
          if (random() > fill) { t += 30; continue; }
          const end = t + service.durationMinutes;
          let status = "confirmada";
          if (d < 0 || (d === 0 && end <= today.minutes)) {
            const r = random();
            status = r < 0.86 ? "atendida" : r < 0.94 ? "no_show" : "cancelada";
          }
          db.appointments.push({
            id: `a${db.nextId++}`, code: code(random), professionalId: pro.id, serviceId: service.id,
            patientId: pick(db.patients).id, date, start: t, end, reason: pick(REASONS), status,
            source: random() < 0.4 ? "clinica" : "web",
            reminderSent: status === "confirmada" && (d === 0 || (d === 1 && t <= today.minutes)),
          });
          t = end;
        }
      }
    }
  }

  for (const p of db.patients.slice(0, 10)) {
    const count = 1 + Math.floor(random() * 3);
    for (let i = 0; i < count; i++) {
      p.notes.push({
        id: `n${db.nextId++}`, text: pick(NOTES), professional: pick(pros).name,
        createdAt: new Date(Date.now() - (i + 1) * 5 * 86_400_000).toISOString(),
      });
    }
  }
  return db;
}

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY));
    if (saved?.seededFor === now().date) return saved;
  } catch { /* sin almacenamiento: datos nuevos */ }
  const fresh = seed();
  save(fresh);
  return fresh;
}

function save(db) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(db)); } catch { /* modo privado */ }
}

export function resetDemo() {
  try { localStorage.removeItem(STORE_KEY); } catch { /* nada */ }
}

/* ---------- Vistas ---------- */

const serviceById = (id) => SERVICES.find((s) => s.id === id);

function publicView(db, a) {
  return {
    code: a.code, date: a.date, time: toHHMM(a.start), durationMinutes: a.end - a.start, status: a.status,
    service: serviceById(a.serviceId)?.name,
    professional: db.pros.find((p) => p.id === a.professionalId)?.name,
    patient: db.patients.find((p) => p.id === a.patientId)?.name,
    canCancel: canPatientCancel(a, now(), config.cancelUntilMinutes),
  };
}

function adminView(db, a) {
  const patient = db.patients.find((p) => p.id === a.patientId);
  return {
    id: a.id, code: a.code, date: a.date, time: toHHMM(a.start), start: a.start, end: a.end, status: a.status,
    source: a.source, reason: a.reason, reminderSent: a.reminderSent, professionalId: a.professionalId,
    professional: db.pros.find((p) => p.id === a.professionalId)?.name, service: serviceById(a.serviceId)?.name,
    patient: patient ? { id: patient.id, name: patient.name, phone: patient.phone } : null,
  };
}

/* ---------- Operaciones ---------- */

function prosFor(db, serviceId, professionalId = "any") {
  const service = serviceById(serviceId);
  if (!service) throw new DemoError(404, "Ese tratamiento no existe.", "not_found");
  let pros = db.pros.filter((p) => service.professionals.includes(p.id));
  if (professionalId && professionalId !== "any") {
    pros = pros.filter((p) => p.id === professionalId);
    if (!pros.length) throw new DemoError(400, "Ese fisioterapeuta no hace este tratamiento.", "invalid");
  }
  return { service, pros };
}

function slotsFor(db, service, pros, date, at) {
  return daySlots({
    config, date, duration: service.durationMinutes, professionals: pros,
    bookedBy: new Map(pros.map((p) => [p.id, bookedFor(db, p.id, date)])), now: at,
  });
}

function book(db, body, source) {
  const { errors, value } = validateAppointment(body);
  if (errors.length) throw new DemoError(400, errors.join(" "), "invalid");
  const { service, pros } = prosFor(db, value.serviceId, value.professionalId);
  const start = toMinutes(value.time);
  const end = start + service.durationMinutes;

  const notBefore = earliestStart(config, value.date, now(), { ignoreNotice: source !== "web" });
  if (notBefore === null) throw new DemoError(400, `Solo se pueden pedir citas para los próximos ${config.bookingWindowDays} días.`, "not_bookable");
  if (start < notBefore) {
    throw new DemoError(400, source === "web" ? "Para hoy hace falta pedir la cita con 2 horas de antelación." : "Esa hora ya ha pasado.", "not_bookable");
  }

  const candidates = pros
    .filter((p) => fitsSchedule(p, value.date, start, service.durationMinutes, config.stepMinutes))
    .sort((a, b) => bookedFor(db, a.id, value.date).length - bookedFor(db, b.id, value.date).length);
  if (!candidates.length) throw new DemoError(409, "A esa hora no hay nadie de turno para este tratamiento.", "no_professional");

  const pro = candidates.find((p) => !bookedFor(db, p.id, value.date).some((a) => overlaps(start, end, a.start, a.end)));
  if (!pro) throw new DemoError(409, "Ese hueco se acaba de ocupar. Elige otra hora, por favor.", "slot_taken");

  let patient = db.patients.find((p) => normalizePhone(p.phone) === value.phone);
  if (!patient) {
    patient = { id: `pa${db.nextId++}`, name: value.name, phone: value.phone, email: value.email, createdAt: new Date().toISOString(), notes: [] };
    db.patients.push(patient);
  } else if (value.email) {
    patient.email = value.email;
  }

  const appointment = {
    id: `a${db.nextId++}`, code: code(), professionalId: pro.id, serviceId: service.id, patientId: patient.id,
    date: value.date, start, end, reason: value.reason, status: "confirmada", source, reminderSent: false,
  };
  db.appointments.push(appointment);
  return appointment;
}

function findForPatient(db, body) {
  const a = db.appointments.find((x) => x.code === String(body?.code ?? "").trim().toUpperCase());
  const patient = a && db.patients.find((p) => p.id === a.patientId);
  if (!a || normalizePhone(patient?.phone) !== normalizePhone(body?.phone)) {
    throw new DemoError(404, "No encontramos ninguna cita con ese código y teléfono.", "not_found");
  }
  return a;
}

function setStatus(a, status) {
  if (!["confirmada", "atendida", "cancelada", "no_show"].includes(status)) throw new DemoError(400, "Estado no válido.", "invalid");
  if (a.status === "cancelada" && status !== "cancelada") {
    throw new DemoError(409, "Una cita cancelada no se puede reactivar. Crea una nueva.", "cancelled");
  }
  a.status = status;
}

/* ---------- Rutas ---------- */

function route(db, method, url, body, token) {
  const p = url.pathname;
  const q = (k) => url.searchParams.get(k);

  if (p === "/info") {
    return { name: config.name, timeZone: config.timeZone, bookingWindowDays: config.bookingWindowDays, cancelUntilHours: config.cancelUntilMinutes / 60 };
  }
  if (p === "/services") return SERVICES;
  if (p === "/professionals") return db.pros.map(({ id, name, specialty, bio, color }) => ({ id, name, specialty, bio, color }));
  if (p === "/availability/days") {
    const { service, pros } = prosFor(db, q("serviceId"), q("professionalId"));
    const at = now();
    const from = isISODate(q("from")) ? q("from") : at.date;
    return Array.from({ length: 14 }, (_, i) => addDays(from, i)).map((date) => ({ date, free: slotsFor(db, service, pros, date, at).length }));
  }
  if (p === "/availability") {
    if (!isISODate(q("date"))) throw new DemoError(400, "Indica una fecha válida.", "invalid");
    const { service, pros } = prosFor(db, q("serviceId"), q("professionalId"));
    return { date: q("date"), durationMinutes: service.durationMinutes, slots: slotsFor(db, service, pros, q("date"), now()) };
  }
  if (p === "/appointments" && method === "POST") return publicView(db, book(db, body, "web"));
  if (p === "/appointments/lookup") return publicView(db, findForPatient(db, body));
  if (p === "/appointments/cancel") {
    const a = findForPatient(db, body);
    if (!canPatientCancel(a, now(), config.cancelUntilMinutes)) {
      throw new DemoError(409, "Esta cita ya no se puede cancelar online. Llámanos y lo vemos.", "not_cancellable");
    }
    a.status = "cancelada";
    return publicView(db, a);
  }

  if (p === "/admin/login") {
    if (body?.password !== DEMO_PASSWORD) throw new DemoError(401, `Contraseña incorrecta. En la demo es "${DEMO_PASSWORD}".`, "bad_password");
    return { token: TOKEN };
  }
  if (p.startsWith("/admin/") && token !== TOKEN) throw new DemoError(401, "Tu sesión ha caducado. Vuelve a entrar.", "unauthorized");
  if (p === "/admin/me") return { role: "admin" };
  if (p === "/admin/agenda") {
    const date = q("date");
    if (!isISODate(date)) throw new DemoError(400, "Indica una fecha válida.", "invalid");
    return {
      date,
      professionals: db.pros.map((pro) => ({
        id: pro.id, name: pro.name, specialty: pro.specialty, color: pro.color, ranges: workingRanges(pro, date),
        off: pro.timeOff.find((t) => t.from <= date && date <= t.to)?.reason ?? null,
      })),
      appointments: db.appointments.filter((a) => a.date === date).sort((a, b) => a.start - b.start).map((a) => adminView(db, a)),
    };
  }
  if (p === "/admin/appointments" && method === "POST") return adminView(db, book(db, body, "clinica"));
  let m = /^\/admin\/appointments\/([\w-]+)$/.exec(p);
  if (m && method === "PATCH") {
    const a = db.appointments.find((x) => x.id === m[1]);
    if (!a) throw new DemoError(404, "La cita no existe.", "not_found");
    setStatus(a, body?.status);
    return adminView(db, a);
  }
  if (p === "/admin/patients") {
    const term = (q("q") ?? "").trim().toLowerCase();
    return db.patients
      .filter((x) => !term || x.name.toLowerCase().includes(term) || x.phone.includes(term.replace(/[\s-]/g, "")))
      .sort((a, b) => a.name.localeCompare(b.name, "es"))
      .slice(0, 50)
      .map(({ id, name, phone, email }) => ({ id, name, phone, email }));
  }
  m = /^\/admin\/patients\/([\w-]+)(\/notes)?$/.exec(p);
  if (m) {
    const patient = db.patients.find((x) => x.id === m[1]);
    if (!patient) throw new DemoError(404, "El paciente no existe.", "not_found");
    if (m[2] && method === "POST") {
      const text = String(body?.text ?? "").trim();
      if (text.length < 2 || text.length > 2000) throw new DemoError(400, "La nota debe tener entre 2 y 2000 caracteres.", "invalid");
      const pro = db.pros.find((x) => x.id === body?.professionalId);
      patient.notes.push({ id: `n${db.nextId++}`, text, professional: pro?.name ?? null, createdAt: new Date().toISOString() });
      return { ok: true };
    }
    return {
      id: patient.id, name: patient.name, phone: patient.phone, email: patient.email, since: patient.createdAt,
      notes: [...patient.notes].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      appointments: db.appointments
        .filter((a) => a.patientId === patient.id)
        .sort((a, b) => b.date.localeCompare(a.date) || b.start - a.start)
        .map((a) => adminView(db, a)),
    };
  }
  throw new DemoError(404, "Esa ruta de la API no existe.", "not_found");
}

/** Punto de entrada: mismo contrato que fetch a /api, devuelve los datos o lanza un Error con status. */
export async function handle(path, { method = "GET", body, token } = {}) {
  await wait(120 + Math.random() * 180); // que se note que "va al servidor"
  const db = load();
  const result = route(db, method, new URL(path, "https://demo.local"), body ? JSON.parse(JSON.stringify(body)) : undefined, token);
  save(db);
  return JSON.parse(JSON.stringify(result));
}
