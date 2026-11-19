
import { ObjectId } from "mongodb";
import { getDB } from "../config/database.js";
import { normalizeMenuItemLocation } from "../utils/mongo.js";

const uploadImageToImgBB = async (file) => {
  const apiKey = process.env.IMGBB_API_KEY;

  if (!apiKey) {
    throw new Error("ImgBB API key is not configured.");
  }

  const formData = new FormData();

  // ImgBB accepts base64 image data.
  formData.append("image", file.buffer.toString("base64"));
  formData.append("name", file.originalname);

  const response = await fetch(
    `https://api.imgbb.com/1/upload?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      body: formData,
    }
  );

  const result = await response.json();

  if (!response.ok || !result.success || !result.data?.url) {
    throw new Error(
      result.error?.message || "Image upload to ImgBB failed."
    );
  }

  return result.data.url;
};

// POST: Create a vendor menu item
export const createVendorMenuItem = async (req, res, next) => {
  try {
    const {
      itemName,
      category,
      description,
      price,
      area,
      city,
    } = req.body;

    // Validate required fields.
    if (
      !itemName?.trim() ||
      !category?.trim() ||
      !description?.trim() ||
      !price ||
      !area?.trim() ||
      !city?.trim()
    ) {
      return res.status(400).json({
        success: false,
        message: "All menu item fields are required.",
      });
    }

    const numericPrice = Number(price);

    if (!Number.isFinite(numericPrice) || numericPrice <= 0) {
      return res.status(400).json({
        success: false,
        message: "Price must be a valid positive number.",
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "Menu item image is required.",
      });
    }

    // Upload image to ImgBB.
    const imageUrl = await uploadImageToImgBB(req.file);

    const db = getDB();

    const newMenuItem = {
      itemName: itemName.trim(),
      category: category.trim(),
      description: description.trim(),
      price: numericPrice,
      area: area.trim(),
      city: city.trim(),

      // The public menu reads location as a nested object.
      location: {
        area: area.trim(),
        city: city.trim(),
      },

      // Always use the authenticated vendor ID.
      vendorId: req.user.id,

      images: [{ url: imageUrl }],

      // Admin must approve before public visibility.
      status: "pending",
      isAvailable: true,

      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await db.collection("menuItems").insertOne(newMenuItem);

    res.status(201).json({
      success: true,
      message: "Menu item submitted for admin approval.",
      data: {
        ...newMenuItem,
        _id: result.insertedId,
      },
    });
  } catch (error) {
    next(error);
  }
};

// GET: Read only the authenticated vendor's menu items
export const getVendorMenuItems = async (req, res, next) => {
  try {
    const db = getDB();

    const allowedStatuses = [
      "pending",
      "approved",
      "rejected",
      "inactive",
    ];

    const { status } = req.query;

    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 12));

    if (status && !allowedStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid menu item status.",
      });
    }

    // Ownership is enforced by the server.
    const filter = {
      vendorId: req.user.id,
    };

    if (status) {
      filter.status = status;
    }

    const [items, totalItems] = await Promise.all([
      db.collection("menuItems")
        .find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .toArray(),

      db.collection("menuItems").countDocuments(filter),
    ]);

    res.status(200).json({
      success: true,
      data: items.map(normalizeMenuItemLocation),
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

const getVendorSubscriptionPlan = async (db, vendorId) => {
  const filters = [{ _id: vendorId }, { id: vendorId }];

  if (ObjectId.isValid(vendorId)) {
    filters.push({ _id: new ObjectId(vendorId) });
  }

  const vendor = await db.collection("user").findOne(
    { $or: filters },
    {
      projection: {
        subscriptionPlan: 1,
        subscriptionExpiresAt: 1,
      },
    }
  );

  const plan = String(vendor?.subscriptionPlan || "free").toLowerCase();

  // An expired Premium subscription is treated as Free.
  if (plan === "premium" && vendor?.subscriptionExpiresAt) {
    if (new Date(vendor.subscriptionExpiresAt).getTime() <= Date.now()) {
      return "free";
    }
  }

  return plan === "premium" ? "premium" : "free";
};

// PATCH: Update own menu item
export const updateVendorMenuItem = async (req, res, next) => {
  try {
    const db = getDB();
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid menu item ID.",
      });
    }

    const itemId = new ObjectId(id);
    const vendorId = req.user.id;
    const menuItems = db.collection("menuItems");

    const existingItem = await menuItems.findOne({
      _id: itemId,
      vendorId,
    });

    if (!existingItem) {
      return res.status(404).json({
        success: false,
        message: "Menu item not found.",
      });
    }

    const allowedFields = [
      "itemName",
      "category",
      "description",
      "price",
      "area",
      "city",
    ];

    const updateData = {};

    for (const field of allowedFields) {
      if (req.body[field] === undefined) continue;

      if (field === "price") {
        const price = Number(req.body.price);

        if (!Number.isFinite(price) || price <= 0) {
          return res.status(400).json({
            success: false,
            message: "Price must be a valid positive number.",
          });
        }

        updateData.price = price;
      } else {
        const value = String(req.body[field]).trim();

        if (!value) {
          return res.status(400).json({
            success: false,
            message: `${field} cannot be empty.`,
          });
        }

        updateData[field] = value;
      }
    }

    // Keep the public location object and the flat fields in sync.
    if (updateData.area !== undefined || updateData.city !== undefined) {
      const area =
        updateData.area ??
        existingItem.location?.area ??
        existingItem.area ??
        "";
      const city =
        updateData.city ??
        existingItem.location?.city ??
        existingItem.city ??
        "";

      updateData.area = area;
      updateData.city = city;
      updateData.location = { area, city };
    }

    // Replace image only when a new file is provided.
    if (req.file) {
      const imageUrl = await uploadImageToImgBB(req.file);
      updateData.images = [{ url: imageUrl }];
    }

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({
        success: false,
        message: "Provide at least one field to update.",
      });
    }

    updateData.updatedAt = new Date();

    await menuItems.updateOne(
      { _id: itemId, vendorId },
      { $set: updateData }
    );

    const updatedItem = await menuItems.findOne({
      _id: itemId,
      vendorId,
    });

    res.status(200).json({
      success: true,
      message: "Menu item updated successfully.",
      data: normalizeMenuItemLocation(updatedItem),
    });
  } catch (error) {
    next(error);
  }
};

// DELETE: Delete own menu item
export const deleteVendorMenuItem = async (req, res, next) => {
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
      vendorId: req.user.id,
    });

    if (result.deletedCount === 0) {
      return res.status(404).json({
        success: false,
        message: "Menu item not found or access denied.",
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

// PATCH: Manage menu item availability
export const updateVendorMenuAvailability = async (req, res, next) => {
  try {
    const db = getDB();
    const { id } = req.params;
    const { isAvailable } = req.body;
    const vendorId = req.user.id;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid menu item ID.",
      });
    }

    if (typeof isAvailable !== "boolean") {
      return res.status(400).json({
        success: false,
        message: "isAvailable must be true or false.",
      });
    }

    const itemId = new ObjectId(id);
    const menuItems = db.collection("menuItems");

    const item = await menuItems.findOne({
      _id: itemId,
      vendorId,
    });

    if (!item) {
      return res.status(404).json({
        success: false,
        message: "Menu item not found.",
      });
    }

    // Only approved and available items count as active items.
    if (
      isAvailable &&
      item.status === "approved" &&
      !item.isAvailable
    ) {
      const plan = await getVendorSubscriptionPlan(db, vendorId);

      if (plan === "free") {
        const activeCount = await menuItems.countDocuments({
          vendorId,
          status: "approved",
          isAvailable: true,
          _id: { $ne: itemId },
        });

        if (activeCount >= 3) {
          return res.status(403).json({
            success: false,
            message:
              "Free plan allows a maximum of 3 active menu items. Upgrade to Premium to activate more.",
          });
        }
      }
    }

    await menuItems.updateOne(
      { _id: itemId, vendorId },
      {
        $set: {
          isAvailable,
          updatedAt: new Date(),
        },
      }
    );

    res.status(200).json({
      success: true,
      message: `Menu item ${isAvailable ? "activated" : "deactivated"} successfully.`,
      data: {
        itemId: id,
        isAvailable,
      },
    });
  } catch (error) {
    next(error);
  }
};
