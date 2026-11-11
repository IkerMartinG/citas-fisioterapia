import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { reservationCode } from "../src/lib/code.js";
import { addDays, blocksFor, isISODate, nowIn, toHHMM, toMinutes, weekday } from "../src/lib/time.js";
import { safeEqual, signToken, verifyToken } from "../src/lib/token.js";

describe("time", () => {
  it("convierte entre HH:MM y minutos", () => {
    assert.equal(toMinutes("21:30"), 1290);
    assert.equal(toHHMM(1290), "21:30");
    assert.throws(() => toMinutes("25:00"));
  });

  it("valida fechas de verdad", () => {
    assert.equal(isISODate("2026-02-28"), true);
    assert.equal(isISODate("2026-02-30"), false);
    assert.equal(isISODate("12/11/2026"), false);
  });

  it("suma días cruzando meses y años", () => {
    assert.equal(addDays("2026-12-31", 1), "2027-01-01");
    assert.equal(weekday("2026-11-16"), 1);
  });

  it("calcula la hora en Canarias", () => {
    // 2026-07-01 12:00 UTC = 13:00 en Canarias (horario de verano)
    assert.deepEqual(nowIn("Atlantic/Canary", new Date("2026-07-01T12:00:00Z")), { date: "2026-07-01", minutes: 780 });
  });

  it("divide una reserva en bloques", () => {
    assert.deepEqual(blocksFor(1200, 90, 30), [1200, 1230, 1260]);
  });
});

describe("token", () => {
  const secret = "secreto-de-prueba";

  it("firma y verifica", () => {
    const token = signToken({ role: "admin" }, secret, 60);
    assert.equal(verifyToken(token, secret).role, "admin");
  });

  it("rechaza tokens manipulados, con otro secreto o caducados", () => {
    const token = signToken({ role: "admin" }, secret, 60, 0);
    const [body, sig] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ role: "admin", exp: 9e12 })).toString("base64url");
    assert.equal(verifyToken(`${forged}.${sig}`, secret, 0), null);
    assert.equal(verifyToken(token, "otro", 0), null);
    assert.equal(verifyToken(token, secret, 61_000), null);
    assert.equal(verifyToken(`${body}`, secret, 0), null);
  });

  it("compara contraseñas", () => {
    assert.equal(safeEqual("abc", "abc"), true);
    assert.equal(safeEqual("abc", "abd"), false);
  });
});

describe("reservationCode", () => {
  it("usa solo caracteres fáciles de dictar", () => {
    for (let i = 0; i < 200; i++) assert.match(reservationCode(), /^[A-HJ-NP-Z2-9]{6}$/);
  });
});
