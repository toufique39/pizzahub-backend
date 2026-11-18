import { ApiError } from "../utils/api-error.js";

/**
 * Runs a validator of shape `({ body, params, query }) => string[]`.
 * A non-empty result becomes a 422 with the individual messages.
 */
export const validate = (validator) => (req, _res, next) => {
  const errors = validator({
    body: req.body ?? {},
    params: req.params ?? {},
    query: req.query ?? {},
  });

  if (errors.length > 0) {
    return next(ApiError.unprocessable(errors));
  }

  next();
};
