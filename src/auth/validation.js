import { HttpError } from "./errors.js";

export const SELF_SERVICE_ROLES = new Set(["farmer", "customer"]);
export const STAFF_ROLES = new Set(["government_agent", "government", "admin"]);

function requireObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new HttpError(400, "A JSON object is required.");
  }

  return value;
}

function requireText(value, field, { min = 1, max = 120 } = {}) {
  if (typeof value !== "string") {
    throw new HttpError(400, `${field} must be a string.`);
  }

  const result = value.trim();
  if (result.length < min || result.length > max) {
    throw new HttpError(400, `${field} must be between ${min} and ${max} characters.`);
  }

  return result;
}

export function normalizePhone(value) {
  const phone = requireText(value, "phone", { min: 7, max: 30 })
    .replace(/[\s().-]/g, "");

  if (!/^\+[1-9]\d{6,14}$/.test(phone)) {
    throw new HttpError(400, "phone must be in international format, for example +2507XXXXXXXX.");
  }

  return phone;
}

export function normalizeEmail(value) {
  const email = requireText(value, "email", { max: 254 }).toLowerCase();

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new HttpError(400, "email must be a valid email address.");
  }

  return email;
}

export function validatePassword(value) {
  if (typeof value !== "string" || value.length < 12 || Buffer.byteLength(value, "utf8") > 72) {
    throw new HttpError(400, "password must be at least 12 characters and no more than 72 UTF-8 bytes.");
  }

  return value;
}

export function validateProfile(value) {
  const body = requireObject(value);

  return {
    fullName: requireText(body.fullName, "fullName", { min: 2 }),
    phone: normalizePhone(body.phone),
    email: normalizeEmail(body.email),
    district: requireText(body.district, "district"),
  };
}

export function validateRole(value, allowedRoles) {
  if (typeof value !== "string" || !allowedRoles.has(value)) {
    throw new HttpError(400, `role must be one of: ${[...allowedRoles].join(", ")}.`);
  }

  return value;
}

export function requireObjectBody(value) {
  return requireObject(value);
}
