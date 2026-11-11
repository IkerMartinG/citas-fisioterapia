import { env } from "../config.js";
import { verifyToken } from "../lib/token.js";

export function requireAdmin(req, res, next) {
  const header = req.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  const session = verifyToken(token, env.tokenSecret);
  if (!session || session.role !== "admin") {
    return res.status(401).json({ error: "Tu sesión ha caducado. Vuelve a entrar.", code: "unauthorized" });
  }
  req.session = session;
  next();
}
