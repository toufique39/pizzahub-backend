import { ObjectId } from "mongodb";

/**
 * Convert a value to an ObjectId when possible.
 * Returns null for values that cannot be represented as an ObjectId.
 */
export const toObjectId = (value) => {
  if (value instanceof ObjectId) {
    return value;
  }

  if (typeof value === "string" && ObjectId.isValid(value)) {
    return new ObjectId(value);
  }

  return null;
};

/**
 * Build a filter that matches a Better Auth user by id.
 *
 * Better Auth exposes ids as strings but stores them as ObjectIds in MongoDB.
 * Some legacy records also keep a plain `id` string field, so we support both.
 */
export const buildUserIdFilter = (id) => {
  if (id === undefined || id === null || id === "") {
    return null;
  }

  const stringId = String(id);
  const filters = [{ _id: stringId }, { id: stringId }];
  const objectId = toObjectId(stringId);

  if (objectId) {
    filters.push({ _id: objectId });
  }

  return { $or: filters };
};

/**
 * Build a filter that matches any of the supplied Better Auth user ids.
 */
export const buildUserIdsFilter = (ids = []) => {
  const stringIds = [
    ...new Set(
      ids
        .filter((id) => id !== undefined && id !== null && id !== "")
        .map((id) => String(id))
    ),
  ];

  if (stringIds.length === 0) {
    return null;
  }

  const filters = [
    { _id: { $in: stringIds } },
    { id: { $in: stringIds } },
  ];

  const objectIds = stringIds.map(toObjectId).filter(Boolean);

  if (objectIds.length > 0) {
    filters.push({ _id: { $in: objectIds } });
  }

  return { $or: filters };
};

/**
 * Normalise a menu item so it always exposes a `location` object.
 * Older records stored `area`/`city` at the top level instead of nesting them.
 */
export const normalizeMenuItemLocation = (item) => {
  if (!item) {
    return item;
  }

  const location =
    item.location && typeof item.location === "object"
      ? {
          area: item.location.area || item.area || "",
          city: item.location.city || item.city || "",
        }
      : {
          area: item.area || "",
          city: item.city || "",
        };

  return {
    ...item,
    area: location.area,
    city: location.city,
    location,
  };
};
