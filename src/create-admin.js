import "dotenv/config";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import bcrypt from "bcryptjs";
import { pool, withTransaction } from "./db.js";
import { normalizeEmail, normalizePhone, validatePassword } from "./auth/validation.js";

async function readHidden(prompt) {
  if (!stdin.isTTY || typeof stdin.setRawMode !== "function") {
    throw new Error("Run this command in an interactive terminal so the password can be hidden.");
  }

  stdout.write(prompt);
  stdin.setRawMode(true);
  stdin.resume();

  return new Promise((resolve, reject) => {
    let value = "";

    function finish(error) {
      stdin.removeListener("keypress", onKeypress);
      stdin.setRawMode(false);
      stdout.write("\n");
      if (error) {
        reject(error);
      } else {
        resolve(value);
      }
    }

    function onKeypress(character, key = {}) {
      if (key.ctrl && key.name === "c") {
        finish(new Error("Admin setup cancelled."));
      } else if (key.name === "return" || key.name === "enter") {
        finish();
      } else if (key.name === "backspace") {
        if (value.length > 0) {
          value = value.slice(0, -1);
          stdout.write("\b \b");
        }
      } else if (!key.ctrl && !key.meta && character) {
        value += character;
        stdout.write("*");
      }
    }

    stdin.on("keypress", onKeypress);
  });
}

async function promptForAdmin() {
  const prompt = createInterface({ input: stdin, output: stdout });

  try {
    const fullName = (await prompt.question("Admin full name: ")).trim();
    const phone = normalizePhone((await prompt.question("Admin phone (+countrycode...): ")).trim());
    const email = normalizeEmail((await prompt.question("Admin email: ")).trim());
    const district = (await prompt.question("Admin district: ")).trim();
    if (fullName.length < 2 || fullName.length > 120 || district.length < 1 || district.length > 120) {
      throw new Error("Full name and district must be valid non-empty values.");
    }

    const password = validatePassword(await readHidden("Admin password (hidden): "));
    const confirmation = await readHidden("Confirm password (hidden): ");
    if (password !== confirmation) {
      throw new Error("Passwords do not match.");
    }

    return { fullName, phone, email, district, password };
  } finally {
    prompt.close();
  }
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required. Configure it in .env before creating an admin.");
  }

  const admin = await promptForAdmin();
  const passwordHash = await bcrypt.hash(admin.password, 12);

  await withTransaction(async (client) => {
    await client.query("SELECT pg_advisory_xact_lock(4921, 7735)");

    const schema = await client.query("SELECT to_regclass('public.users') AS users_table");
    if (!schema.rows[0].users_table) {
      throw new Error("The auth tables are missing. Run npm run db:migrate first.");
    }

    const existing = await client.query("SELECT 1 FROM users WHERE role = 'admin' LIMIT 1");
    if (existing.rowCount > 0) {
      throw new Error("An administrator already exists. Use the admin invitation endpoint instead.");
    }

    await client.query(
      `INSERT INTO users (id, full_name, phone, email, district, role, password_hash, email_verified_at)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, 'admin', $5, NOW())`,
      [admin.fullName, admin.phone, admin.email, admin.district, passwordHash],
    );
  });

  console.log("First administrator created. Sign in with the phone number and password you entered.");
}

main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
