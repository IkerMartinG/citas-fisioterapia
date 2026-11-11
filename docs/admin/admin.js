import { addDays, api, formatDate, todayIn } from "../js/api.js";

const $ = (sel) => document.querySelector(sel);
const el = (tag, props = {}, ...children) => {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children.filter((c) => c !== null && c !== undefined && c !== false));
  return node;
};
const toHHMM = (min) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

const TOKEN_KEY = "fisio-teide-token";
const STATUS = { confirmada: "Confirmada", atendida: "Atendida", no_show: "No vino", cancelada: "Cancelada" };
const DAY_START = 8 * 60;
const DAY_END = 21 * 60;
const PX_PER_MIN = 1.3;

const state = { token: null, info: null, services: [], pros: [], date: null, agenda: null, selected: null, patientId: null };

/* ---------- Sesión ---------- */
function setToken(t) {
  state.token = t;
  try { t ? sessionStorage.setItem(TOKEN_KEY, t) : sessionStorage.removeItem(TOKEN_KEY); } catch { /* modo privado */ }
}

async function call(path, options = {}) {
  try {
    return await api(path, { ...options, token: state.token });
  } catch (err) {
    if (err.status === 401) { setToken(null); showLogin(); }
    throw err;
  }
}

function showLogin() {
  $("#app-view").hidden = true;
  $("#login-view").hidden = false;
  $("#password").focus();
}

$("#login").addEventListener("submit", async (e) => {
  e.preventDefault();
  $("#login-error").hidden = true;
  try {
    const { token } = await api("/admin/login", { method: "POST", body: { password: $("#password").value } });
    setToken(token);
    $("#password").value = "";
    await start();
  } catch (err) {
    $("#login-error").textContent = err.message;
    $("#login-error").hidden = false;
  }
});
$("#logout").addEventListener("click", () => { setToken(null); showLogin(); });

/* ---------- Pestañas ---------- */
function showTab(name) {
  document.querySelectorAll(".tab").forEach((t) => (t.dataset.tab === name ? t.setAttribute("aria-current", "page") : t.removeAttribute("aria-current")));
  $("#view-agenda").hidden = name !== "agenda";
  $("#view-patients").hidden = name !== "patients";
  if (name === "patients") searchPatients($("#search").value);
}
document.querySelectorAll(".tab").forEach((t) => t.addEventListener("click", () => showTab(t.dataset.tab)));

/* ---------- Agenda ---------- */
async function loadDay(date) {
  state.date = date;
  $("#date").value = date;
  $("#day-title").textContent = formatDate(date);
  try {
    state.agenda = await call(`/admin/agenda?date=${date}`);
  } catch (err) {
    if (err.status !== 401) $("#agenda").replaceChildren(el("p", { className: "error", textContent: err.message }));
    return;
  }
  if (!state.agenda.appointments.some((a) => a.id === state.selected)) state.selected = null;
  renderAgenda();
  renderDetail();
}

function renderAgenda() {
  const { professionals, appointments } = state.agenda;
  const height = (DAY_END - DAY_START) * PX_PER_MIN;
  const y = (min) => `${(min - DAY_START) * PX_PER_MIN}px`;

  const active = appointments.filter((a) => a.status !== "cancelada");
  $("#day-stats").textContent = `${active.length} citas · ${active.filter((a) => a.status === "confirmada").length} pendientes`;

  const grid = $("#agenda");
  grid.style.gridTemplateColumns = `56px repeat(${professionals.length}, minmax(180px, 1fr))`;

  const heads = [el("div", { className: "ag-head" })];
  professionals.forEach((p) => {
    const dot = el("span", { className: "dot" });
    dot.style.background = p.color;
    dot.style.marginTop = "0";
    heads.push(el("div", { className: "ag-head" }, dot, el("div", {}, p.name, el("small", { textContent: p.specialty }))));
  });

  const axis = el("div", { className: "ag-axis" });
  axis.style.height = `${height}px`;
  for (let t = DAY_START + 60; t < DAY_END; t += 60) {
    const h = el("span", { className: "ag-hour", textContent: toHHMM(t) });
    h.style.top = y(t);
    axis.append(h);
  }

  const today = todayIn(state.info.timeZone);
  const nowMin = (() => {
    const parts = new Intl.DateTimeFormat("en-GB", { timeZone: state.info.timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date());
    const [h, m] = parts.split(":").map(Number);
    return h * 60 + m;
  })();

  const cols = professionals.map((p) => {
    const col = el("div", { className: "ag-col" });
    col.style.height = `${height}px`;
    p.ranges.forEach((r) => {
      const w = el("div", { className: "ag-work" });
      w.style.top = y(r.start);
      w.style.height = `${(r.end - r.start) * PX_PER_MIN}px`;
      col.append(w);
    });
    for (let t = DAY_START + 60; t < DAY_END; t += 60) {
      const line = el("div", { className: "ag-line" });
      line.style.top = y(t);
      col.append(line);
    }
    if (p.off) col.append(el("p", { className: "ag-off", textContent: p.off }));
    else if (!p.ranges.length) col.append(el("p", { className: "ag-off", textContent: "No trabaja" }));

    appointments
      .filter((a) => a.professionalId === p.id)
      .forEach((a) => {
        const b = el(
          "button",
          { type: "button", className: `appt appt--${a.status}` },
          el("strong", { textContent: a.patient?.name ?? "" }),
          el("span", { textContent: `${a.time} · ${a.service}` }),
        );
        b.style.setProperty("--c", p.color);
        b.style.top = y(a.start);
        b.style.height = `${(a.end - a.start) * PX_PER_MIN - 2}px`;
        b.setAttribute("aria-pressed", String(a.id === state.selected));
        b.setAttribute("aria-label", `${a.time}, ${a.patient?.name}, ${a.service}, ${STATUS[a.status]}`);
        b.addEventListener("click", () => { state.selected = a.id; renderAgenda(); renderDetail(); });
        col.append(b);
      });

    if (state.date === today && nowMin > DAY_START && nowMin < DAY_END) {
      const now = el("div", { className: "ag-now" });
      now.style.top = y(nowMin);
      col.append(now);
    }
    return col;
  });

  grid.replaceChildren(...heads, axis, ...cols);
}

function renderDetail() {
  const aside = $("#detail");
  const a = state.agenda?.appointments.find((x) => x.id === state.selected);
  if (!a) { aside.hidden = true; return; }
  aside.hidden = false;

  const row = (k, v) => (v ? [el("dt", { textContent: k }), el("dd", { textContent: v })] : []);
  const actions = el("div", { className: "actions" });
  const action = (label, status, danger) => {
    const b = el("button", { type: "button", textContent: label, className: danger ? "danger" : "" });
    b.addEventListener("click", () => setStatus(a.id, status));
    return b;
  };
  if (a.status === "confirmada") actions.append(action("Atendida", "atendida"), action("No vino", "no_show", true), action("Cancelar", "cancelada", true));
  if (a.status === "atendida" || a.status === "no_show") actions.append(action("Volver a confirmada", "confirmada"));

  const open = el("button", { type: "button", className: "btn btn--primary btn--block", textContent: "Ver ficha del paciente" });
  open.addEventListener("click", () => { showTab("patients"); openPatient(a.patient.id); });

  aside.replaceChildren(
    el("h2", { textContent: a.patient?.name }),
    el("p", { className: "meta" }, `${a.time} a ${toHHMM(a.end)} · `, el("span", { className: `pill pill--${a.status}`, textContent: STATUS[a.status] })),
    el(
      "dl",
      { className: "details" },
      ...row("Tratamiento", a.service),
      ...row("Fisio", a.professional),
      ...row("Teléfono", a.patient?.phone),
      ...row("Motivo", a.reason),
      ...row("Origen", a.source === "web" ? "Web" : "Clínica"),
      ...row("Recordatorio", a.reminderSent ? "Enviado" : a.status === "confirmada" ? "Pendiente" : ""),
      ...row("Código", a.code),
    ),
    actions.childElementCount ? actions : null,
    open,
    el("p", { className: "error", id: "detail-error", role: "alert", hidden: true }),
  );
}

async function setStatus(id, status) {
  try {
    const updated = await call(`/admin/appointments/${id}`, { method: "PATCH", body: { status } });
    state.agenda.appointments = state.agenda.appointments.map((a) => (a.id === id ? updated : a));
    if (status === "cancelada") state.selected = null;
    renderAgenda();
    renderDetail();
  } catch (err) {
    const e = $("#detail-error");
    if (e) { e.textContent = err.message; e.hidden = false; }
  }
}

$("#prev").addEventListener("click", () => loadDay(addDays(state.date, -1)));
$("#next").addEventListener("click", () => loadDay(addDays(state.date, 1)));
$("#today").addEventListener("click", () => loadDay(todayIn(state.info.timeZone)));
$("#date").addEventListener("change", (e) => e.target.value && loadDay(e.target.value));

/* ---------- Pacientes ---------- */
let searchTimer = 0;
$("#search").addEventListener("input", (e) => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => searchPatients(e.target.value), 200);
});

async function searchPatients(q) {
  try {
    const list = await call(`/admin/patients?q=${encodeURIComponent(q.trim())}`);
    $("#plist").replaceChildren(
      ...(list.length
        ? list.map((p) => {
            const b = el("button", { type: "button" }, p.name, el("small", { textContent: p.phone }));
            b.setAttribute("aria-current", String(p.id === state.patientId));
            b.addEventListener("click", () => openPatient(p.id));
            return el("li", {}, b);
          })
        : [el("li", { className: "muted", textContent: "No hay pacientes con esa búsqueda." })]),
    );
  } catch { /* la sesión ya se gestiona en call() */ }
}

async function openPatient(id) {
  state.patientId = id;
  searchPatients($("#search").value);
  const file = $("#file");
  let p;
  try {
    p = await call(`/admin/patients/${id}`);
  } catch (err) {
    file.replaceChildren(el("p", { className: "error", textContent: err.message }));
    return;
  }
  const visits = p.appointments.filter((a) => a.status === "atendida").length;
  const noShows = p.appointments.filter((a) => a.status === "no_show").length;

  const proSelect = el("select", { id: "note-pro", name: "professionalId" }, el("option", { value: "", textContent: "Sin indicar" }), ...state.pros.map((pr) => el("option", { value: pr.id, textContent: pr.name })));
  const noteForm = el(
    "form",
    {},
    el("div", { className: "field" }, el("label", { htmlFor: "note-text", textContent: "Nueva nota clínica" }), el("textarea", { id: "note-text", name: "text", maxLength: 2000, required: true })),
    el("div", { className: "field" }, el("label", { htmlFor: "note-pro", textContent: "Fisio" }), proSelect),
    el("button", { type: "submit", className: "btn btn--primary", textContent: "Guardar nota" }),
    el("p", { className: "error", id: "note-error", role: "alert", hidden: true }),
  );
  noteForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(noteForm).entries());
    try {
      await call(`/admin/patients/${id}/notes`, { method: "POST", body: data });
      openPatient(id);
    } catch (err) {
      $("#note-error").textContent = err.message;
      $("#note-error").hidden = false;
    }
  });

  file.replaceChildren(
    el("h2", { textContent: p.name }),
    el("p", { className: "meta", textContent: [p.phone, p.email].filter(Boolean).join(" · ") }),
    el("p", { textContent: `${visits} ${visits === 1 ? "sesión atendida" : "sesiones atendidas"}${noShows ? ` · ${noShows} sin presentarse` : ""}` }),
    el("h3", { textContent: "Notas clínicas" }),
    p.notes.length
      ? el(
          "ul",
          { className: "notes" },
          ...p.notes.map((n) =>
            el("li", {}, el("small", { textContent: `${new Date(n.createdAt).toLocaleDateString("es-ES")}${n.professional ? ` · ${n.professional}` : ""}` }), n.text),
          ),
        )
      : el("p", { className: "muted", textContent: "Todavía no hay notas." }),
    noteForm,
    el("h3", { textContent: "Historial de citas" }),
    el(
      "div",
      { className: "table-wrap" },
      el(
        "table",
        { className: "history" },
        el("thead", {}, el("tr", {}, ...["Día", "Hora", "Tratamiento", "Fisio", "Estado"].map((h) => el("th", { textContent: h })))),
        el(
          "tbody",
          {},
          ...p.appointments.map((a) =>
            el(
              "tr",
              {},
              el("td", { textContent: new Date(`${a.date}T00:00:00Z`).toLocaleDateString("es-ES", { timeZone: "UTC" }) }),
              el("td", { textContent: a.time }),
              el("td", { textContent: a.service }),
              el("td", { textContent: a.professional }),
              el("td", {}, el("span", { className: `pill pill--${a.status}`, textContent: STATUS[a.status] })),
            ),
          ),
        ),
      ),
    ),
  );
}

/* ---------- Nueva cita ---------- */
const dialog = $("#new-dialog");

function fillProsFor(serviceId) {
  const s = state.services.find((x) => x.id === serviceId);
  $("#n-pro").replaceChildren(
    el("option", { value: "any", textContent: "Cualquiera libre" }),
    ...state.pros.filter((p) => s?.professionals.includes(p.id)).map((p) => el("option", { value: p.id, textContent: p.name })),
  );
}

$("#n-service").addEventListener("change", (e) => fillProsFor(e.target.value));

$("#new").addEventListener("click", () => {
  $("#new-form").reset();
  $("#n-service").replaceChildren(...state.services.map((s) => el("option", { value: s.id, textContent: `${s.name} (${s.durationMinutes} min)` })));
  fillProsFor(state.services[0]?.id);
  $("#n-date").value = state.date;
  $("#new-error").hidden = true;
  dialog.showModal();
});
$("#new-cancel").addEventListener("click", () => dialog.close());

$("#new-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const body = Object.fromEntries(new FormData(e.currentTarget).entries());
  try {
    const created = await call("/admin/appointments", { method: "POST", body });
    dialog.close();
    showTab("agenda");
    state.selected = created.id;
    await loadDay(created.date);
  } catch (err) {
    $("#new-error").textContent = err.message;
    $("#new-error").hidden = false;
  }
});

/* ---------- Arranque ---------- */
async function start() {
  try {
    [state.info, state.services, state.pros] = await Promise.all([api("/info"), api("/services"), api("/professionals")]);
    await call("/admin/me");
  } catch {
    return;
  }
  $("#login-view").hidden = true;
  $("#app-view").hidden = false;
  await loadDay(state.date ?? todayIn(state.info.timeZone));
}

try { state.token = sessionStorage.getItem(TOKEN_KEY); } catch { state.token = null; }
if (state.token) start();
else showLogin();
