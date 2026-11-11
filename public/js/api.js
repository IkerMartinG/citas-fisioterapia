// Pequeño cliente de la API: lanza un Error con el mensaje del servidor si algo va mal.
export async function api(path, { method = "GET", body, token } = {}) {
  const headers = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (token) headers.Authorization = `Bearer ${token}`;

  let res;
  try {
    res = await fetch(`/api${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch {
    throw Object.assign(new Error("No hay conexión con el servidor. Revisa tu conexión e inténtalo de nuevo."), { status: 0 });
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || "Algo ha fallado."), { status: res.status, code: data.code });
  return data;
}

/** Fecha de hoy en Canarias como YYYY-MM-DD. */
export function todayIn(timeZone) {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

export function addDays(iso, n) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const longDate = new Intl.DateTimeFormat("es-ES", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
export const formatDate = (iso) => longDate.format(new Date(`${iso}T00:00:00Z`));
