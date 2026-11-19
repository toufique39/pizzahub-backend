import { ObjectId } from "mongodb";
import { getDB } from "../config/database.js";

export const createOrder = async (req, res) => {
  try {
    const db = getDB();

    const {
      itemId,
      deliveryDate,
      deliveryAddress,
      message = "",
    } = req.body;

    // Validate item ID
    if (!ObjectId.isValid(itemId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid menu item ID.",
      });
    }

    // Validate delivery address
    const { addressLine, area, city, phone } =
      deliveryAddress || {};

    if (
      ![addressLine, area, city, phone].every(
        (value) => typeof value === "string" && value.trim()
      )
    ) {
      return res.status(400).json({
        success: false,
        message: "Please provide complete delivery information.",
      });
    }

    if (
      typeof message !== "string" ||
      message.length > 500
    ) {
      return res.status(400).json({
        success: false,
        message: "Message must not exceed 500 characters.",
      });
    }

    // Validate delivery date
    const parsedDate = new Date(deliveryDate);

    if (
      !deliveryDate ||
      Number.isNaN(parsedDate.getTime()) ||
      parsedDate.getTime() < Date.now()
    ) {
      return res.status(400).json({
        success: false,
        message: "Please select a valid future delivery date.",
      });
    }

    // Fetch approved and available item
    const item = await db.collection("menuItems").findOne({
      _id: new ObjectId(itemId),
      status: "approved",
      isAvailable: true,
    });

    if (!item) {
      return res.status(404).json({
        success: false,
        message: "This menu item is not available.",
      });
    }

    // Prevent vendors from ordering their own items
    if (item.vendorId === req.user.id) {
      return res.status(403).json({
        success: false,
        message: "You cannot order your own menu item.",
      });
    }

    // Use the same calendar day for duplicate checking
    const dayStart = new Date(
      Date.UTC(
        parsedDate.getUTCFullYear(),
        parsedDate.getUTCMonth(),
        parsedDate.getUTCDate()
      )
    );

    const nextDay = new Date(
      dayStart.getTime() + 24 * 60 * 60 * 1000
    );

    // Prevent duplicate active orders
    const existingOrder = await db.collection("orders").findOne({
      itemId: new ObjectId(itemId),
      customerId: req.user.id,
      deliveryDate: {
        $gte: dayStart,
        $lt: nextDay,
      },
      status: {
        $in: ["pending", "accepted"],
      },
    });

    if (existingOrder) {
      return res.status(409).json({
        success: false,
        message: "You already have an active order for this item on this date.",
      });
    }

    // Create order
    const order = {
      itemId: new ObjectId(itemId),
      vendorId: item.vendorId,
      customerId: req.user.id,

      itemName: item.itemName,
      itemPrice: item.price,
      itemImage: item.images?.[0] || null,

      deliveryDate: parsedDate,

      deliveryAddress: {
        addressLine: addressLine.trim(),
        area: area.trim(),
        city: city.trim(),
        phone: phone.trim(),
      },

      message: message.trim(),
      status: "pending",
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await db.collection("orders").insertOne(order);

    return res.status(201).json({
      success: true,
      message: "Your order has been placed successfully!",
      data: {
        ...order,
        _id: result.insertedId,
      },
    });
  } catch (error) {
    console.error("Create order error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to place your order.",
    });
  }
};


// Get orders belonging to the authenticated customer
export const getMyOrders = async (req, res) => {
  try {
    const db = getDB();

    const orders = await db.collection("orders")
      .find({ customerId: req.user.id })
      .sort({ createdAt: -1 })
      .toArray();

    // Fetch vendor information
    const vendorIds = [
      ...new Set(
        orders
          .map((order) => order.vendorId)
          .filter((id) => typeof id === "string")
      ),
    ];

    const vendorConditions = vendorIds.flatMap((id) => [
      { _id: id },
      { id },
    ]);

    const vendors = vendorConditions.length
      ? await db.collection("user").find(
          { $or: vendorConditions },
          {
            projection: {
              name: 1,
              image: 1,
              businessName: 1,
            },
          }
        ).toArray()
      : [];

    const vendorMap = new Map();

    vendors.forEach((vendor) => {
      const information = {
        name: vendor.name,
        image: vendor.image,
        businessName: vendor.businessName,
      };

      if (vendor._id) {
        vendorMap.set(String(vendor._id), information);
      }

      if (vendor.id) {
        vendorMap.set(String(vendor.id), information);
      }
    });

    const enrichedOrders = orders.map((order) => ({
      ...order,
      vendor: vendorMap.get(order.vendorId) || null,
    }));

    return res.status(200).json({
      success: true,
      count: enrichedOrders.length,
      data: enrichedOrders,
    });
  } catch (error) {
    console.error("Fetch customer orders error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch your orders.",
    });
  }
};


// Get customer dashboard order statistics
export const getCustomerOrderSummary = async (req, res) => {
  try {
    const db = getDB();

    const orders = db.collection("orders");

    const customerFilter = {
      customerId: req.user.id,
    };

    const [
      total,
      pending,
      accepted,
      rejected,
      cancelled,
    ] = await Promise.all([
      orders.countDocuments(customerFilter),

      orders.countDocuments({
        ...customerFilter,
        status: "pending",
      }),

      orders.countDocuments({
        ...customerFilter,
        status: "accepted",
      }),

      orders.countDocuments({
        ...customerFilter,
        status: "rejected",
      }),

      orders.countDocuments({
        ...customerFilter,
        status: "cancelled",
      }),
    ]);

    return res.status(200).json({
      success: true,
      data: {
        total,
        pending,
        accepted,
        rejected,
        cancelled,
      },
    });
  } catch (error) {
    console.error("Customer summary error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to load dashboard statistics.",
    });
  }
};


// Cancel an order belonging to the authenticated customer
export const cancelMyOrder = async (req, res) => {
  try {
    const db = getDB();
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid order ID.",
      });
    }

    const orderFilter = {
      _id: new ObjectId(id),
      customerId: req.user.id,
    };

    const order = await db.collection("orders").findOne(orderFilter);

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found.",
      });
    }

    if (order.status !== "pending") {
      return res.status(409).json({
        success: false,
        message: "Only pending orders can be cancelled.",
      });
    }

    const result = await db.collection("orders").updateOne(
      {
        ...orderFilter,
        status: "pending",
      },
      {
        $set: {
          status: "cancelled",
          updatedAt: new Date(),
        },
      }
    );

    if (result.modifiedCount === 0) {
      return res.status(409).json({
        success: false,
        message: "Order status changed. Please refresh and try again.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Your order has been cancelled successfully.",
    });
  } catch (error) {
    console.error("Cancel order error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to cancel order.",
    });
  }
};

