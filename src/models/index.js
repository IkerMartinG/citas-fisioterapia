import mongoose from "mongoose";

const { Schema, model } = mongoose;
const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

/* ---------- Profesional ---------- */
const rangeSchema = new Schema({ start: { type: String, match: HHMM }, end: { type: String, match: HHMM } }, { _id: false });

const professionalSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    specialty: { type: String, default: "" },
    bio: { type: String, default: "" },
    color: { type: String, default: "#0F6E66" },
    // Horario semanal: weekday 0 = domingo … 6 = sábado
    schedule: [{ _id: false, weekday: { type: Number, min: 0, max: 6 }, ranges: [rangeSchema] }],
    timeOff: [{ _id: false, from: String, to: String, reason: String }],
    active: { type: Boolean, default: true },
  },
  { timestamps: true },
);

/* ---------- Tratamiento ---------- */
const serviceSchema = new Schema(
  {
    name: { type: String, required: true },
    description: { type: String, default: "" },
    durationMinutes: { type: Number, required: true, min: 15 },
    price: { type: Number, required: true, min: 0 },
    professionals: [{ type: Schema.Types.ObjectId, ref: "Professional" }],
    active: { type: Boolean, default: true },
    order: { type: Number, default: 0 },
  },
  { timestamps: true },
);

/* ---------- Paciente ---------- */
const patientSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    phone: { type: String, required: true, unique: true },
    email: { type: String, default: "" },
    // Notas clínicas: solo visibles en el panel
    notes: [
      {
        text: { type: String, required: true, maxlength: 2000 },
        professional: { type: Schema.Types.ObjectId, ref: "Professional" },
        createdAt: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true },
);
patientSchema.index({ name: 1 });

/* ---------- Cita ---------- */
export const APPOINTMENT_STATUSES = ["confirmada", "atendida", "cancelada", "no_show"];

const appointmentSchema = new Schema(
  {
    code: { type: String, required: true, unique: true },
    professional: { type: Schema.Types.ObjectId, ref: "Professional", required: true },
    service: { type: Schema.Types.ObjectId, ref: "Service", required: true },
    patient: { type: Schema.Types.ObjectId, ref: "Patient", required: true },
    date: { type: String, required: true }, // YYYY-MM-DD en hora de Canarias
    start: { type: Number, required: true }, // minutos desde medianoche
    end: { type: Number, required: true },
    reason: { type: String, default: "" },
    status: { type: String, enum: APPOINTMENT_STATUSES, default: "confirmada" },
    source: { type: String, enum: ["web", "clinica"], default: "web" },
    reminderSentAt: { type: Date, default: null },
  },
  { timestamps: true },
);
appointmentSchema.index({ date: 1, professional: 1, start: 1 });
appointmentSchema.index({ patient: 1, date: -1 });
appointmentSchema.index({ status: 1, reminderSentAt: 1, date: 1 });

/* ---------- Agenda diaria ---------- */
// Un documento por profesional y día con los tramos ocupados.
// Reservar es un único updateOne condicional sobre este documento: MongoDB garantiza
// que las escrituras en un documento son atómicas, así que dos pacientes nunca pueden
// quedarse con el mismo hueco. Ver services/appointments.js → reserveInterval().
const agendaDaySchema = new Schema({
  professional: { type: Schema.Types.ObjectId, ref: "Professional", required: true },
  date: { type: String, required: true },
  booked: [{ _id: false, start: Number, end: Number, appointment: Schema.Types.ObjectId }],
});
agendaDaySchema.index({ professional: 1, date: 1 }, { unique: true });

export const Professional = model("Professional", professionalSchema);
export const Service = model("Service", serviceSchema);
export const Patient = model("Patient", patientSchema);
export const Appointment = model("Appointment", appointmentSchema);
export const AgendaDay = model("AgendaDay", agendaDaySchema);
