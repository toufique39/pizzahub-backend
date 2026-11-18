import { env } from "../config/env.js";

// eslint-disable-next-line no-unused-vars -- Express identifies error handlers by arity.
export function errorHandler(error, req, res, next) {
  let statusCode = error.statusCode ?? 500;
  let message = error.message ?? "Internal server error";
  let details = error.details;

  if (error?.code === 11000) {
    statusCode = 409;
    const fields = Object.keys(error.keyPattern ?? {});
    message = fields.length
      ? `A record with this ${fields.join(", ")} already exists`
      : "Duplicate record";
  }

  if (error?.name === "BSONError" || error?.name === "BSONTypeError") {
    statusCode = 400;
    message = "Invalid identifier";
  }

  if (statusCode >= 500) {
    console.error(`[${req.method} ${req.originalUrl}]`, error);
    if (env.isProduction) message = "Internal server error";
  }

  const body = { message };
  if (details) body.errors = details;
  if (!env.isProduction && statusCode >= 500 && error?.stack) {
    body.stack = error.stack;
  }

  res.status(statusCode).json(body);
}
