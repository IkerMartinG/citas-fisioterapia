// Lógica de agenda, sin base de datos. Recibe horarios y citas, devuelve huecos.
import { addDays, minutesUntil, overlaps, toHHMM, toMinutes, weekday } from "./time.js";

/** Tramos de trabajo de un profesional un día concreto, en minutos. Vacío si libra o está de vacaciones. */
export function workingRanges(professional, date) {
  const off = (professional.timeOff ?? []).some((t) => t.from <= date && date <= t.to);
  if (off) return [];
  const day = (professional.schedule ?? []).find((d) => d.weekday === weekday(date));
  if (!day) return [];
  return day.ranges
    .map((r) => ({ start: toMinutes(r.start), end: toMinutes(r.end) }))
    .filter((r) => r.end > r.start)
    .sort((a, b) => a.start - b.start);
}

/** Primer minuto del día `date` en el que se puede empezar una cita, o null si el día no se puede reservar. */
export function earliestStart(config, date, now, { ignoreNotice = false } = {}) {
  if (date < now.date) return null;
  if (date > addDays(now.date, config.bookingWindowDays)) return null;
  if (date > now.date) return 0;
  return now.minutes + (ignoreNotice ? 0 : config.minNoticeMinutes);
}

/** Horas de inicio libres para una cita de `duration` minutos. */
export function freeStarts({ ranges, booked, duration, step, notBefore = 0 }) {
  const starts = [];
  for (const range of ranges) {
    for (let t = range.start; t + duration <= range.end; t += step) {
      if (t < notBefore) continue;
      if (booked.some((b) => overlaps(t, t + duration, b.start, b.end))) continue;
      starts.push(t);
    }
  }
  return starts;
}

/**
 * Huecos de un día para un tratamiento.
 * `professionals`: los que hacen ese tratamiento. `bookedBy`: Map idProfesional -> [{start, end}].
 * Devuelve [{ time, professionals: [ids] }] ordenado por hora.
 */
export function daySlots({ config, date, duration, professionals, bookedBy, now }) {
  const notBefore = earliestStart(config, date, now);
  if (notBefore === null) return [];
  const byTime = new Map();
  for (const p of professionals) {
    const starts = freeStarts({
      ranges: workingRanges(p, date),
      booked: bookedBy.get(p.id) ?? [],
      duration,
      step: config.stepMinutes,
      notBefore,
    });
    for (const t of starts) {
      if (!byTime.has(t)) byTime.set(t, []);
      byTime.get(t).push(p.id);
    }
  }
  return [...byTime.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([t, ids]) => ({ time: toHHMM(t), professionals: ids }));
}

/** ¿Puede un profesional atender de `start` a `start + duration` ese día según su horario? */
export function fitsSchedule(professional, date, start, duration, step) {
  return workingRanges(professional, date).some(
    (r) => start >= r.start && start + duration <= r.end && (start - r.start) % step === 0,
  );
}

/** Citas a las que hay que mandar recordatorio ahora. */
export function dueForReminder(appointments, now, windowMinutes) {
  return appointments.filter((a) => {
    if (a.status !== "confirmada" || a.reminderSentAt) return false;
    const left = minutesUntil(now, a.date, a.start);
    return left > 0 && left <= windowMinutes;
  });
}

/** ¿Puede el paciente cancelar todavía desde la web? */
export function canPatientCancel(appointment, now, cancelUntilMinutes) {
  return appointment.status === "confirmada" && minutesUntil(now, appointment.date, appointment.start) >= cancelUntilMinutes;
}
