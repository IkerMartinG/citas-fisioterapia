import { Router } from "express";
import mongoose from "mongoose";
import { env } from "../config.js";
import { workingRanges } from "../lib/schedule.js";
import { isISODate, toHHMM } from "../lib/time.js";
import { safeEqual, signToken } from "../lib/token.js";
import { escapeRegex, text } from "../lib/validate.js";
import { requireAdmin } from "../middleware/auth.js";
import { Appointment, Patient, Professional } from "../models/index.js";
import { agendaForDay, AppError, bookAppointment, changeStatus } from "../services/appointments.js";

export const adminRouter = Router();

adminRouter.post("/login", (req, res) => {
  const password = req.body?.password ?? "";
  if (!env.adminPassword || !safeEqual(password, env.adminPassword)) {
    throw new AppError(401, "Contraseña incorrecta.", "bad_password");
  }
  res.json({ token: signToken({ role: "admin" }, env.tokenSecret, env.tokenTtlSeconds) });
});

adminRouter.use(requireAdmin);

adminRouter.get("/me", (req, res) => res.json({ role: req.session.role }));

const ensureId = (id) => {
  if (!mongoose.isValidObjectId(id)) throw new AppError(400, "Identificador no válido.", "invalid_id");
  return id;
};

const appointmentView = (a) => ({
  id: String(a._id),
  code: a.code,
  date: a.date,
  time: toHHMM(a.start),
  start: a.start,
  end: a.end,
  status: a.status,
  source: a.source,
  reason: a.reason,
  reminderSent: Boolean(a.reminderSentAt),
  professionalId: String(a.professional?._id ?? a.professional),
  professional: a.professional?.name,
  service: a.service?.name,
  patient: a.patient ? { id: String(a.patient._id ?? a.patient), name: a.patient.name, phone: a.patient.phone } : null,
});

adminRouter.get("/agenda", async (req, res) => {
  const { date } = req.query;
  if (!isISODate(date)) throw new AppError(400, "Indica una fecha válida.", "invalid");
  const { professionals, appointments } = await agendaForDay(date);
  res.json({
    date,
    professionals: professionals.map((p) => ({
      id: p.id,
      name: p.name,
      specialty: p.specialty,
      color: p.color,
      ranges: workingRanges(p, date),
      off: (p.timeOff ?? []).find((t) => t.from <= date && date <= t.to)?.reason ?? null,
    })),
    appointments: appointments.map(appointmentView),
  });
});

adminRouter.post("/appointments", async (req, res) => {
  const { appointment } = await bookAppointment(req.body, { source: "clinica" });
  const full = await Appointment.findById(appointment._id).populate("service", "name").populate("patient", "name phone").populate("professional", "name").lean();
  res.status(201).json(appointmentView(full));
});

adminRouter.patch("/appointments/:id", async (req, res) => {
  const id = ensureId(req.params.id);
  await changeStatus(id, req.body?.status);
  const full = await Appointment.findById(id).populate("service", "name").populate("patient", "name phone").populate("professional", "name").lean();
  res.json(appointmentView(full));
});

adminRouter.get("/patients", async (req, res) => {
  const q = text(req.query.q);
  const filter = q
    ? { $or: [{ name: { $regex: escapeRegex(q), $options: "i" } }, { phone: { $regex: escapeRegex(q.replace(/[\s-]/g, "")) } }] }
    : {};
  const patients = await Patient.find(filter, "name phone email").sort({ name: 1 }).limit(50).lean();
  res.json(patients.map((p) => ({ id: String(p._id), name: p.name, phone: p.phone, email: p.email })));
});

adminRouter.get("/patients/:id", async (req, res) => {
  const id = ensureId(req.params.id);
  const patient = await Patient.findById(id).populate("notes.professional", "name").lean();
  if (!patient) throw new AppError(404, "El paciente no existe.", "not_found");
  const appointments = await Appointment.find({ patient: id })
    .sort({ date: -1, start: -1 })
    .populate("service", "name")
    .populate("professional", "name")
    .lean();
  res.json({
    id: String(patient._id),
    name: patient.name,
    phone: patient.phone,
    email: patient.email,
    since: patient.createdAt,
    notes: patient.notes
      .map((n) => ({ id: String(n._id), text: n.text, professional: n.professional?.name ?? null, createdAt: n.createdAt }))
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)),
    appointments: appointments.map(appointmentView),
  });
});

adminRouter.post("/patients/:id/notes", async (req, res) => {
  const id = ensureId(req.params.id);
  const noteText = text(req.body?.text);
  if (noteText.length < 2 || noteText.length > 2000) throw new AppError(400, "La nota debe tener entre 2 y 2000 caracteres.", "invalid");
  const professionalId = req.body?.professionalId;
  if (professionalId) {
    ensureId(professionalId);
    if (!(await Professional.exists({ _id: professionalId }))) throw new AppError(404, "Ese profesional no existe.", "not_found");
  }
  const patient = await Patient.findByIdAndUpdate(
    id,
    { $push: { notes: { text: noteText, professional: professionalId || undefined } } },
    { new: true },
  );
  if (!patient) throw new AppError(404, "El paciente no existe.", "not_found");
  res.status(201).json({ ok: true });
});
