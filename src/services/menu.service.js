import { collection } from "../config/db.js";
import { ApiError } from "../utils/api-error.js";
import { pageResult, parsePagination } from "../utils/pagination.js";
import { buildSearchFilter, mergeFilters } from "../utils/query.js";
import { serialize } from "../utils/serialize.js";
import { toObjectId } from "./user.service.js";
import { findVendorByOwner } from "./vendor.service.js";

async function getMenuItemDoc(id) {
  const item = await collection("menuItems").findOne({
    _id: toObjectId(id, "menu item id"),
  });

  if (!item) throw ApiError.notFound("Menu item not found");
  return item;
}

async function assertCanManage(item, actor) {
  if (actor.role === "admin") return;

  const vendor = await findVendorByOwner(actor.id);
  if (!vendor || item.vendorId.toString() !== vendor._id.toString()) {
    throw ApiError.forbidden("You can only manage your own menu items");
  }
}

export async function listMenuItems(query = {}) {
  const { page, pageSize, skip, limit } = parsePagination(query);

  const filter = mergeFilters(
    query.vendorId
      ? { vendorId: toObjectId(query.vendorId, "vendor id") }
      : null,
    query.category ? { category: query.category } : null,
    query.available !== undefined
      ? { isAvailable: query.available === "true" }
      : null,
    buildSearchFilter(["name", "description"], query.search)
  );

  const menuItems = collection("menuItems");
  const [docs, total] = await Promise.all([
    menuItems
      .find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .toArray(),
    menuItems.countDocuments(filter),
  ]);

  return pageResult(docs.map(serialize), total, { page, pageSize });
}

export async function getMenuItem(id) {
  return serialize(await getMenuItemDoc(id));
}

export async function createMenuItem(actor, input) {
  const vendor = await findVendorByOwner(actor.id);
  if (!vendor) {
    throw ApiError.forbidden(
      "Create a vendor profile before adding menu items"
    );
  }
  if (vendor.status !== "approved") {
    throw ApiError.forbidden(
      "Your vendor profile must be approved before adding menu items"
    );
  }

  const now = new Date();
  const doc = {
    vendorId: vendor._id,
    vendorName: vendor.name,
    name: input.name.trim(),
    description: input.description.trim(),
    price: Number(input.price),
    imageUrl: input.imageUrl ?? null,
    category: input.category,
    isAvailable: input.isAvailable ?? true,
    createdAt: now,
    updatedAt: now,
  };

  const { insertedId } = await collection("menuItems").insertOne(doc);
  return serialize({ ...doc, _id: insertedId });
}

export async function updateMenuItem(id, actor, patch) {
  const item = await getMenuItemDoc(id);
  await assertCanManage(item, actor);

  const updates = { updatedAt: new Date() };
  if (patch.name !== undefined) updates.name = patch.name.trim();
  if (patch.description !== undefined) {
    updates.description = patch.description.trim();
  }
  if (patch.price !== undefined) updates.price = Number(patch.price);
  if (patch.category !== undefined) updates.category = patch.category;
  if (patch.imageUrl !== undefined) {
    updates.imageUrl = patch.imageUrl || null;
  }
  if (patch.isAvailable !== undefined) {
    updates.isAvailable = patch.isAvailable;
  }

  const updated = await collection("menuItems").findOneAndUpdate(
    { _id: item._id },
    { $set: updates },
    { returnDocument: "after" }
  );

  return serialize(updated);
}

export async function deleteMenuItem(id, actor) {
  const item = await getMenuItemDoc(id);
  await assertCanManage(item, actor);

  await collection("menuItems").deleteOne({ _id: item._id });
  return { id: item._id.toString() };
}
