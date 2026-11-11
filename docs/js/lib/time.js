// Fechas como "YYYY-MM-DD" y horas como minutos desde medianoche.
// Guardarlo así evita todos los líos de zonas horarias: una reserva a las 21:00
// en Tenerife es "21:00" aunque el servidor esté en otro país.

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isHHMM(value) {
  return typeof value === "string" && HHMM.test(value);
}

export function toMinutes(hhmm) {
  const match = HHMM.exec(hhmm);
  if (!match) throw new Error(`Hora no válida: ${hhmm}`);
  return Number(match[1]) * 60 + Number(match[2]);
}

export function toHHMM(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function isISODate(value) {
  if (typeof value !== "string" || !ISO_DATE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

export function weekday(isoDate) {
  return new Date(`${isoDate}T00:00:00Z`).getUTCDay();
}

export function addDays(isoDate, days) {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Fecha y minuto actuales en la zona horaria del negocio. */
export function nowIn(timeZone, at = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(at);
  const get = (type) => parts.find((p) => p.type === type).value;
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    minutes: Number(get("hour")) * 60 + Number(get("minute")),
  };
}

export function overlaps(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && bStart < aEnd;
}

/** Bloques de `step` minutos que ocupa algo que empieza en `start` y dura `duration`. */
export function blocksFor(start, duration, step) {
  const blocks = [];
  for (let t = start; t < start + duration; t += step) blocks.push(t);
  return blocks;
}

/** Minutos que faltan desde `now` ({ date, minutes }) hasta `date` a los `minutes` indicados. */
export function minutesUntil(now, date, minutes) {
  const days = Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${now.date}T00:00:00Z`)) / 86_400_000);
  return days * 1440 + minutes - now.minutes;
}
