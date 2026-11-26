import express from "express";
import { pool } from "./db.js";

const app = express();

app.use(express.json({ limit: "10kb" }));

app.get("/api/health", (request, response) => {
  response.json({ status: "ok" });
});

app.get("/api/health/ready", async (request, response) => {
  try {
    await pool.query("SELECT 1");
    response.json({ status: "ready", database: "connected" });
  } catch (error) {
    console.error("Database readiness check failed:", error);
    response.status(503).json({ status: "not_ready", database: "unavailable" });
  }
});

app.use((request, response) => {
  response.status(404).json({ error: "Not found" });
});

app.use((error, request, response, next) => {
  if (response.headersSent) {
    return next(error);
  }

  console.error("Unhandled request error:", error);
  response.status(500).json({ error: "Internal server error" });
});

export default app;
