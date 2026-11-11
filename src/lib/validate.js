import { isHHMM, isISODate } from "./time.js";

const PHONE = /^\+?[\d\s-]{9,20}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export const text = (v) => (typeof v === "string" ? v.trim() : "");

export function normalizePhone(phone) {
  return text(phone).replace(/[\s-]/g, "");
}

/** Escapa una cadena para usarla dentro de una RegExp (búsqueda de pacientes). */
export function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Valida una petición de cita. Devuelve { errors, value }. */
export function validateAppointment(body) {
  const errors = [];
  const value = {
    serviceId: text(body?.serviceId),
    professionalId: text(body?.professionalId) || "any",
    date: text(body?.date),
    time: text(body?.time),
    name: text(body?.name),
    phone: normalizePhone(body?.phone),
    email: text(body?.email).toLowerCase(),
    reason: text(body?.reason),
  };

  if (!value.serviceId) errors.push("Elige un tratamiento.");
  if (!isISODate(value.date)) errors.push("La fecha no es válida.");
  if (!isHHMM(value.time)) errors.push("La hora no es válida.");
  if (value.name.length < 2 || value.name.length > 80) errors.push("Escribe un nombre de entre 2 y 80 caracteres.");
  if (!PHONE.test(value.phone)) errors.push("Escribe un teléfono válido.");
  if (value.email && !EMAIL.test(value.email)) errors.push("El email no es válido.");
  if (value.reason.length > 500) errors.push("El motivo no puede pasar de 500 caracteres.");

  return { errors, value };
}
