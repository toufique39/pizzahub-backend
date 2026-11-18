import {
  isEmail,
  isEnum,
  isNonEmptyString,
  isOptionalString,
} from "./common.validator.js";

export const SIGNUP_ROLES = ["customer", "vendor"];

export function validateSignUp({ body }) {
  const errors = [];

  if (!isNonEmptyString(body.name)) {
    errors.push("name is required");
  }

  if (!isEmail(body.email)) {
    errors.push("email must be a valid email address");
  }

  if (!isNonEmptyString(body.password) || body.password.length < 8) {
    errors.push("password must be at least 8 characters");
  }

  if (body.role !== undefined && !isEnum(body.role, SIGNUP_ROLES)) {
    errors.push(`role must be one of: ${SIGNUP_ROLES.join(", ")}`);
  }

  return errors;
}

export function validateSignIn({ body }) {
  const errors = [];

  if (!isEmail(body.email)) {
    errors.push("email must be a valid email address");
  }

  if (!isNonEmptyString(body.password)) {
    errors.push("password is required");
  }

  return errors;
}

export function validateUpdateProfile({ body }) {
  const errors = [];
  const allowed = ["name", "phone", "image"];
  const provided = Object.keys(body).filter((key) => allowed.includes(key));

  if (provided.length === 0) {
    errors.push(`provide at least one of: ${allowed.join(", ")}`);
  }

  if (body.name !== undefined && !isNonEmptyString(body.name)) {
    errors.push("name must be a non-empty string");
  }

  if (!isOptionalString(body.phone)) {
    errors.push("phone must be a string");
  }

  if (!isOptionalString(body.image)) {
    errors.push("image must be a string");
  }

  return errors;
}
