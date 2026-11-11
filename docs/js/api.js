// Pequeño cliente de la API: lanza un Error con el mensaje del servidor si algo va mal.
//
// En la demo de GitHub Pages (<html data-demo="true">, la genera `npm run build:demo`) no hay
// servidor: las peticiones las responde un backend simulado en el navegador (js/demo/server.js).
const isDemo = document.documentElement.dataset.demo === "true";
let demoServer = null;

export async function api(path, { method = "GET", body, token } = {}) {
  if (isDemo) {
    demoServer ??= import(new URL("./demo/server.js", import.meta.url));
    return (await demoServer).handle(path, { method, body, token });
  }

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
