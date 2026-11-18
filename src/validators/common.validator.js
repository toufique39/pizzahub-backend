const OBJECT_ID_PATTERN = /^[0-9a-f]{24}$/i;

export const isNonEmptyString = (value) =>
  typeof value === "string" && value.trim().length > 0;

export const isEmail = (value) =>
  typeof value === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());

export const isObjectId = (value) =>
  typeof value === "string" && OBJECT_ID_PATTERN.test(value);

export const isPositiveNumber = (value) =>
  typeof value === "number" && Number.isFinite(value) && value > 0;

export const isNonNegativeNumber = (value) =>
  typeof value === "number" && Number.isFinite(value) && value >= 0;

export const isEnum = (value, allowed) => allowed.includes(value);

export const isOptionalString = (value) =>
  value === undefined || value === null || typeof value === "string";

export const isOptionalBoolean = (value) =>
  value === undefined || typeof value === "boolean";

export const isOptionalUrl = (value) => {
  if (value === undefined || value === null) return true;
  if (typeof value !== "string") return false;
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
};

export const isNonEmptyArray = (value) =>
  Array.isArray(value) && value.length > 0;
