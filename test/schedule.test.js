import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canPatientCancel,
  daySlots,
  dueForReminder,
  earliestStart,
  fitsSchedule,
  freeStarts,
  workingRanges,
} from "../src/lib/schedule.js";
import { minutesUntil, toMinutes } from "../src/lib/time.js";
import { escapeRegex, validateAppointment } from "../src/lib/validate.js";

const config = { stepMinutes: 15, bookingWindowDays: 45, minNoticeMinutes: 120 };

// 2026-11-12 es jueves (weekday 4)
const THU = "2026-11-12";
const laura = {
  id: "laura",
  schedule: [{ weekday: 4, ranges: [{ start: "09:00", end: "14:00" }, { start: "16:00", end: "20:00" }] }],
  timeOff: [{ from: "2026-11-20", to: "2026-11-22" }],
};
const dani = { id: "dani", schedule: [{ weekday: 4, ranges: [{ start: "15:00", end: "21:00" }] }] };
const early = { date: "2026-11-11", minutes: 600 };
const range = (a, b) => ({ start: toMinutes(a), end: toMinutes(b) });

describe("workingRanges", () => {
  it("devuelve los tramos del día de la semana", () => {
    assert.deepEqual(workingRanges(laura, THU), [range("09:00", "14:00"), range("16:00", "20:00")]);
  });
  it("vacío si no trabaja ese día", () => {
    assert.deepEqual(workingRanges(laura, "2026-11-13"), []);
  });
  it("vacío en vacaciones", () => {
    const vacation = { ...laura, schedule: [{ weekday: 5, ranges: [{ start: "09:00", end: "14:00" }] }] };
    assert.deepEqual(workingRanges(vacation, "2026-11-20"), []);
  });
});

describe("freeStarts", () => {
  it("no deja que una cita se salga del horario", () => {
    const starts = freeStarts({ ranges: [range("09:00", "10:00")], booked: [], duration: 45, step: 15 });
    assert.deepEqual(starts, [540, 555]); // 09:00 y 09:15; a las 09:30 ya no caben 45 min
  });

  it("salta los huecos ocupados y los que se solapan", () => {
    const booked = [{ start: toMinutes("10:00"), end: toMinutes("11:00") }];
    const starts = freeStarts({ ranges: [range("09:00", "12:00")], booked, duration: 60, step: 15 });
    assert.ok(starts.includes(toMinutes("09:00")));
    assert.ok(!starts.includes(toMinutes("09:15"))); // terminaría a las 10:15
    assert.ok(!starts.includes(toMinutes("10:30")));
    assert.ok(starts.includes(toMinutes("11:00")));
  });

  it("respeta notBefore", () => {
    const starts = freeStarts({ ranges: [range("09:00", "10:00")], booked: [], duration: 30, step: 15, notBefore: toMinutes("09:20") });
    assert.deepEqual(starts, [toMinutes("09:30")]);
  });
});

describe("daySlots", () => {
  it("junta los huecos de varios fisios e indica quién está libre", () => {
    const bookedBy = new Map([["laura", [{ start: toMinutes("16:00"), end: toMinutes("20:00") }]]]);
    const slots = daySlots({ config, date: THU, duration: 60, professionals: [laura, dani], bookedBy, now: early });
    assert.deepEqual(slots.find((s) => s.time === "09:00").professionals, ["laura"]);
    assert.deepEqual(slots.find((s) => s.time === "16:00").professionals, ["dani"]);
    assert.equal(slots.at(-1).time, "20:00"); // Dani termina a las 21:00
  });

  it("aplica la antelación mínima hoy", () => {
    const now = { date: THU, minutes: toMinutes("09:10") };
    const slots = daySlots({ config, date: THU, duration: 30, professionals: [laura], bookedBy: new Map(), now });
    assert.equal(slots[0].time, "11:15");
  });

  it("no da huecos fuera de la ventana de reservas", () => {
    assert.deepEqual(daySlots({ config, date: "2027-03-04", duration: 30, professionals: [laura], bookedBy: new Map(), now: early }), []);
  });
});

describe("earliestStart y fitsSchedule", () => {
  it("el personal puede reservar sin antelación mínima", () => {
    const now = { date: THU, minutes: 600 };
    assert.equal(earliestStart(config, THU, now), 720);
    assert.equal(earliestStart(config, THU, now, { ignoreNotice: true }), 600);
    assert.equal(earliestStart(config, "2026-11-01", now), null);
  });

  it("comprueba horario y alineación a 15 minutos", () => {
    assert.equal(fitsSchedule(laura, THU, toMinutes("13:00"), 60, 15), true);
    assert.equal(fitsSchedule(laura, THU, toMinutes("13:30"), 60, 15), false);
    assert.equal(fitsSchedule(laura, THU, toMinutes("09:10"), 30, 15), false);
  });
});

describe("recordatorios y cancelación", () => {
  const now = { date: "2026-11-11", minutes: toMinutes("18:00") };
  const appt = (date, time, extra = {}) => ({ status: "confirmada", reminderSentAt: null, date, start: toMinutes(time), ...extra });

  it("minutesUntil cruza la medianoche", () => {
    assert.equal(minutesUntil(now, "2026-11-12", toMinutes("09:00")), 15 * 60);
  });

  it("solo recuerda citas confirmadas de las próximas 24 h que no tengan aviso", () => {
    const due = dueForReminder(
      [
        appt("2026-11-12", "09:00"),
        appt("2026-11-12", "19:00"), // dentro de 25 h
        appt("2026-11-12", "10:00", { reminderSentAt: new Date() }),
        appt("2026-11-12", "11:00", { status: "cancelada" }),
        appt("2026-11-11", "17:00"), // ya pasó
      ],
      now,
      24 * 60,
    );
    assert.equal(due.length, 1);
    assert.equal(due[0].start, toMinutes("09:00"));
  });

  it("el paciente puede cancelar hasta 12 h antes", () => {
    assert.equal(canPatientCancel(appt("2026-11-12", "07:00"), now, 720), true);
    assert.equal(canPatientCancel(appt("2026-11-12", "05:00"), now, 720), false);
  });
});

describe("validación", () => {
  it("usa 'any' si no se elige fisio", () => {
    const { errors, value } = validateAppointment({ serviceId: "x", date: THU, time: "10:00", name: "Ana", phone: "612345678" });
    assert.deepEqual(errors, []);
    assert.equal(value.professionalId, "any");
  });

  it("escapa la búsqueda de pacientes", () => {
    assert.equal(escapeRegex("a.b*(c)"), "a\\.b\\*\\(c\\)");
  });
});
