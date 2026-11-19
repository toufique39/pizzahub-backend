import { getDB } from "../config/database.js";

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

    // Search by name and description
    if (search.trim()) {
      const regex = new RegExp(escapeRegex(search.trim()), "i");

      filter.$or = [
        { itemName: regex },
        { description: regex },
      ];
    }

    // Category filter
    if (typeof category === "string" && category.trim()) {
      filter.category = category.trim();
    }

    // Location filters
    if (typeof city === "string" && city.trim()) {
      filter["location.city"] = {
        $regex: `^${escapeRegex(city.trim())}$`,
        $options: "i",
      };
    }

    if (typeof area === "string" && area.trim()) {
      filter["location.area"] = {
        $regex: `^${escapeRegex(area.trim())}$`,
        $options: "i",
      };
    }

    // Sorting
    const sortOptions = {
      latest: { createdAt: -1 },
      price_asc: { price: 1 },
      price_desc: { price: -1 },
    };

    if (!sortOptions[sort]) {
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

    return res.status(200).json({
      success: true,
      message: "Menu items fetched successfully.",
      data: items,
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