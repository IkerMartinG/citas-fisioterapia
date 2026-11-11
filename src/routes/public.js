import { Router } from "express";
import { clinic as config } from "../config.js";
import { addDays, isISODate } from "../lib/time.js";
import {
  AppError,
  availability,
  availabilityDays,
  bookAppointment,
  cancelByPatient,
  listProfessionals,
  listServices,
  lookupForPatient,
  now,
  publicView,
} from "../services/appointments.js";

export const publicRouter = Router();

publicRouter.get("/info", (req, res) => {
  res.json({
    name: config.name,
    timeZone: config.timeZone,
    bookingWindowDays: config.bookingWindowDays,
    cancelUntilHours: config.cancelUntilMinutes / 60,
  });
});

publicRouter.get("/services", async (req, res) => {
  const services = await listServices();
  res.json(
    services.map((s) => ({
      id: String(s._id),
      name: s.name,
      description: s.description,
      durationMinutes: s.durationMinutes,
      price: s.price,
      professionals: s.professionals.map(String),
    })),
  );
});

publicRouter.get("/professionals", async (req, res) => {
  const pros = await listProfessionals();
  res.json(pros.map((p) => ({ id: p.id, name: p.name, specialty: p.specialty, bio: p.bio, color: p.color })));
});

publicRouter.get("/availability", async (req, res) => {
  const { serviceId, professionalId = "any", date } = req.query;
  if (!isISODate(date)) throw new AppError(400, "Indica una fecha válida (YYYY-MM-DD).", "invalid");
  res.json(await availability({ serviceId, professionalId, date }));
});

publicRouter.get("/availability/days", async (req, res) => {
  const { serviceId, professionalId = "any" } = req.query;
  const from = isISODate(req.query.from) ? req.query.from : now().date;
  const lastDay = addDays(now().date, config.bookingWindowDays);
  if (from > lastDay) return res.json([]);
  res.json(await availabilityDays({ serviceId, professionalId, from, days: 14 }));
});

publicRouter.post("/appointments", async (req, res) => {
  const { appointment, service, professional, patient } = await bookAppointment(req.body, { source: "web" });
  res.status(201).json(publicView({ ...appointment.toObject(), service, professional, patient }));
});

publicRouter.post("/appointments/lookup", async (req, res) => {
  res.json(await lookupForPatient(req.body?.code, req.body?.phone));
});

publicRouter.post("/appointments/cancel", async (req, res) => {
  res.json(await cancelByPatient(req.body?.code, req.body?.phone));
});
