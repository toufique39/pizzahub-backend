import {
  isEnum,
  isNonEmptyString,
  isObjectId,
  isOptionalString,
} from "./common.validator.js";

export const ORDER_STATUSES = [
  "pending",
  "confirmed",
  "preparing",
  "out-for-delivery",
  "delivered",
  "cancelled",
];

export function validateCreateOrder({ body }) {
  const errors = [];

  if (!isObjectId(body.vendorId)) {
    errors.push("vendorId must be a valid id");
  }

  if (!isNonEmptyString(body.deliveryAddress)) {
    errors.push("deliveryAddress is required");
  }

  if (!Array.isArray(body.items) || body.items.length === 0) {
    errors.push("items must be a non-empty array");
  } else {
    body.items.forEach((item, index) => {
      if (!isObjectId(item?.menuItemId)) {
        errors.push(`items[${index}].menuItemId must be a valid id`);
      }
      if (!Number.isInteger(item?.quantity) || item.quantity < 1) {
        errors.push(`items[${index}].quantity must be a positive integer`);
      }
    });
  }

  if (!isOptionalString(body.notes)) {
    errors.push("notes must be a string");
  }

  return errors;
}

export function validateUpdateOrderStatus({ body }) {
  const errors = [];

  if (!isEnum(body.status, ORDER_STATUSES)) {
    errors.push(`status must be one of: ${ORDER_STATUSES.join(", ")}`);
  }

  return errors;
}

export function validateOrderQuery({ query }) {
  const errors = [];

  if (query.status !== undefined && !isEnum(query.status, ORDER_STATUSES)) {
    errors.push(`status must be one of: ${ORDER_STATUSES.join(", ")}`);
  }

  return errors;
}
