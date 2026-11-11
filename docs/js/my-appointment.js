import { api, formatDate } from "./api.js";

const $ = (sel) => document.querySelector(sel);
const STATUS = { confirmada: "Confirmada", atendida: "Atendida", cancelada: "Cancelada", no_show: "No presentada" };

let query = null;
let confirming = false;

function show(a) {
  $("#r-service").textContent = a.service;
  $("#r-pro").textContent = a.professional;
  $("#r-date").textContent = formatDate(a.date);
  $("#r-time").textContent = `${a.time} (${a.durationMinutes} min)`;
  $("#r-status").textContent = STATUS[a.status] ?? a.status;
  $("#cancel").hidden = !a.canCancel;
  $("#cancel").textContent = "Cancelar cita";
  $("#no-cancel").hidden = a.canCancel || a.status !== "confirmada";
  confirming = false;
  $("#result").hidden = false;
}

$("#lookup").addEventListener("submit", async (e) => {
  e.preventDefault();
  const error = $("#lookup-error");
  error.hidden = true;
  const form = new FormData(e.currentTarget);
  query = { code: String(form.get("code")).trim().toUpperCase(), phone: String(form.get("phone")) };
  try {
    show(await api("/appointments/lookup", { method: "POST", body: query }));
  } catch (err) {
    $("#result").hidden = true;
    error.textContent = err.message;
    error.hidden = false;
  }
});

$("#cancel").addEventListener("click", async () => {
  const btn = $("#cancel");
  const error = $("#cancel-error");
  error.hidden = true;
  if (!confirming) {
    confirming = true;
    btn.textContent = "Sí, cancelar la cita";
    return;
  }
  btn.disabled = true;
  try {
    show(await api("/appointments/cancel", { method: "POST", body: query }));
  } catch (err) {
    error.textContent = err.message;
    error.hidden = false;
  } finally {
    btn.disabled = false;
  }
});
