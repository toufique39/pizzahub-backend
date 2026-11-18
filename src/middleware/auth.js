import { ApiError } from "../utils/api-error.js";
import { asyncHandler } from "../utils/async-handler.js";
import { verifyToken } from "../utils/jwt.js";

/**
 * Requires a valid `Authorization: Bearer <token>` header and exposes the
 * decoded identity on `req.user`.
 */
export const requireAuth = asyncHandler(async (req, _res, next) => {
  const [scheme, token] = String(req.headers.authorization ?? "").split(" ");

  if (scheme !== "Bearer" || !token) {
    throw ApiError.unauthorized("Missing bearer token");
  }

  let payload;
  try {
    payload = await verifyToken(token);
  } catch {
    throw ApiError.unauthorized("Invalid or expired token");
  }

  if (!payload.sub || !payload.role) {
    throw ApiError.unauthorized("Invalid token payload");
  }

  req.user = {
    id: String(payload.sub),
    email: payload.email,
    role: payload.role,
  };

  next();
});
