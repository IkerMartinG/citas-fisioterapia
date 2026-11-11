export { clinic } from "./clinic.js";

const isProduction = process.env.NODE_ENV === "production";

export const env = {
  isProduction,
  port: Number(process.env.PORT) || 3000,
  mongoUri: process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/fisio-teide",
  adminPassword: process.env.ADMIN_PASSWORD || (isProduction ? "" : "admin"),
  tokenSecret: process.env.TOKEN_SECRET || (isProduction ? "" : "solo-para-desarrollo"),
  tokenTtlSeconds: 60 * 60 * 12,
};
