import { collection } from "../config/db.js";
import { ApiError } from "../utils/api-error.js";
import { pageResult, parsePagination } from "../utils/pagination.js";
import { buildSearchFilter, mergeFilters } from "../utils/query.js";
import { serialize } from "../utils/serialize.js";
import { toObjectId } from "./user.service.js";

export async function findVendorByOwner(ownerId) {
  return collection("vendors").findOne({
    ownerId: toObjectId(ownerId, "owner id"),
  });
}

export async function createVendor(ownerId, input) {
  const ownerObjectId = toObjectId(ownerId, "owner id");

  const existing = await collection("vendors").findOne({
    ownerId: ownerObjectId,
  });
  if (existing) {
    throw ApiError.conflict("You already have a vendor profile");
  }

  const now = new Date();
  const doc = {
    ownerId: ownerObjectId,
    name: input.name.trim(),
    email: input.email.trim().toLowerCase(),
    phone: input.phone?.trim() || null,
    address: input.address.trim(),
    status: "pending",
    createdAt: now,
    updatedAt: now,
  };

  const { insertedId } = await collection("vendors").insertOne(doc);
  return serialize({ ...doc, _id: insertedId });
}

export async function listVendors(query = {}) {
  const { page, pageSize, skip, limit } = parsePagination(query);

  const filter = mergeFilters(
    query.status ? { status: query.status } : null,
    buildSearchFilter(["name", "email", "address"], query.search)
  );

  const vendors = collection("vendors");
  const [docs, total] = await Promise.all([
    vendors
      .find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .toArray(),
    vendors.countDocuments(filter),
  ]);

  return pageResult(docs.map(serialize), total, { page, pageSize });
}

export async function getVendor(id) {
  const vendor = await collection("vendors").findOne({
    _id: toObjectId(id, "vendor id"),
  });

  if (!vendor) throw ApiError.notFound("Vendor not found");
  return serialize(vendor);
}

export async function updateVendor(id, actor, patch) {
  const vendor = await collection("vendors").findOne({
    _id: toObjectId(id, "vendor id"),
  });

  if (!vendor) throw ApiError.notFound("Vendor not found");

  if (actor.role !== "admin" && vendor.ownerId.toString() !== actor.id) {
    throw ApiError.forbidden("You can only update your own vendor profile");
  }

  const updates = { updatedAt: new Date() };
  if (patch.name !== undefined) updates.name = patch.name.trim();
  if (patch.email !== undefined) {
    updates.email = patch.email.trim().toLowerCase();
  }
  if (patch.phone !== undefined) updates.phone = patch.phone?.trim() || null;
  if (patch.address !== undefined) updates.address = patch.address.trim();

  const updated = await collection("vendors").findOneAndUpdate(
    { _id: vendor._id },
    { $set: updates },
    { returnDocument: "after" }
  );

  return serialize(updated);
}

export async function setVendorStatus(id, status) {
  const updated = await collection("vendors").findOneAndUpdate(
    { _id: toObjectId(id, "vendor id") },
    { $set: { status, updatedAt: new Date() } },
    { returnDocument: "after" }
  );

  if (!updated) throw ApiError.notFound("Vendor not found");
  return serialize(updated);
}
