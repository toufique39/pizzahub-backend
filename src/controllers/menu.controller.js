import { getDB } from "../config/database.js";
import { ObjectId } from "mongodb";
import {
  buildUserIdFilter,
  buildUserIdsFilter,
  normalizeMenuItemLocation,
} from "../utils/mongo.js";
const escapeRegex = (value) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const getPublicMenuItems = async (req, res) => {
  try {
    const db = getDB();

    const {
      search = "",
      category,
      city,
      area,
      sort = "latest",
      page = "1",
      limit = "12",
    } = req.query;

    // Validate query parameters
    if (
      typeof search !== "string" ||
      typeof page !== "string" ||
      typeof limit !== "string"
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid query parameters.",
      });
    }

    const pageNumber = Number(page);
    const limitNumber = Number(limit);

    if (
      !Number.isInteger(pageNumber) ||
      pageNumber < 1 ||
      !Number.isInteger(limitNumber) ||
      limitNumber < 1 ||
      limitNumber > 50
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid page or limit.",
      });
    }

    // Only approved and available items
    const filter = {
      status: "approved",
      isAvailable: true,
    };

    // Conditions that may contain their own $or must be combined via $and.
    const andConditions = [];

    // Search by name and description
    if (search.trim()) {
      const regex = new RegExp(escapeRegex(search.trim()), "i");

      andConditions.push({
        $or: [{ itemName: regex }, { description: regex }],
      });
    }

    // Category filter
    if (typeof category === "string" && category.trim()) {
      filter.category = category.trim();
    }

    // Location filters. Support both the current nested shape and the
    // legacy top-level `area`/`city` fields.
    if (typeof city === "string" && city.trim()) {
      const cityRegex = {
        $regex: `^${escapeRegex(city.trim())}$`,
        $options: "i",
      };

      andConditions.push({
        $or: [{ "location.city": cityRegex }, { city: cityRegex }],
      });
    }

    if (typeof area === "string" && area.trim()) {
      const areaRegex = {
        $regex: `^${escapeRegex(area.trim())}$`,
        $options: "i",
      };

      andConditions.push({
        $or: [{ "location.area": areaRegex }, { area: areaRegex }],
      });
    }

    if (andConditions.length > 0) {
      filter.$and = andConditions;
    }

    // Sorting
    const sortOptions = {
      latest: { createdAt: -1 },
      price_asc: { price: 1 },
      price_desc: { price: -1 },
    };

    if (!Object.prototype.hasOwnProperty.call(sortOptions, sort)) {
      return res.status(400).json({
        success: false,
        message: "Invalid sorting option.",
      });
    }

    const collection = db.collection("menuItems");

    const [items, totalItems] = await Promise.all([
      collection
        .find(filter)
        .sort(sortOptions[sort])
        .skip((pageNumber - 1) * limitNumber)
        .limit(limitNumber)
        .toArray(),

      collection.countDocuments(filter),
    ]);

    // Fetch vendor information for the menu items.
    const vendorIds = [
      ...new Set(
        items
          .map((item) => item.vendorId)
          .filter((id) => id !== undefined && id !== null && id !== "")
      ),
    ];

    const vendorFilter = buildUserIdsFilter(vendorIds);

    const vendors = vendorFilter
      ? await db.collection("user").find(vendorFilter, {
          projection: {
            name: 1,
            image: 1,
            businessName: 1,
          },
        }).toArray()
      : [];

    const vendorMap = new Map();

    vendors.forEach((vendor) => {
      const information = {
        name: vendor.name,
        businessName: vendor.businessName,
        image: vendor.image,
      };

      if (vendor._id !== undefined) {
        vendorMap.set(String(vendor._id), information);
      }

      if (vendor.id !== undefined) {
        vendorMap.set(String(vendor.id), information);
      }
    });

    const itemsWithVendor = items.map((item) => {
      const normalizedItem = normalizeMenuItemLocation(item);

      return {
        ...normalizedItem,
        vendor: vendorMap.get(String(normalizedItem.vendorId)) || null,
      };
    });

    return res.status(200).json({
      success: true,
      message: "Menu items fetched successfully.",
     data: itemsWithVendor,
      pagination: {
        currentPage: pageNumber,
        limit: limitNumber,
        totalItems,
        totalPages: Math.ceil(totalItems / limitNumber),
      },
    });
  } catch (error) {
    console.error("Public menu error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch menu items.",
    });
  }
};


// Get one approved and available menu item
export const getPublicMenuItemById = async (req, res) => {
  try {
    const db = getDB();
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid menu item ID.",
      });
    }

    const item = await db.collection("menuItems").findOne({
      _id: new ObjectId(id),
      status: "approved",
      isAvailable: true,
    });

    if (!item) {
      return res.status(404).json({
        success: false,
        message: "Menu item not found or unavailable.",
      });
    }

    const vendorFilter = buildUserIdFilter(item.vendorId);

    const vendor = vendorFilter
      ? await db.collection("user").findOne(vendorFilter, {
          projection: {
            name: 1,
            image: 1,
            businessName: 1,
          },
        })
      : null;

    return res.status(200).json({
      success: true,
      data: {
        ...normalizeMenuItemLocation(item),
        vendor: vendor
          ? {
              name: vendor.name,
              image: vendor.image,
              businessName: vendor.businessName,
            }
          : null,
      },
    });
  } catch (error) {
    console.error("Menu item details error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch menu item details.",
    });
  }
};