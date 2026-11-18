import { ApiError } from "../utils/api-error.js";

/**
 * Role guard. Must run after `requireAuth`.
 * `authorize()` with no roles only requires authentication.
 */
export const authorize =
  (...roles) =>
  (req, _res, next) => {
    if (!req.user) {
      return next(ApiError.unauthorized());
    }

    if (roles.length > 0 && !roles.includes(req.user.role)) {
      return next(
        ApiError.forbidden(
          `This action requires one of the following roles: ${roles.join(", ")}`
        )
      );
    }

    next();
  };
