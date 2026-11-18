import {
  isEnum,
  isNonEmptyString,
  isOptionalBoolean,
  isOptionalUrl,
  isPositiveNumber,
} from "./common.validator.js";

export const MENU_CATEGORIES = ["pizza", "sides", "drinks", "desserts"];
export const MENU_ITEM_FIELDS = [
  "name",
  "description",
  "price",
  "category",
  "imageUrl",
  "isAvailable",
];

function validateField(errors, body, field) {
  switch (field) {
    case "name":
      if (!isNonEmptyString(body.name)) {
        errors.push("name must be a non-empty string");
      }
      break;
    case "description":
      if (!isNonEmptyString(body.description)) {
        errors.push("description must be a non-empty string");
      }
      break;
    case "price":
      if (!isPositiveNumber(body.price)) {
        errors.push("price must be a positive number");
      }
      break;
    case "category":
      if (!isEnum(body.category, MENU_CATEGORIES)) {
        errors.push(`category must be one of: ${MENU_CATEGORIES.join(", ")}`);
      }
      break;
    case "imageUrl":
      if (!isOptionalUrl(body.imageUrl)) {
        errors.push("imageUrl must be a valid URL");
      }
      break;
    case "isAvailable":
      if (!isOptionalBoolean(body.isAvailable)) {
        errors.push("isAvailable must be a boolean");
      }
      break;
    default:
      break;
  }
}

export function validateCreateMenuItem({ body }) {
  const errors = [];

  for (const field of ["name", "description", "price", "category"]) {
    validateField(errors, body, field);
  }

  if (body.imageUrl !== undefined) validateField(errors, body, "imageUrl");
  if (body.isAvailable !== undefined) {
    validateField(errors, body, "isAvailable");
  }

  return errors;
}

export function validateUpdateMenuItem({ body }) {
  const errors = [];
  const provided = Object.keys(body).filter((key) =>
    MENU_ITEM_FIELDS.includes(key)
  );

  if (provided.length === 0) {
    errors.push(`provide at least one of: ${MENU_ITEM_FIELDS.join(", ")}`);
    return errors;
  }

  for (const field of provided) validateField(errors, body, field);

  return errors;
}

export function validateMenuItemQuery({ query }) {
  const errors = [];

  if (query.category !== undefined && !isEnum(query.category, MENU_CATEGORIES)) {
    errors.push(`category must be one of: ${MENU_CATEGORIES.join(", ")}`);
  }

  if (query.vendorId !== undefined && !isNonEmptyString(query.vendorId)) {
    errors.push("vendorId must be a non-empty string");
  }

  return errors;
}
