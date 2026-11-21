
import { ObjectId } from "mongodb";
import { getDB } from "../config/database.js";
import { normalizeSubscriptionPlan } from "../utils/subscription.js";

const getUserIdFilter = (id) => {
  const filters = [{ _id: id }, { id }];

  if (ObjectId.isValid(id)) {
    filters.push({ _id: new ObjectId(id) });
  }

  return { $or: filters };
};

// GET: Vendor dashboard summary
export const getVendorDashboardSummary = async (req, res, next) => {
  try {
    const db = getDB();
    const vendorId = req.user.id;

    const [
      totalMenuItems,
      activeMenuItems,
      pendingOrders,
      acceptedOrders,
      vendor,
    ] = await Promise.all([
      db.collection("menuItems").countDocuments({ vendorId }),

      db.collection("menuItems").countDocuments({
        vendorId,
        status: "approved",
        isAvailable: true,
      }),

      db.collection("orders").countDocuments({
        vendorId,
        status: "pending",
      }),

      db.collection("orders").countDocuments({
        vendorId,
        status: "accepted",
      }),

      db.collection("user").findOne(
        getUserIdFilter(vendorId),
        {
         projection: {
  subscriptionPlan: 1,
  subscriptionExpiresAt: 1,
  subscriptionStatus: 1,
  subscriptionCancelAtPeriodEnd: 1,
},
        }
      ),
    ]);

   const subscriptionExpiry = vendor?.subscriptionExpiresAt
  ? new Date(vendor.subscriptionExpiresAt)
  : null;

const isPremiumActive =
  String(vendor?.subscriptionPlan || "free").toLowerCase() === "premium" &&
  (!subscriptionExpiry || subscriptionExpiry.getTime() > Date.now());

res.status(200).json({
  success: true,
  data: {
    totalMenuItems,
    activeMenuItems,
    pendingOrders,
    acceptedOrders,

    subscriptionPlan: isPremiumActive ? "premium" : "free",
    subscriptionStatus: vendor?.subscriptionStatus || "inactive",
    subscriptionExpiresAt: vendor?.subscriptionExpiresAt || null,
    subscriptionCancelAtPeriodEnd:
      Boolean(vendor?.subscriptionCancelAtPeriodEnd),
  },
});;
  } catch (error) {
    next(error);
  }
};

// GET: Vendor's own customer orders
export const getVendorOrders = async (req, res, next) => {
  try {
    const db = getDB();
    const vendorId = req.user.id;

    const allowedStatuses = [
      "pending",
      "accepted",
      "rejected",
      "cancelled",
    ];

    const status = req.query.status;
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));

    if (status && !allowedStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid order status.",
      });
    }

    const filter = { vendorId };

    if (status) {
      filter.status = status;
    }

    const [orders, totalOrders] = await Promise.all([
      db.collection("orders")
        .find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .toArray(),

      db.collection("orders").countDocuments(filter),
    ]);

    // Collect customer IDs and item IDs for related information.
    const customerIds = [
      ...new Set(
        orders
          .map((order) => order.customerId)
          .filter((id) => id !== undefined && id !== null && id !== "")
          .map((id) => String(id))
      ),
    ];

    const itemIds = [
      ...new Set(orders.map((order) => String(order.itemId))),
    ].filter((id) => ObjectId.isValid(id));

    // Fetch customer information.
    let customers = [];

    if (customerIds.length > 0) {
      const userFilters = customerIds.flatMap((id) => {
        const filters = [{ _id: id }, { id }];

        if (ObjectId.isValid(id)) {
          filters.push({ _id: new ObjectId(id) });
        }

        return filters;
      });

      customers = await db.collection("user")
        .find({ $or: userFilters })
        .project({ name: 1, email: 1, image: 1 })
        .toArray();
    }

    // Fetch menu item information.
    let menuItems = [];

    if (itemIds.length > 0) {
      menuItems = await db.collection("menuItems")
        .find({
          _id: { $in: itemIds.map((id) => new ObjectId(id)) },
          vendorId,
        })
        .project({
          itemName: 1,
          category: 1,
          price: 1,
          images: 1,
        })
        .toArray();
    }

    const customerMap = new Map();

    customers.forEach((customer) => {
      customerMap.set(String(customer._id), customer);

      if (customer.id) {
        customerMap.set(String(customer.id), customer);
      }
    });

    const itemMap = new Map(
      menuItems.map((item) => [String(item._id), item])
    );

    const enrichedOrders = orders.map((order) => ({
      ...order,
      customer: customerMap.get(String(order.customerId)) || null,
      item:
        itemMap.get(String(order.itemId)) || {
          itemName: order.itemName || "Menu item unavailable",
          price: order.itemPrice ?? order.price ?? 0,
          images: order.itemImage ? [order.itemImage] : [],
        },
    }));

    res.status(200).json({
      success: true,
      data: enrichedOrders,
      pagination: {
        totalOrders,
        currentPage: page,
        totalPages: Math.ceil(totalOrders / limit),
        limit,
      },
    });
  } catch (error) {
    next(error);
  }
};

// PATCH: Accept or reject a pending order
export const updateVendorOrderStatus = async (req, res, next) => {
  try {
    const db = getDB();
    const vendorId = req.user.id;
    const { id } = req.params;
    const { status } = req.body;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid order ID.",
      });
    }

    if (!["accepted", "rejected"].includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Status must be accepted or rejected.",
      });
    }

    const orderId = new ObjectId(id);
    const ordersCollection = db.collection("orders");

    const order = await ordersCollection.findOne({
      _id: orderId,
      vendorId,
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found.",
      });
    }

    if (order.status !== "pending") {
      return res.status(409).json({
        success: false,
        message: "Only pending orders can be updated.",
      });
    }

    // Atomic update prevents the same pending order from being processed twice.
    const result = await ordersCollection.updateOne(
      {
        _id: orderId,
        vendorId,
        status: "pending",
      },
      {
        $set: {
          status,
          updatedAt: new Date(),
        },
      }
    );

    if (result.modifiedCount === 0) {
      return res.status(409).json({
        success: false,
        message: "This order has already been processed.",
      });
    }

    res.status(200).json({
      success: true,
      message: `Order ${status} successfully.`,
    });
  } catch (error) {
    next(error);
  }
};
