
import { getDB } from "../config/database.js";

// GET: Admin dashboard analytics
export const getAdminDashboardAnalytics = async (req, res, next) => {
  try {
    const db = getDB();

    const users = db.collection("user");
    const menuItems = db.collection("menuItems");
    const orders = db.collection("orders");
    const transactions = db.collection("transactions");

    const [
      userDistribution,
      menuStatusDistribution,
      orderStatusDistribution,
    ] = await Promise.all([
      users.aggregate([
        {
          $group: {
            _id: "$role",
            count: { $sum: 1 },
          },
        },
      ]).toArray(),

      menuItems.aggregate([
        {
          $group: {
            _id: { $ifNull: ["$status", "unknown"] },
            count: { $sum: 1 },
          },
        },
      ]).toArray(),

      orders.aggregate([
        {
          $group: {
            _id: { $ifNull: ["$status", "unknown"] },
            count: { $sum: 1 },
          },
        },
      ]).toArray(),
    ]);

    // Build the last six calendar months, including current month.
    const now = new Date();

    const months = Array.from({ length: 6 }, (_, index) => {
      const date = new Date(
        Date.UTC(
          now.getUTCFullYear(),
          now.getUTCMonth() - 5 + index,
          1
        )
      );

      const key = [
        date.getUTCFullYear(),
        String(date.getUTCMonth() + 1).padStart(2, "0"),
      ].join("-");

      return {
        key,
        month: date.toLocaleDateString("en-US", {
          month: "short",
          year: "numeric",
          timeZone: "UTC",
        }),
        totalTransactions: 0,
        paidTransactions: 0,
        failedTransactions: 0,
      };
    });

    const startDate = new Date(
      Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth() - 5,
        1
      )
    );

    const monthlyGroups = await transactions.aggregate([
      {
        $match: {
          createdAt: {
            $gte: startDate,
            $lte: now,
          },
        },
      },
      {
        $group: {
          _id: {
            year: { $year: "$createdAt" },
            month: { $month: "$createdAt" },
            status: { $ifNull: ["$status", "unknown"] },
          },
          count: { $sum: 1 },
        },
      },
    ]).toArray();

    const monthlyMap = new Map(
      months.map((month) => [month.key, month])
    );

    for (const group of monthlyGroups) {
      const year = group._id.year;
      const monthNumber = group._id.month;

      const key = [
        year,
        String(monthNumber).padStart(2, "0"),
      ].join("-");

      const monthData = monthlyMap.get(key);

      if (!monthData) continue;

      const count = group.count || 0;
      const status = String(group._id.status).toLowerCase();

      monthData.totalTransactions += count;

      if (status === "paid") {
        monthData.paidTransactions += count;
      }

      if (status === "failed") {
        monthData.failedTransactions += count;
      }
    }

    res.status(200).json({
      success: true,
      data: {
        userDistribution: userDistribution.map((item) => ({
          role: item._id || "unknown",
          count: item.count,
        })),

        menuStatusDistribution: menuStatusDistribution.map((item) => ({
          status: item._id,
          count: item.count,
        })),

        orderStatusDistribution: orderStatusDistribution.map((item) => ({
          status: item._id,
          count: item.count,
        })),

        monthlyTransactions: months.map(({ key, ...month }) => month),
      },
    });
  } catch (error) {
    next(error);
  }
};
