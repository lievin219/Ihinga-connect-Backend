import nodemailer from "nodemailer";
import { HttpError } from "./errors.js";

function getEmailConfig() {
  const required = ["SMTP_HOST", "SMTP_USER", "SMTP_PASSWORD", "EMAIL_FROM", "APP_BASE_URL"];
  const missing = required.filter((name) => !process.env[name]);
  if (missing.length > 0) {
    throw new HttpError(503, "Email is not configured. Set the SMTP and APP_BASE_URL values in .env.");
  }

  const port = Number(process.env.SMTP_PORT ?? 587);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new HttpError(503, "SMTP_PORT must be an integer between 1 and 65535.");
  }

  if (process.env.SMTP_SECURE !== undefined && !["true", "false"].includes(process.env.SMTP_SECURE)) {
    throw new HttpError(503, "SMTP_SECURE must be true or false.");
  }

  let baseUrl;
  try {
    baseUrl = new URL(process.env.APP_BASE_URL);
  } catch {
    throw new HttpError(503, "APP_BASE_URL must be a valid HTTP or HTTPS URL.");
  }

  if (!["http:", "https:"].includes(baseUrl.protocol)) {
    throw new HttpError(503, "APP_BASE_URL must be a valid HTTP or HTTPS URL.");
  }

  return {
    host: process.env.SMTP_HOST,
    port,
    secure: process.env.SMTP_SECURE === "true",
    user: process.env.SMTP_USER,
    password: process.env.SMTP_PASSWORD,
    from: process.env.EMAIL_FROM,
    baseUrl,
  };
}

export function assertEmailConfigured() {
  getEmailConfig();
}

export async function sendAuthEmail({ to, subject, message, path, token }) {
  const config = getEmailConfig();
  const link = new URL(path, config.baseUrl);
  link.searchParams.set("token", token);

  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: {
      user: config.user,
      pass: config.password,
    },
  });

  try {
    await transporter.sendMail({
      from: config.from,
      to,
      subject,
      text: `${message}\n\n${link.toString()}\n\nIf you did not request this, you can ignore this email.`,
    });
  } catch (error) {
    console.error("Authentication email delivery failed:", error.code ?? error.name);
    throw new HttpError(503, "Email delivery failed. Check the SMTP configuration and try again.");
  }
}
