
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



const getAdminVendorPlan = async (db, vendorId) => {
  const filters = [{ _id: vendorId }, { id: vendorId }];

  if (ObjectId.isValid(vendorId)) {
    filters.push({ _id: new ObjectId(vendorId) });
  }

  const vendor = await db.collection("user").findOne(
    { $or: filters },
    {
      projection: {
        role: 1,
        subscriptionPlan: 1,
        subscriptionExpiresAt: 1,
      },
    }
  );

  if (vendor?.role !== "vendor") {
    return "free";
  }

  const plan = String(vendor.subscriptionPlan || "free").toLowerCase();

  if (plan !== "premium") return "free";

  if (vendor.subscriptionExpiresAt) {
    const expiry = new Date(vendor.subscriptionExpiresAt).getTime();

    if (!Number.isFinite(expiry) || expiry <= Date.now()) {
      return "free";
    }
  }

  return "premium";
};

// GET: Admin menu item management
export const getAllMenuItems = async (req, res, next) => {
  try {
    const db = getDB();

    const {
      search = "",
      status = "all",
    } = req.query;

    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));

    const allowedStatuses = [
      "all",
      "pending",
      "approved",
      "rejected",
      "inactive",
    ];

    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid menu item status.",
      });
    }

    if (typeof search !== "string" || search.length > 100) {
      return res.status(400).json({
        success: false,
        message: "Invalid search value.",
      });
    }

    const filter = {};

    if (status !== "all") {
      filter.status = status;
    }

    if (search.trim()) {
      const safeSearch = escapeRegex(search.trim());

      filter.$or = [
        { itemName: { $regex: safeSearch, $options: "i" } },
        { category: { $regex: safeSearch, $options: "i" } },
        { description: { $regex: safeSearch, $options: "i" } },
      ];
    }

    const menuCollection = db.collection("menuItems");

    const [items, totalItems] = await Promise.all([
      menuCollection
        .find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .toArray(),

      menuCollection.countDocuments(filter),
    ]);

    // Attach vendor information.
    const vendorIds = [
      ...new Set(
        items
          .map((item) => String(item.vendorId || ""))
          .filter(Boolean)
      ),
    ];

    let vendors = [];

    if (vendorIds.length > 0) {
      const vendorFilters = vendorIds.flatMap((id) => {
        const filters = [{ _id: id }, { id }];

        if (ObjectId.isValid(id)) {
          filters.push({ _id: new ObjectId(id) });
        }

        return filters;
      });

      vendors = await db.collection("user")
        .find({ $or: vendorFilters })
        .project({
          name: 1,
          email: 1,
          image: 1,
          businessName: 1,
          role: 1,
          subscriptionPlan: 1,
        })
        .toArray();
    }

    const vendorMap = new Map();

    vendors.forEach((vendor) => {
      vendorMap.set(String(vendor._id), vendor);

      if (vendor.id) {
        vendorMap.set(String(vendor.id), vendor);
      }
    });

    const enrichedItems = items.map((item) => ({
      ...item,
      vendor: vendorMap.get(String(item.vendorId)) || null,
    }));

    res.status(200).json({
      success: true,
      data: enrichedItems,
      pagination: {
        totalItems,
        currentPage: page,
        totalPages: Math.ceil(totalItems / limit),
        limit,
      },
    });
  } catch (error) {
    next(error);
  }
};

// PATCH: Admin approves, rejects or changes item status
export const updateMenuItemStatus = async (req, res, next) => {
  try {
    const db = getDB();
    const { id } = req.params;
    const { status } = req.body;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid menu item ID.",
      });
    }

    const allowedStatuses = [
      "pending",
      "approved",
      "rejected",
      "inactive",
    ];

    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid menu item status.",
      });
    }

    const menuCollection = db.collection("menuItems");
    const itemId = new ObjectId(id);

    const item = await menuCollection.findOne({
      _id: itemId,
    });

    if (!item) {
      return res.status(404).json({
        success: false,
        message: "Menu item not found.",
      });
    }

    // Enforce Free plan's maximum of 3 active approved items.
    if (status === "approved" && item.isAvailable === true) {
      const plan = await getAdminVendorPlan(db, item.vendorId);

      if (plan === "free") {
        const activeCount = await menuCollection.countDocuments({
          vendorId: item.vendorId,
          status: "approved",
          isAvailable: true,
          _id: { $ne: itemId },
        });

        if (activeCount >= 3) {
          return res.status(409).json({
            success: false,
            message:
              "This vendor has reached the Free plan limit of 3 active menu items. The vendor must upgrade to Premium or deactivate an active item first.",
          });
        }
      }
    }

    const updateData = {
      status,
      updatedAt: new Date(),
    };

    // Rejected, pending and inactive items must not be public.
    if (status !== "approved") {
      updateData.isAvailable = false;
    }

    await menuCollection.updateOne(
      { _id: itemId },
      { $set: updateData }
    );

    const updatedItem = await menuCollection.findOne({
      _id: itemId,
    });

    res.status(200).json({
      success: true,
      message: `Menu item ${status} successfully.`,
      data: updatedItem,
    });
  } catch (error) {
    next(error);
  }
};

// DELETE: Admin deletes an inappropriate menu item
export const deleteMenuItemByAdmin = async (req, res, next) => {
  try {
    const db = getDB();
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid menu item ID.",
      });
    }

    const result = await db.collection("menuItems").deleteOne({
      _id: new ObjectId(id),
    });

    if (result.deletedCount === 0) {
      return res.status(404).json({
        success: false,
        message: "Menu item not found.",
      });
    }

    res.status(200).json({
      success: true,
      message: "Menu item deleted successfully.",
    });
  } catch (error) {
    next(error);
  }
};



// GET: Admin views subscription transactions (read-only)
export const getAllTransactions = async (req, res, next) => {
  try {
    const db = getDB();

    const { status } = req.query;

    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));

    if (
      status !== undefined &&
      (typeof status !== "string" ||
        !/^[a-zA-Z0-9_-]{1,30}$/.test(status))
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid transaction status.",
      });
    }

    const filter = {};

    if (status) {
      filter.status = status;
    }

    const transactionsCollection = db.collection("transactions");

    const [transactions, totalTransactions] = await Promise.all([
      transactionsCollection
        .find(filter)
        .project({
          vendorId: 1,
          plan: 1,
          amount: 1,
          currency: 1,
          status: 1,
          createdAt: 1,
        })
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .toArray(),

      transactionsCollection.countDocuments(filter),
    ]);

    // Collect vendor IDs from transactions.
    const vendorIds = [
      ...new Set(
        transactions
          .map((transaction) =>
            transaction.vendorId
              ? String(transaction.vendorId)
              : ""
          )
          .filter(Boolean)
      ),
    ];

    // Find related vendors.
    let vendors = [];

    if (vendorIds.length > 0) {
      const vendorFilters = vendorIds.flatMap((id) => {
        const filters = [{ _id: id }, { id }];

        if (ObjectId.isValid(id)) {
          filters.push({ _id: new ObjectId(id) });
        }

        return filters;
      });

      vendors = await db.collection("user")
        .find({
          $or: vendorFilters,
          role: "vendor",
        })
        .project({
          name: 1,
          email: 1,
          image: 1,
          businessName: 1,
          role: 1,
        })
        .toArray();
    }

    // Create a lookup map for vendor information.
    const vendorMap = new Map();

    vendors.forEach((vendor) => {
      vendorMap.set(String(vendor._id), vendor);

      if (vendor.id) {
        vendorMap.set(String(vendor.id), vendor);
      }
    });

    // Attach vendor information to each transaction.
    const enrichedTransactions = transactions.map((transaction) => ({
      ...transaction,
      vendor:
        vendorMap.get(String(transaction.vendorId)) || null,
    }));

    res.status(200).json({
      success: true,
      data: enrichedTransactions,
      pagination: {
        totalTransactions,
        currentPage: page,
        totalPages: Math.ceil(totalTransactions / limit),
        limit,
      },
    });
  } catch (error) {
    next(error);
  }
};
