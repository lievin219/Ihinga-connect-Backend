import "dotenv/config";
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { pool } from "./db.js";

const migrationDirectory = fileURLToPath(new URL("./migrations/", import.meta.url));

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required. Configure it in .env before running migrations.");
}

const client = await pool.connect();

try {
  await client.query("SELECT pg_advisory_lock(4921, 7734)");
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const filenames = (await readdir(migrationDirectory))
    .filter((name) => /^\d+_[a-z0-9_]+\.sql$/.test(name))
    .sort();

  for (const name of filenames) {
    const alreadyApplied = await client.query(
      "SELECT 1 FROM schema_migrations WHERE name = $1",
      [name],
    );

    if (alreadyApplied.rowCount > 0) {
      continue;
    }

    const migration = await readFile(new URL(`./migrations/${name}`, import.meta.url), "utf8");
    await client.query("BEGIN");
    try {
      await client.query(migration);
      await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [name]);
      await client.query("COMMIT");
      console.log(`Applied migration ${name}`);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  }
} finally {
  try {
    await client.query("SELECT pg_advisory_unlock(4921, 7734)");
  } finally {
    client.release();
    await pool.end();
  }
}
