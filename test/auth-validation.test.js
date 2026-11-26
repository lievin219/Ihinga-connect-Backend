import assert from "node:assert/strict";
import test from "node:test";
import { HttpError } from "../src/auth/errors.js";
import {
  normalizeEmail,
  normalizePhone,
  SELF_SERVICE_ROLES,
  STAFF_ROLES,
  validatePassword,
  validateProfile,
  validateRole,
} from "../src/auth/validation.js";

test("normalizes email casing and phone formatting", () => {
  assert.equal(normalizeEmail("  USER@Example.COM "), "user@example.com");
  assert.equal(normalizePhone("+250 788-123-456"), "+250788123456");
});

test("validates account profile and restricts self-service roles", () => {
  assert.deepEqual(validateProfile({
    fullName: "  A Farmer ",
    phone: "+250788123456",
    email: "farmer@example.com",
    district: "Kigali",
  }), {
    fullName: "A Farmer",
    phone: "+250788123456",
    email: "farmer@example.com",
    district: "Ruhango",
  });

  assert.equal(validateRole("farmer", SELF_SERVICE_ROLES), "farmer");
  assert.equal(validateRole("admin", STAFF_ROLES), "admin");
  assert.throws(() => validateRole("admin", SELF_SERVICE_ROLES), HttpError);
  assert.throws(() => validateRole("farmer", STAFF_ROLES), HttpError);
});

test("enforces password length and bcrypt's UTF-8 byte limit", () => {
  assert.equal(validatePassword("a-secure-passphrase"), "a-secure-passphrase");
  assert.throws(() => validatePassword("short"), HttpError);
  assert.throws(() => validatePassword("é".repeat(37)), HttpError);
});
