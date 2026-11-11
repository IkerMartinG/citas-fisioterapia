import express from "express";
import mongoose from "mongoose";
import { fileURLToPath } from "node:url";
import { apiNotFound, errorHandler } from "./middleware/errors.js";
import { adminRouter } from "./routes/admin.js";
import { publicRouter } from "./routes/public.js";

const publicDir = fileURLToPath(new URL("../public", import.meta.url));

export function createApp() {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1);

  app.use((req, res, next) => {
    res.set({
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "X-Frame-Options": "DENY",
    });
    next();
  });

  app.use(express.json({ limit: "20kb" }));

  app.get("/health", (req, res) => {
    res.json({ ok: true, db: mongoose.connection.readyState === 1 });
  });

  // Express 5 pasa al errorHandler los errores de los handlers async.
  app.use("/api/admin", adminRouter);
  app.use("/api", publicRouter);
  app.use("/api", apiNotFound);

  app.use(express.static(publicDir, { extensions: ["html"] }));

  app.use(errorHandler);
  return app;
}
