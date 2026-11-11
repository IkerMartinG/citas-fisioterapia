import { addDays, api, formatDate, todayIn } from "./api.js";

const $ = (sel) => document.querySelector(sel);
const el = (tag, props = {}, ...children) => {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children.filter((c) => c !== null && c !== undefined));
  return node;
};

const state = {
  info: null,
  services: [],
  pros: [],
  serviceId: null,
  professionalId: null, // "any" o id
  from: null, // primer día que se muestra en el calendario
  date: null,
  time: null,
  slotPros: [], // quién está libre a la hora elegida
};
let requestId = 0;
let timesRequest = 0;

const euros = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const dayShort = new Intl.DateTimeFormat("es-ES", { weekday: "short", timeZone: "UTC" });
const monthShort = new Intl.DateTimeFormat("es-ES", { month: "short", timeZone: "UTC" });

const service = () => state.services.find((s) => s.id === state.serviceId);
const proName = (id) => state.pros.find((p) => p.id === id)?.name;

function enable(stepId, on) {
  $(stepId).setAttribute("aria-disabled", String(!on));
  $(stepId).inert = !on;
}

/* ---------- Paso 1: tratamiento ---------- */
function renderServices() {
  $("#services").replaceChildren(
    ...state.services.map((s) => {
      const input = el("input", { type: "radio", name: "service", value: s.id, checked: s.id === state.serviceId });
      input.addEventListener("change", () => {
        state.serviceId = s.id;
        // si el fisio elegido no hace este tratamiento, vuelve a "me da igual"
        if (state.professionalId !== "any" && !s.professionals.includes(state.professionalId)) state.professionalId = "any";
        state.professionalId ??= "any";
        state.time = null;
        renderPros();
        enable("#step-pro", true);
        enable("#step-day", true);
        loadDays();
      });
      return el(
        "label",
        { className: "option" },
        input,
        el("span", { className: "option__body" }, el("span", { className: "option__title", textContent: s.name }), el("p", { className: "option__desc", textContent: s.description })),
        el("span", { className: "option__meta" }, el("strong", { textContent: euros.format(s.price) }), `${s.durationMinutes} min`),
      );
    }),
  );
}

/* ---------- Paso 2: fisio ---------- */
function renderPros() {
  const s = service();
  const options = [{ id: "any", name: "Me da igual", specialty: "El primero que tenga hueco", color: "#C9D4D6" }, ...state.pros.filter((p) => s.professionals.includes(p.id))];
  $("#pros").replaceChildren(
    ...options.map((p) => {
      const input = el("input", { type: "radio", name: "professional", value: p.id, checked: p.id === state.professionalId });
      input.addEventListener("change", () => { state.professionalId = p.id; state.time = null; loadDays(); });
      const dot = el("span", { className: "dot" });
      dot.style.background = p.color;
      return el(
        "label",
        { className: "option" },
        input,
        dot,
        el("span", { className: "option__body" }, el("span", { className: "option__title", textContent: p.name }), el("p", { className: "option__desc", textContent: p.specialty })),
      );
    }),
  );
}

/* ---------- Paso 3: día ---------- */
async function loadDays() {
  updateSummary();
  const today = todayIn(state.info.timeZone);
  state.from ??= today;
  const id = ++requestId;
  $("#days").replaceChildren(el("p", { className: "muted", textContent: "Buscando huecos…" }));
  try {
    const days = await api(`/availability/days?serviceId=${state.serviceId}&professionalId=${state.professionalId}&from=${state.from}`);
    if (id !== requestId) return;
    if (state.date && !days.some((d) => d.date === state.date && d.free > 0)) { state.date = null; state.time = null; }
    if (!state.date) state.date = days.find((d) => d.free > 0)?.date ?? null;
    renderDays(days);
    $("#days-prev").disabled = state.from <= today;
    $("#days-next").disabled = state.from >= addDays(today, state.info.bookingWindowDays - 13);
    loadTimes();
  } catch (err) {
    $("#days").replaceChildren(el("p", { className: "error", textContent: err.message }));
  }
}

function renderDays(days) {
  $("#days").replaceChildren(
    ...days.map((d) => {
      const date = new Date(`${d.date}T00:00:00Z`);
      const b = el(
        "button",
        { type: "button", className: "day", disabled: d.free === 0 },
        el("small", { textContent: dayShort.format(date) }),
        el("strong", { textContent: date.getUTCDate() }),
        el("small", { textContent: monthShort.format(date) }),
        el("span", { className: "free", textContent: d.free ? `${d.free} libres` : "completo" }),
      );
      b.setAttribute("aria-pressed", String(d.date === state.date));
      b.setAttribute("aria-label", `${formatDate(d.date)}, ${d.free ? `${d.free} horas libres` : "sin horas libres"}`);
      b.addEventListener("click", () => { state.date = d.date; state.time = null; renderDays(days); loadTimes(); });
      return b;
    }),
  );
}

$("#days-next").addEventListener("click", () => { state.from = addDays(state.from, 14); loadDays(); });
$("#days-prev").addEventListener("click", () => {
  const today = todayIn(state.info.timeZone);
  const prev = addDays(state.from, -14);
  state.from = prev < today ? today : prev;
  loadDays();
});

/* ---------- Paso 4: hora ---------- */
async function loadTimes() {
  updateSummary();
  enable("#step-time", Boolean(state.date));
  if (!state.date) {
    $("#times").replaceChildren(el("p", { className: "muted", textContent: "No quedan huecos en estos días. Prueba con más días o con otro fisio." }));
    return;
  }
  const id = ++timesRequest;
  try {
    const data = await api(`/availability?serviceId=${state.serviceId}&professionalId=${state.professionalId}&date=${state.date}`);
    if (id !== timesRequest) return;
    renderTimes(data.slots);
  } catch (err) {
    $("#times").replaceChildren(el("p", { className: "error", textContent: err.message }));
  }
}

function renderTimes(slots) {
  if (!slots.length) {
    $("#times").replaceChildren(el("p", { className: "muted", textContent: "Ese día ya no quedan huecos." }));
    return;
  }
  const groups = [
    ["Mañana", slots.filter((s) => s.time < "14:00")],
    ["Tarde", slots.filter((s) => s.time >= "14:00")],
  ].filter(([, list]) => list.length);

  $("#times").replaceChildren(
    ...groups.map(([label, list]) =>
      el(
        "div",
        {},
        el("h3", { textContent: label }),
        el(
          "div",
          { className: "time-grid" },
          ...list.map((slot) => {
            const b = el("button", { type: "button", className: "time", textContent: slot.time });
            b.setAttribute("aria-pressed", String(slot.time === state.time));
            b.addEventListener("click", () => {
              state.time = slot.time;
              state.slotPros = slot.professionals;
              renderTimes(slots);
              updateSummary();
              $("#name").focus({ preventScroll: true });
            });
            return b;
          }),
        ),
      ),
    ),
  );
}

/* ---------- Resumen ---------- */
function setSummary(id, value) {
  const dd = $(id);
  dd.textContent = value || "Sin elegir";
  dd.classList.toggle("empty", !value);
}

function updateSummary() {
  const s = service();
  setSummary("#s-service", s ? `${s.name} (${s.durationMinutes} min)` : "");
  let pro = "";
  if (state.professionalId && state.professionalId !== "any") pro = proName(state.professionalId);
  else if (state.professionalId === "any") pro = state.time && state.slotPros.length === 1 ? proName(state.slotPros[0]) : "El primero libre";
  setSummary("#s-pro", s ? pro : "");
  setSummary("#s-when", state.date && state.time ? `${formatDate(state.date)}, ${state.time}` : "");
  $("#s-price").textContent = s ? euros.format(s.price) : "–";
  enable("#step-details", Boolean(s && state.date && state.time));
}

/* ---------- Enviar ---------- */
$("#booking").addEventListener("submit", async (e) => {
  e.preventDefault();
  const error = $("#error");
  error.hidden = true;
  const form = new FormData(e.currentTarget);
  const submit = $("#submit");
  submit.disabled = true;
  submit.textContent = "Reservando…";
  try {
    const a = await api("/appointments", {
      method: "POST",
      body: {
        serviceId: state.serviceId,
        professionalId: state.professionalId,
        date: state.date,
        time: state.time,
        name: form.get("name"),
        phone: form.get("phone"),
        email: form.get("email"),
        reason: form.get("reason"),
      },
    });
    $("#done-code").textContent = a.code;
    $("#done-text").textContent = `${a.service} con ${a.professional}, el ${formatDate(a.date)} a las ${a.time}.`;
    $("#summary").hidden = true;
    $("#done").hidden = false;
    $("#booking").hidden = true;
    $("#done").closest("aside").scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (err) {
    error.textContent = err.message;
    error.hidden = false;
    if (err.code === "slot_taken") { state.time = null; loadDays(); }
  } finally {
    submit.disabled = false;
    submit.textContent = "Confirmar cita";
  }
});

/* ---------- Equipo ---------- */
function renderTeam() {
  $("#team").replaceChildren(
    ...state.pros.map((p) => {
      const li = el("li", {}, el("h3", { textContent: p.name }), el("p", { className: "spec", textContent: p.specialty }), el("p", { textContent: p.bio }));
      li.style.setProperty("--c", p.color);
      return li;
    }),
  );
}

async function init() {
  ["#step-pro", "#step-day", "#step-time", "#step-details"].forEach((s) => enable(s, false));
  try {
    [state.info, state.services, state.pros] = await Promise.all([api("/info"), api("/services"), api("/professionals")]);
  } catch (err) {
    $("#services").replaceChildren(el("p", { className: "error", textContent: err.message }));
    return;
  }
  renderServices();
  renderTeam();
  updateSummary();
}

init();
