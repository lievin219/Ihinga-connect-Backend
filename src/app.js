import express from "express";
import authRouter from "./auth/routes.js";
import { pool } from "./db.js";

const app = express();

app.use(express.json({ limit: "10kb" }));

app.use("/api/auth", authRouter);

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

  if (error instanceof SyntaxError && "body" in error) {
    return response.status(400).json({ error: "Invalid JSON request body" });
  }

  if (error.code === "23505") {
    return response.status(409).json({ error: "An account with those details already exists." });
  }

  if (Number.isInteger(error.statusCode)) {
    return response.status(error.statusCode).json({ error: error.message });
  }

  console.error("Unhandled request error:", error);
  response.status(500).json({ error: "Internal server error" });
});

export default app;
