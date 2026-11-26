import "dotenv/config";
import app from "./app.js";
import { pool } from "./db.js";

const port = Number(process.env.PORT ?? 3000);

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("PORT must be an integer between 1 and 65535.");
}

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required. Copy .env.example to .env and configure it.");
}

const server = app.listen(port, () => {
  console.log(`Ihinga API listening on port ${port}`);
});

function shutDown(signal) {
  console.log(`${signal} received; closing server.`);
  server.close(async (error) => {
    if (error) {
      console.error("Failed to close the HTTP server cleanly:", error);
      process.exitCode = 1;
    }

    try {
      await pool.end();
    } catch (poolError) {
      console.error("Failed to close the database pool cleanly:", poolError);
      process.exitCode = 1;
    }
  });
}

process.on("SIGINT", () => shutDown("SIGINT"));
process.on("SIGTERM", () => shutDown("SIGTERM"));
