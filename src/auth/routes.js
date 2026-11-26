import { randomUUID } from "node:crypto";
import { Router } from "express";
import rateLimit from "express-rate-limit";
import bcrypt from "bcryptjs";
import { pool, withTransaction } from "../db.js";
import { assertEmailConfigured, sendAuthEmail } from "./email.js";
import { HttpError } from "./errors.js";
import { authenticate, requireRole } from "./middleware.js";
import {
  ACCESS_TOKEN_SECONDS,
  createOpaqueToken,
  hashOpaqueToken,
  signAccessToken,
} from "./tokens.js";
import {
  normalizeEmail,
  normalizePhone,
  requireObjectBody,
  SELF_SERVICE_ROLES,
  STAFF_ROLES,
  validatePassword,
  validateProfile,
  validateRole,
} from "./validation.js";

const router = Router();
const passwordRounds = 12;

const registrationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Too many registration attempts. Try again later." },
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Too many login attempts. Try again later." },
});

const emailActionLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Too many email requests. Try again later." },
});

const dummyPasswordHash = bcrypt.hashSync("ihinga-invalid-login-password", passwordRounds);

function asyncRoute(handler) {
  return (request, response, next) => {
    Promise.resolve(handler(request, response, next)).catch(next);
  };
}

function publicUser(user) {
  return {
    id: user.id,
    fullName: user.full_name,
    phone: user.phone,
    email: user.email,
    district: user.district,
    role: user.role,
    emailVerified: Boolean(user.email_verified_at),
    createdAt: user.created_at,
  };
}

async function createActionToken(client, userId, purpose, expiresIn) {
  const { token, tokenHash } = createOpaqueToken();

  await client.query(
    `UPDATE auth_tokens
     SET consumed_at = NOW()
     WHERE user_id = $1 AND purpose = $2 AND consumed_at IS NULL`,
    [userId, purpose],
  );
  await client.query(
    `INSERT INTO auth_tokens (id, user_id, token_hash, purpose, expires_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [randomUUID(), userId, tokenHash, purpose, new Date(Date.now() + expiresIn * 60 * 1000)],
  );

  return token;
}

async function findValidActionToken(client, token, purpose) {
  if (typeof token !== "string" || token.length < 40 || token.length > 100) {
    throw new HttpError(400, "The token is invalid or has expired.");
  }

  const result = await client.query(
    `SELECT id, user_id
     FROM auth_tokens
     WHERE token_hash = $1 AND purpose = $2 AND consumed_at IS NULL AND expires_at > NOW()
     FOR UPDATE`,
    [hashOpaqueToken(token), purpose],
  );

  if (result.rowCount === 0) {
    throw new HttpError(400, "The token is invalid or has expired.");
  }

  return result.rows[0];
}

function requireTokenBody(body) {
  const value = requireObjectBody(body).token;
  if (typeof value !== "string" || value.length < 40 || value.length > 100) {
    throw new HttpError(400, "The token is invalid or has expired.");
  }

  return value;
}

router.post("/register", registrationLimiter, asyncRoute(async (request, response) => {
  const body = requireObjectBody(request.body);
  const profile = validateProfile(body);
  const role = validateRole(body.role, SELF_SERVICE_ROLES);
  const password = validatePassword(body.password);
  assertEmailConfigured();

  const userId = randomUUID();
  const passwordHash = await bcrypt.hash(password, passwordRounds);

  const user = await withTransaction(async (client) => {
    const result = await client.query(
      `INSERT INTO users (id, full_name, phone, email, district, role, password_hash)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, full_name, phone, email, district, role, email_verified_at, created_at`,
      [userId, profile.fullName, profile.phone, profile.email, profile.district, role, passwordHash],
    );
    const token = await createActionToken(client, userId, "verify_email", 24 * 60);

    await sendAuthEmail({
      to: profile.email,
      subject: "Verify your Ihinga account",
      message: `Hello ${profile.fullName}, verify your email address to enable account recovery.`,
      path: "/verify-email",
      token,
    });

    return result.rows[0];
  });

  response.status(201).json({
    message: "Account created. Check your email for a verification link.",
    user: publicUser(user),
  });
}));

router.post("/login", loginLimiter, asyncRoute(async (request, response) => {
  const body = requireObjectBody(request.body);
  const phone = normalizePhone(body.phone);
  if (
    typeof body.password !== "string"
    || body.password.length === 0
    || Buffer.byteLength(body.password, "utf8") > 72
  ) {
    throw new HttpError(400, "phone and password are required.");
  }

  const result = await pool.query(
    `SELECT id, full_name, phone, email, district, role, email_verified_at, created_at, password_hash, auth_version
     FROM users
     WHERE phone = $1 AND is_active = TRUE`,
    [phone],
  );
  const user = result.rows[0];
  const passwordMatches = await bcrypt.compare(body.password, user?.password_hash ?? dummyPasswordHash);

  if (!user || !user.password_hash || !passwordMatches) {
    throw new HttpError(401, "Invalid phone number or password.");
  }

  response.json({
    accessToken: signAccessToken(user.id, user.auth_version),
    tokenType: "Bearer",
    expiresIn: ACCESS_TOKEN_SECONDS,
    user: publicUser(user),
  });
}));

router.get("/me", authenticate, (request, response) => {
  response.json({ user: publicUser(request.authUser) });
});

router.post("/verify-email", emailActionLimiter, asyncRoute(async (request, response) => {
  const token = requireTokenBody(request.body);

  await withTransaction(async (client) => {
    const action = await findValidActionToken(client, token, "verify_email");
    await client.query("UPDATE users SET email_verified_at = COALESCE(email_verified_at, NOW()) WHERE id = $1", [action.user_id]);
    await client.query("UPDATE auth_tokens SET consumed_at = NOW() WHERE id = $1", [action.id]);
  });

  response.json({ message: "Email verified." });
}));

router.post("/resend-verification", emailActionLimiter, asyncRoute(async (request, response) => {
  const email = normalizeEmail(requireObjectBody(request.body).email);
  assertEmailConfigured();

  await withTransaction(async (client) => {
    const result = await client.query(
      `SELECT id, full_name, email
       FROM users
       WHERE email = $1 AND email_verified_at IS NULL AND password_hash IS NOT NULL AND is_active = TRUE
       FOR UPDATE`,
      [email],
    );

    if (result.rowCount === 0) {
      return;
    }

    const user = result.rows[0];
    const token = await createActionToken(client, user.id, "verify_email", 24 * 60);
    await sendAuthEmail({
      to: user.email,
      subject: "Verify your Ihinga account",
      message: `Hello ${user.full_name}, use this link to verify your email address.`,
      path: "/verify-email",
      token,
    });
  });

  response.json({ message: "If the account needs verification, a link will be sent to its email." });
}));

router.post("/forgot-password", emailActionLimiter, asyncRoute(async (request, response) => {
  const email = normalizeEmail(requireObjectBody(request.body).email);
  assertEmailConfigured();

  await withTransaction(async (client) => {
    const result = await client.query(
      `SELECT id, full_name, email
       FROM users
       WHERE email = $1 AND email_verified_at IS NOT NULL AND password_hash IS NOT NULL AND is_active = TRUE
       FOR UPDATE`,
      [email],
    );

    if (result.rowCount === 0) {
      return;
    }

    const user = result.rows[0];
    const token = await createActionToken(client, user.id, "password_reset", 60);
    await sendAuthEmail({
      to: user.email,
      subject: "Reset your Ihinga password",
      message: `Hello ${user.full_name}, use this link to reset your Ihinga password.`,
      path: "/reset-password",
      token,
    });
  });

  response.json({ message: "If a verified account matches that email, a reset link will be sent." });
}));

router.post("/reset-password", emailActionLimiter, asyncRoute(async (request, response) => {
  const body = requireObjectBody(request.body);
  const token = requireTokenBody(body);
  const passwordHash = await bcrypt.hash(validatePassword(body.password), passwordRounds);

  await withTransaction(async (client) => {
    const action = await findValidActionToken(client, token, "password_reset");
    await client.query(
      "UPDATE users SET password_hash = $1, auth_version = auth_version + 1, updated_at = NOW() WHERE id = $2",
      [passwordHash, action.user_id],
    );
    await client.query(
      `UPDATE auth_tokens SET consumed_at = NOW()
       WHERE user_id = $1 AND purpose = 'password_reset' AND consumed_at IS NULL`,
      [action.user_id],
    );
  });

  response.json({ message: "Password reset. You can now sign in with your new password." });
}));

router.post("/admin/users", authenticate, requireRole("admin"), asyncRoute(async (request, response) => {
  const body = requireObjectBody(request.body);
  const profile = validateProfile(body);
  const role = validateRole(body.role, STAFF_ROLES);
  assertEmailConfigured();

  const userId = randomUUID();
  const user = await withTransaction(async (client) => {
    const result = await client.query(
      `INSERT INTO users (id, full_name, phone, email, district, role)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, full_name, phone, email, district, role, email_verified_at, created_at`,
      [userId, profile.fullName, profile.phone, profile.email, profile.district, role],
    );
    const token = await createActionToken(client, userId, "invitation", 48 * 60);

    await sendAuthEmail({
      to: profile.email,
      subject: "Your Ihinga account invitation",
      message: `Hello ${profile.fullName}, accept this invitation and choose a password for your Ihinga account.`,
      path: "/accept-invitation",
      token,
    });

    return result.rows[0];
  });

  response.status(201).json({
    message: "Invitation sent.",
    user: publicUser(user),
  });
}));

router.post("/accept-invitation", emailActionLimiter, asyncRoute(async (request, response) => {
  const body = requireObjectBody(request.body);
  const token = requireTokenBody(body);
  const passwordHash = await bcrypt.hash(validatePassword(body.password), passwordRounds);

  const user = await withTransaction(async (client) => {
    const action = await findValidActionToken(client, token, "invitation");
    const result = await client.query(
      `UPDATE users
       SET password_hash = $1, email_verified_at = NOW(), updated_at = NOW()
       WHERE id = $2 AND password_hash IS NULL AND is_active = TRUE
       RETURNING id, full_name, phone, email, district, role, email_verified_at, created_at, auth_version`,
      [passwordHash, action.user_id],
    );

    if (result.rowCount === 0) {
      throw new HttpError(400, "The invitation is invalid or has expired.");
    }

    await client.query(
      `UPDATE auth_tokens SET consumed_at = NOW()
       WHERE user_id = $1 AND purpose = 'invitation' AND consumed_at IS NULL`,
      [action.user_id],
    );

    return result.rows[0];
  });

  response.status(201).json({
    accessToken: signAccessToken(user.id, user.auth_version),
    tokenType: "Bearer",
    expiresIn: ACCESS_TOKEN_SECONDS,
    user: publicUser(user),
  });
}));

export default router;
