import mongoose from "mongoose";
import { clinic as config } from "../config.js";
import { reservationCode } from "../lib/code.js";
import { canPatientCancel, daySlots, earliestStart, fitsSchedule } from "../lib/schedule.js";
import { addDays, nowIn, toHHMM, toMinutes } from "../lib/time.js";
import { normalizePhone, validateAppointment } from "../lib/validate.js";
import { AgendaDay, Appointment, APPOINTMENT_STATUSES, Patient, Professional, Service } from "../models/index.js";
import { notifier } from "./notifier.js";

export class AppError extends Error {
  constructor(status, message, code = "error") {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export const now = () => nowIn(config.timeZone);
const isDuplicateKey = (err) => err?.code === 11000 || /E11000/.test(err?.message ?? "");
const plainPro = (p) => ({ ...p, id: String(p._id) });

/* ---------- Reserva atómica del hueco ---------- */

/**
 * Añade [start, end) a la agenda del profesional solo si no se solapa con nada.
 * Es un único updateOne: la condición y la escritura van juntas y MongoDB las aplica de forma atómica.
 *
 * - Si el documento del día no existe, el upsert lo crea con el tramo.
 * - Si existe pero el tramo choca, el filtro no encuentra nada, el upsert intenta insertar
 *   y el índice único (profesional, día) lo impide con E11000 → reintentamos sin upsert
 *   para distinguir "choque" de "dos primeras reservas del día a la vez".
 */
export async function reserveInterval(professionalId, date, start, end, appointmentId) {
  const filter = {
    professional: professionalId,
    date,
    booked: { $not: { $elemMatch: { start: { $lt: end }, end: { $gt: start } } } },
  };
  const update = { $push: { booked: { start, end, appointment: appointmentId } } };
  try {
    await AgendaDay.updateOne(filter, update, { upsert: true });
    return true;
  } catch (err) {
    if (!isDuplicateKey(err)) throw err;
    const retry = await AgendaDay.updateOne(filter, update);
    return retry.modifiedCount === 1;
  }
}

export async function releaseInterval(professionalId, date, appointmentId) {
  await AgendaDay.updateOne({ professional: professionalId, date }, { $pull: { booked: { appointment: appointmentId } } });
}

/* ---------- Catálogo ---------- */

export async function listServices() {
  return Service.find({ active: true }).sort({ order: 1, name: 1 }).lean();
}

export async function listProfessionals() {
  return (await Professional.find({ active: true }).sort({ name: 1 }).lean()).map(plainPro);
}

async function prosForService(serviceId) {
  if (!mongoose.isValidObjectId(serviceId)) throw new AppError(400, "Tratamiento no válido.", "invalid");
  const service = await Service.findOne({ _id: serviceId, active: true }).lean();
  if (!service) throw new AppError(404, "Ese tratamiento no existe.", "not_found");
  const pros = (await Professional.find({ _id: { $in: service.professionals }, active: true }).lean()).map(plainPro);
  return { service, pros };
}

function pickPros(pros, professionalId) {
  if (!professionalId || professionalId === "any") return pros;
  const chosen = pros.filter((p) => p.id === professionalId);
  if (!chosen.length) throw new AppError(400, "Ese fisioterapeuta no hace este tratamiento.", "invalid");
  return chosen;
}

async function bookedMap(pros, dates) {
  const days = await AgendaDay.find({ professional: { $in: pros.map((p) => p._id) }, date: { $in: dates } }).lean();
  const map = new Map(); // "idPro|fecha" -> tramos
  for (const d of days) map.set(`${d.professional}|${d.date}`, d.booked);
  return (date) => new Map(pros.map((p) => [p.id, map.get(`${p.id}|${date}`) ?? []]));
}

/* ---------- Disponibilidad ---------- */

export async function availability({ serviceId, professionalId, date }) {
  const { service, pros: all } = await prosForService(serviceId);
  const pros = pickPros(all, professionalId);
  const booked = await bookedMap(pros, [date]);
  return {
    date,
    durationMinutes: service.durationMinutes,
    slots: daySlots({ config, date, duration: service.durationMinutes, professionals: pros, bookedBy: booked(date), now: now() }),
  };
}

/** Número de huecos libres en los próximos `days` días, para pintar el calendario. */
export async function availabilityDays({ serviceId, professionalId, from, days = 14 }) {
  const { service, pros: all } = await prosForService(serviceId);
  const pros = pickPros(all, professionalId);
  const dates = Array.from({ length: days }, (_, i) => addDays(from, i));
  const booked = await bookedMap(pros, dates);
  const at = now();
  return dates.map((date) => ({
    date,
    free: daySlots({ config, date, duration: service.durationMinutes, professionals: pros, bookedBy: booked(date), now: at }).length,
  }));
}

/* ---------- Pedir cita ---------- */

/**
 * Crea una cita. Con professionalId "any" prueba primero con quien tenga menos citas ese día.
 * Opciones: `source: "clinica"` (recepción, sin antelación mínima), `allowPast` (solo para el seed).
 */
export async function bookAppointment(input, { source = "web", notify = true, at = now(), allowPast = false } = {}) {
  const { errors, value } = validateAppointment(input);
  if (errors.length) throw new AppError(400, errors.join(" "), "invalid");

  const { service, pros: all } = await prosForService(value.serviceId);
  const start = toMinutes(value.time);
  const end = start + service.durationMinutes;

  if (!allowPast) {
    const notBefore = earliestStart(config, value.date, at, { ignoreNotice: source !== "web" });
    if (notBefore === null) throw new AppError(400, `Solo se pueden pedir citas para los próximos ${config.bookingWindowDays} días.`, "not_bookable");
    if (start < notBefore) {
      throw new AppError(400, source === "web" ? "Para hoy hace falta pedir la cita con 2 horas de antelación." : "Esa hora ya ha pasado.", "not_bookable");
    }
  }

  let candidates = pickPros(all, value.professionalId).filter((p) => fitsSchedule(p, value.date, start, service.durationMinutes, config.stepMinutes));
  if (!candidates.length) throw new AppError(409, "A esa hora no hay nadie de turno para este tratamiento.", "no_professional");

  if (candidates.length > 1) {
    // Repartir el trabajo: primero quien tenga la agenda más vacía ese día
    const days = await AgendaDay.find({ professional: { $in: candidates.map((p) => p._id) }, date: value.date }).lean();
    const load = new Map(days.map((d) => [String(d.professional), d.booked.length]));
    candidates = candidates.sort((a, b) => (load.get(a.id) ?? 0) - (load.get(b.id) ?? 0));
  }

  const appointmentId = new mongoose.Types.ObjectId();
  let professional = null;
  for (const p of candidates) {
    if (await reserveInterval(p._id, value.date, start, end, appointmentId)) {
      professional = p;
      break;
    }
  }
  if (!professional) throw new AppError(409, "Ese hueco se acaba de ocupar. Elige otra hora, por favor.", "slot_taken");

  try {
    const patient = await upsertPatient(value);
    const appointment = await Appointment.create({
      _id: appointmentId,
      code: await freshCode(),
      professional: professional._id,
      service: service._id,
      patient: patient._id,
      date: value.date,
      start,
      end,
      reason: value.reason,
      source,
    });
    if (notify) notifier.appointmentBooked(appointment, patient, service, professional);
    return { appointment, patient, service, professional };
  } catch (err) {
    await releaseInterval(professional._id, value.date, appointmentId);
    throw err;
  }
}

/** El paciente se identifica por teléfono: si ya existe se reutiliza su ficha. */
async function upsertPatient({ name, phone, email }) {
  const update = { $setOnInsert: { name } };
  if (email) update.$set = { email };
  try {
    return await Patient.findOneAndUpdate({ phone }, update, { upsert: true, new: true });
  } catch (err) {
    // Dos citas del mismo paciente nuevo a la vez: la otra petición ya creó la ficha
    if (isDuplicateKey(err)) return Patient.findOne({ phone });
    throw err;
  }
}

async function freshCode() {
  for (let i = 0; i < 5; i++) {
    const code = reservationCode();
    if (!(await Appointment.exists({ code }))) return code;
  }
  throw new AppError(500, "No se pudo generar un código de cita.");
}

/* ---------- Pacientes: consultar y cancelar ---------- */

export function publicView(a) {
  return {
    code: a.code,
    date: a.date,
    time: toHHMM(a.start),
    durationMinutes: a.end - a.start,
    status: a.status,
    service: a.service?.name,
    professional: a.professional?.name,
    patient: a.patient?.name,
    canCancel: canPatientCancel(a, now(), config.cancelUntilMinutes),
  };
}

async function findForPatient(code, phone) {
  const appointment = await Appointment.findOne({ code: String(code ?? "").trim().toUpperCase() })
    .populate("service", "name")
    .populate("professional", "name")
    .populate("patient", "name phone email");
  if (!appointment || normalizePhone(appointment.patient?.phone) !== normalizePhone(phone)) {
    throw new AppError(404, "No encontramos ninguna cita con ese código y teléfono.", "not_found");
  }
  return appointment;
}

export async function lookupForPatient(code, phone) {
  return publicView(await findForPatient(code, phone));
}

export async function cancelByPatient(code, phone) {
  const appointment = await findForPatient(code, phone);
  if (!canPatientCancel(appointment, now(), config.cancelUntilMinutes)) {
    throw new AppError(409, "Esta cita ya no se puede cancelar online. Llámanos y lo vemos.", "not_cancellable");
  }
  await changeStatus(appointment._id, "cancelada");
  appointment.status = "cancelada";
  notifier.appointmentCancelled(appointment, appointment.patient);
  return publicView(appointment);
}

/* ---------- Panel ---------- */

export async function changeStatus(id, status) {
  if (!APPOINTMENT_STATUSES.includes(status)) throw new AppError(400, "Estado no válido.", "invalid");
  const appointment = await Appointment.findById(id);
  if (!appointment) throw new AppError(404, "La cita no existe.", "not_found");
  if (appointment.status === "cancelada" && status !== "cancelada") {
    throw new AppError(409, "Una cita cancelada no se puede reactivar. Crea una nueva.", "cancelled");
  }
  const wasHolding = appointment.status !== "cancelada";
  appointment.status = status;
  await appointment.save();
  if (status === "cancelada" && wasHolding) await releaseInterval(appointment.professional, appointment.date, appointment._id);
  return appointment;
}

export async function agendaForDay(date) {
  const [professionals, appointments] = await Promise.all([
    listProfessionals(),
    Appointment.find({ date })
      .sort({ start: 1 })
      .populate("service", "name durationMinutes")
      .populate("patient", "name phone")
      .lean(),
  ]);
  return { professionals, appointments };
}
