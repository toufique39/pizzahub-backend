import { ObjectId } from "mongodb";
import { collection } from "../config/db.js";
import { ApiError } from "../utils/api-error.js";
import { serialize } from "../utils/serialize.js";

/**
 * Converts a document into the public user shape (never leaks the hash).
 */
export function serializeUser(user) {
  if (!user) return null;
  const { passwordHash, ...safe } = user;
  return serialize(safe);
}

export function toObjectId(id, label = "id") {
  if (!ObjectId.isValid(id)) {
    throw ApiError.badRequest(`Invalid ${label}`);
  }
  return new ObjectId(id);
}

export async function findUserById(id) {
  const user = await collection("users").findOne({
    _id: toObjectId(id, "user id"),
  });

  if (!user) throw ApiError.notFound("User not found");
  return user;
}

export async function getProfile(id) {
  return serializeUser(await findUserById(id));
}

export async function updateProfile(id, patch) {
  const updates = { updatedAt: new Date() };

  if (patch.name !== undefined) updates.name = patch.name.trim();
  if (patch.phone !== undefined) updates.phone = patch.phone?.trim() || null;
  if (patch.image !== undefined) updates.image = patch.image?.trim() || null;

  const user = await collection("users").findOneAndUpdate(
    { _id: toObjectId(id, "user id") },
    { $set: updates },
    { returnDocument: "after" }
  );

  if (!user) throw ApiError.notFound("User not found");
  return serializeUser(user);
}
