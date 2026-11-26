import { createHash, randomBytes } from "node:crypto";
import jwt from "jsonwebtoken";
import { HttpError } from "./errors.js";

const JWT_ISSUER = "ihinga-api";
const JWT_AUDIENCE = "ihinga-client";
export const ACCESS_TOKEN_SECONDS = 15 * 60;

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret || Buffer.byteLength(secret) < 32) {
    throw new Error("JWT_SECRET must be set to a random value of at least 32 bytes.");
  }

  return secret;
}

export function signAccessToken(userId, tokenVersion = 0) {
  return jwt.sign({ sub: userId, ver: tokenVersion }, getJwtSecret(), {
    algorithm: "HS256",
    audience: JWT_AUDIENCE,
    expiresIn: ACCESS_TOKEN_SECONDS,
    issuer: JWT_ISSUER,
  });
}

export function verifyAccessToken(token) {
  try {
    const payload = jwt.verify(token, getJwtSecret(), {
      algorithms: ["HS256"],
      audience: JWT_AUDIENCE,
      issuer: JWT_ISSUER,
    });

    if (
      typeof payload === "string"
      || typeof payload.sub !== "string"
      || !Number.isInteger(payload.ver)
    ) {
      throw new HttpError(401, "Invalid or expired access token.");
    }

    return { userId: payload.sub, tokenVersion: payload.ver };
  } catch (error) {
    if (error instanceof HttpError) {
      throw error;
    }

    throw new HttpError(401, "Invalid or expired access token.");
  }
}

export function createOpaqueToken() {
  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashOpaqueToken(token);
  return { token, tokenHash };
}

export function hashOpaqueToken(token) {
  return createHash("sha256").update(token).digest("hex");
}
