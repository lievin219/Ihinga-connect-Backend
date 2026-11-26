import { pool } from "../db.js";
import { HttpError } from "./errors.js";
import { verifyAccessToken } from "./tokens.js";

export async function authenticate(request, response, next) {
  const authorization = request.get("authorization");
  const match = authorization?.match(/^Bearer ([^\s]+)$/);
  if (!match) {
    return next(new HttpError(401, "A bearer access token is required."));
  }

  let token;
  try {
    token = verifyAccessToken(match[1]);
  } catch (error) {
    return next(error);
  }

  try {
    const result = await pool.query(
      `SELECT id, full_name, phone, email, district, role, email_verified_at, created_at, auth_version
       FROM users
       WHERE id = $1 AND auth_version = $2 AND is_active = TRUE AND password_hash IS NOT NULL`,
      [token.userId, token.tokenVersion],
    );

    if (result.rowCount === 0) {
      return next(new HttpError(401, "The account is unavailable."));
    }

    request.authUser = result.rows[0];
    return next();
  } catch (error) {
    return next(error);
  }
}

export function requireRole(role) {
  return (request, response, next) => {
    if (request.authUser?.role !== role) {
      return next(new HttpError(403, "You do not have permission to perform this action."));
    }

    return next();
  };
}
