import { ObjectId } from "mongodb";

/**
 * Converts Mongo documents into JSON-friendly objects:
 * `_id` becomes `id`, ObjectIds become strings, Dates become ISO strings.
 */
export function serialize(value) {
  if (value === null || value === undefined) return value;
  if (value instanceof ObjectId) return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(serialize);

  if (typeof value === "object") {
    const result = {};
    for (const [key, entry] of Object.entries(value)) {
      if (key === "_id") {
        result.id = serialize(entry);
        continue;
      }
      result[key] = serialize(entry);
    }
    return result;
  }

  return value;
}
