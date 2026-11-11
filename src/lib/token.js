// Sesiones del panel: un token firmado con HMAC-SHA256 (mismo principio que un JWT,
// sin dependencias). Contiene el payload en base64url y su firma.
import { createHmac, timingSafeEqual } from "node:crypto";

const encode = (value) => Buffer.from(value).toString("base64url");
const sign = (body, secret) => createHmac("sha256", secret).update(body).digest();

export function signToken(payload, secret, ttlSeconds, now = Date.now()) {
  const body = encode(JSON.stringify({ ...payload, exp: Math.floor(now / 1000) + ttlSeconds }));
  return `${body}.${sign(body, secret).toString("base64url")}`;
}

export function verifyToken(token, secret, now = Date.now()) {
  if (typeof token !== "string") return null;
  const [body, signature, extra] = token.split(".");
  if (!body || !signature || extra !== undefined) return null;

  const expected = sign(body, secret);
  const given = Buffer.from(signature, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;

  let payload;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (typeof payload.exp !== "number" || payload.exp * 1000 <= now) return null;
  return payload;
}

/** Compara dos cadenas en tiempo constante (para la contraseña del panel). */
export function safeEqual(a, b) {
  const ha = createHmac("sha256", "compare").update(String(a)).digest();
  const hb = createHmac("sha256", "compare").update(String(b)).digest();
  return timingSafeEqual(ha, hb);
}
