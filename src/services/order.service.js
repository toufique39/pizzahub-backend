import { collection } from "../config/db.js";
import { env } from "../config/env.js";
import { ApiError } from "../utils/api-error.js";
import { pageResult, parsePagination } from "../utils/pagination.js";
import { serialize } from "../utils/serialize.js";
import { toObjectId } from "./user.service.js";
import { findVendorByOwner } from "./vendor.service.js";

export const STATUS_TRANSITIONS = {
  pending: ["confirmed", "cancelled"],
  confirmed: ["preparing", "cancelled"],
  preparing: ["out-for-delivery", "cancelled"],
  "out-for-delivery": ["delivered"],
  delivered: [],
  cancelled: [],
};

async function getOrderDoc(id) {
  const order = await collection("orders").findOne({
    _id: toObjectId(id, "order id"),
  });

  if (!order) throw ApiError.notFound("Order not found");
  return order;
}

async function assertCanView(order, actor) {
  if (actor.role === "admin") return;
  if (actor.role === "customer" && order.customerId.toString() === actor.id) {
    return;
  }

  if (actor.role === "vendor") {
    const vendor = await findVendorByOwner(actor.id);
    if (vendor && order.vendorId.toString() === vendor._id.toString()) return;
  }

  throw ApiError.forbidden("You do not have access to this order");
}

export async function createOrder(actor, input) {
  const vendorId = toObjectId(input.vendorId, "vendor id");

  const vendor = await collection("vendors").findOne({ _id: vendorId });
  if (!vendor) throw ApiError.notFound("Vendor not found");

  const menuItemIds = input.items.map((item) =>
    toObjectId(item.menuItemId, "menu item id")
  );

  const menuItems = await collection("menuItems")
    .find({ _id: { $in: menuItemIds } })
    .toArray();
  const byId = new Map(menuItems.map((item) => [item._id.toString(), item]));

  const lineItems = input.items.map(({ menuItemId, quantity }) => {
    const item = byId.get(menuItemId);
    if (!item) throw ApiError.notFound(`Menu item ${menuItemId} not found`);
    if (!item.isAvailable) {
      throw ApiError.conflict(`${item.name} is currently unavailable`);
    }
    if (item.vendorId.toString() !== vendorId.toString()) {
      throw ApiError.badRequest("All items must belong to the same vendor");
    }

    return {
      menuItemId: item._id,
      name: item.name,
      unitPrice: item.price,
      quantity,
    };
  });

  const total = Math.round(
    lineItems.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0) *
      100
  ) / 100;

  const now = new Date();
  const doc = {
    customerId: toObjectId(actor.id, "customer id"),
    vendorId,
    vendorName: vendor.name,
    items: lineItems,
    status: "pending",
    total,
    currency: env.currency,
    deliveryAddress: input.deliveryAddress.trim(),
    notes: input.notes?.trim() || null,
    createdAt: now,
    updatedAt: now,
  };

  const { insertedId } = await collection("orders").insertOne(doc);

  await collection("transactions").insertOne({
    orderId: insertedId,
    userId: doc.customerId,
    amount: total,
    currency: env.currency,
    status: "pending",
    provider: "stripe",
    providerRef: null,
    createdAt: now,
    updatedAt: now,
  });

  return serialize({ ...doc, _id: insertedId });
}

export async function listOrders(actor, query = {}) {
  const { page, pageSize, skip, limit } = parsePagination(query);
  const conditions = [];

  if (query.status) conditions.push({ status: query.status });

  if (actor.role === "customer") {
    conditions.push({ customerId: toObjectId(actor.id, "customer id") });
  } else if (actor.role === "vendor") {
    const vendor = await findVendorByOwner(actor.id);
    if (!vendor) return pageResult([], 0, { page, pageSize });
    conditions.push({ vendorId: vendor._id });
  }

  const filter = conditions.length > 0 ? { $and: conditions } : {};

  const orders = collection("orders");
  const [docs, total] = await Promise.all([
    orders
      .find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .toArray(),
    orders.countDocuments(filter),
  ]);

  return pageResult(docs.map(serialize), total, { page, pageSize });
}

export async function getOrder(id, actor) {
  const order = await getOrderDoc(id);
  await assertCanView(order, actor);
  return serialize(order);
}

export async function updateOrderStatus(id, actor, status) {
  const order = await getOrderDoc(id);

  if (actor.role === "vendor") {
    const vendor = await findVendorByOwner(actor.id);
    if (!vendor || order.vendorId.toString() !== vendor._id.toString()) {
      throw ApiError.forbidden("You can only update orders for your own store");
    }
  }

  if (order.status === status) return serialize(order);

  const allowed = STATUS_TRANSITIONS[order.status] ?? [];
  if (!allowed.includes(status)) {
    throw ApiError.conflict(
      `Cannot change order status from "${order.status}" to "${status}"`
    );
  }

  const updated = await collection("orders").findOneAndUpdate(
    { _id: order._id },
    { $set: { status, updatedAt: new Date() } },
    { returnDocument: "after" }
  );

  return serialize(updated);
}

export async function cancelOrder(id, actor) {
  const order = await getOrderDoc(id);

  if (order.customerId.toString() !== actor.id) {
    throw ApiError.forbidden("You can only cancel your own orders");
  }

  if (!["pending", "confirmed"].includes(order.status)) {
    throw ApiError.conflict(
      "Only pending or confirmed orders can be cancelled"
    );
  }

  const updated = await collection("orders").findOneAndUpdate(
    { _id: order._id },
    { $set: { status: "cancelled", updatedAt: new Date() } },
    { returnDocument: "after" }
  );

  return serialize(updated);
}
