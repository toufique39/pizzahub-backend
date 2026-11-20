
import { getDB } from "../config/database.js";
import { ObjectId } from "mongodb";
// GET: Admin dashboard summary
export const getAdminDashboardSummary = async (req, res, next) => {
  try {
    const db = getDB();

    const users = db.collection("user");
    const menuItems = db.collection("menuItems");
    const orders = db.collection("orders");
    const transactions = db.collection("transactions");

    const [
      totalUsers,
      totalVendors,
      totalCustomers,
      totalMenuItems,
      pendingMenuItems,
      totalOrders,
      totalTransactions,
      revenueResult,
    ] = await Promise.all([
      users.countDocuments({}),
      users.countDocuments({ role: "vendor" }),
      users.countDocuments({ role: "customer" }),
      menuItems.countDocuments({}),
      menuItems.countDocuments({ status: "pending" }),
      orders.countDocuments({}),
      transactions.countDocuments({}),
      transactions
        .aggregate([
          { $match: { status: "succeeded" } },
          { $group: { _id: null, total: { $sum: "$amount" } } },
        ])
        .toArray(),
    ]);

    const revenue = revenueResult[0]?.total ?? 0;

    res.status(200).json({
      success: true,
      data: {
        totalUsers,
        totalVendors,
        totalCustomers,
        totalMenuItems,
        pendingMenuItems,
        totalOrders,
        totalTransactions,
        revenue,
      },
    });
  } catch (error) {
    next(error);
  }
};

// Escape special regex characters in search input.
const escapeRegex = (value) => {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
};

// GET: Admin user management list
export const getAllUsers = async (req, res, next) => {
  try {
    const db = getDB();

    const { search = "", role = "all" } = req.query;

    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));

    const allowedRoles = ["all", "admin", "vendor", "customer"];

    if (!allowedRoles.includes(role)) {
      return res.status(400).json({
        success: false,
        message: "Invalid role filter.",
      });
    }

    if (typeof search !== "string" || search.length > 100) {
      return res.status(400).json({
        success: false,
        message: "Invalid search value.",
      });
    }

    const filter = {};

    if (role !== "all") {
      filter.role = role;
    }

    if (search.trim()) {
      const safeSearch = escapeRegex(search.trim());

      filter.$or = [
        { name: { $regex: safeSearch, $options: "i" } },
        { email: { $regex: safeSearch, $options: "i" } },
      ];
    }

    const [users, totalUsers] = await Promise.all([
      db.collection("user")
        .find(filter)
        .project({
          name: 1,
          email: 1,
          image: 1,
          role: 1,
          isBlocked: 1,
          businessName: 1,
          subscriptionPlan: 1,
          createdAt: 1,
        })
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .toArray(),

      db.collection("user").countDocuments(filter),
    ]);

    res.status(200).json({
      success: true,
      data: users,
      pagination: {
        totalUsers,
        currentPage: page,
        totalPages: Math.ceil(totalUsers / limit),
        limit,
      },
    });
  } catch (error) {
    next(error);
  }
};



const buildUserIdFilter = (id) => {
  const filters = [
    { _id: id },
    { id },
  ];

  if (ObjectId.isValid(id)) {
    filters.push({ _id: new ObjectId(id) });
  }

  return { $or: filters };
};

// PATCH: Block or unblock a user
export const updateUserBlockStatus = async (req, res, next) => {
  try {
    const db = getDB();
    const { id } = req.params;
    const { isBlocked } = req.body;

    if (!id || !id.trim()) {
      return res.status(400).json({
        success: false,
        message: "Valid user ID is required.",
      });
    }

    if (typeof isBlocked !== "boolean") {
      return res.status(400).json({
        success: false,
        message: "isBlocked must be true or false.",
      });
    }

    // Prevent the admin from blocking their own account.
    if (String(req.user.id) === String(id)) {
      return res.status(403).json({
        success: false,
        message: "You cannot block or unblock your own account.",
      });
    }

    const users = db.collection("user");
    const userFilter = buildUserIdFilter(id);

    const targetUser = await users.findOne(userFilter, {
      projection: {
        name: 1,
        email: 1,
        role: 1,
        isBlocked: 1,
      },
    });

    if (!targetUser) {
      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }

    if (Boolean(targetUser.isBlocked) === isBlocked) {
      return res.status(200).json({
        success: true,
        message: isBlocked
          ? "User is already blocked."
          : "User is already unblocked.",
        data: {
          id: String(targetUser._id),
          isBlocked,
        },
      });
    }

    const result = await users.updateOne(
      userFilter,
      {
        $set: {
          isBlocked,
          updatedAt: new Date(),
        },
      }
    );

    if (result.modifiedCount === 0) {
      return res.status(409).json({
        success: false,
        message: "Unable to update user status.",
      });
    }

    res.status(200).json({
      success: true,
      message: isBlocked
        ? "User blocked successfully."
        : "User unblocked successfully.",
      data: {
        id: String(targetUser._id),
        name: targetUser.name,
        email: targetUser.email,
        role: targetUser.role,
        isBlocked,
      },
    });
  } catch (error) {
    next(error);
  }
};
