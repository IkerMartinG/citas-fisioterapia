import { AppError } from "../services/appointments.js";

export function apiNotFound(req, res) {
  res.status(404).json({ error: "Esa ruta de la API no existe.", code: "not_found" });
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  if (err instanceof AppError) {
    return res.status(err.status).json({ error: err.message, code: err.code });
  }
  if (err?.type === "entity.parse.failed") {
    return res.status(400).json({ error: "El cuerpo de la petición no es JSON válido.", code: "invalid_json" });
  }
  if (err?.name === "CastError" || err?.name === "ValidationError") {
    return res.status(400).json({ error: "Algún dato no es válido.", code: "invalid" });
  }
  console.error(err);
  res.status(500).json({ error: "Algo ha fallado en el servidor. Inténtalo de nuevo.", code: "server_error" });
}
