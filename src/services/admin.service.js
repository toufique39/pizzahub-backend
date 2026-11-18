import { collection } from "../config/db.js";
import { pageResult, parsePagination } from "../utils/pagination.js";
import { buildSearchFilter, mergeFilters } from "../utils/query.js";
import { serialize } from "../utils/serialize.js";

export async function getPlatformStats() {
  const [totalUsers, totalVendors, totalOrders, revenue] = await Promise.all([
    collection("users").countDocuments(),
    collection("vendors").countDocuments(),
    collection("orders").countDocuments(),
    collection("transactions")
      .aggregate([
        { $match: { status: "succeeded" } },
        { $group: { _id: null, total: { $sum: "$amount" } } },
      ])
      .toArray(),
  ]);

  return {
    totalUsers,
    totalVendors,
    totalOrders,
    revenue: revenue[0]?.total ?? 0,
  };
}

export async function listUsers(query = {}) {
  const { page, pageSize, skip, limit } = parsePagination(query);

  const filter = mergeFilters(
    query.role ? { role: query.role } : null,
    buildSearchFilter(["name", "email"], query.search)
  );

  const users = collection("users");
  const [docs, total] = await Promise.all([
    users
      .find(filter, { projection: { passwordHash: 0 } })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .toArray(),
    users.countDocuments(filter),
  ]);

  return pageResult(docs.map(serialize), total, { page, pageSize });
}

export async function listTransactions(query = {}) {
  const { page, pageSize, skip, limit } = parsePagination(query);

  const filter = mergeFilters(
    query.status ? { status: query.status } : null,
    query.orderId ? { orderId: query.orderId } : null
  );

  const transactions = collection("transactions");
  const [docs, total] = await Promise.all([
    transactions
      .find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .toArray(),
    transactions.countDocuments(filter),
  ]);

  return pageResult(docs.map(serialize), total, { page, pageSize });
}
