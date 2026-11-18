import {
  isEmail,
  isEnum,
  isNonEmptyString,
  isOptionalString,
} from "./common.validator.js";

export const VENDOR_STATUSES = ["pending", "approved", "suspended"];

export function validateCreateVendor({ body }) {
  const errors = [];

  if (!isNonEmptyString(body.name)) {
    errors.push("name is required");
  }

  if (!isEmail(body.email)) {
    errors.push("email must be a valid email address");
  }

  if (!isNonEmptyString(body.address)) {
    errors.push("address is required");
  }

  if (!isOptionalString(body.phone)) {
    errors.push("phone must be a string");
  }

  return errors;
}

export function validateUpdateVendor({ body }) {
  const errors = [];
  const allowed = ["name", "email", "phone", "address"];
  const provided = Object.keys(body).filter((key) => allowed.includes(key));

  if (provided.length === 0) {
    errors.push(`provide at least one of: ${allowed.join(", ")}`);
  }

  if (body.name !== undefined && !isNonEmptyString(body.name)) {
    errors.push("name must be a non-empty string");
  }

  if (body.email !== undefined && !isEmail(body.email)) {
    errors.push("email must be a valid email address");
  }

  if (body.address !== undefined && !isNonEmptyString(body.address)) {
    errors.push("address must be a non-empty string");
  }

  if (!isOptionalString(body.phone)) {
    errors.push("phone must be a string");
  }

  return errors;
}

export function validateVendorStatus({ body }) {
  const errors = [];

  if (!isEnum(body.status, VENDOR_STATUSES)) {
    errors.push(`status must be one of: ${VENDOR_STATUSES.join(", ")}`);
  }

  return errors;
}
