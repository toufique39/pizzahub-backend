
import { ObjectId } from "mongodb";
import { getDB } from "../config/database.js";

const getUserFilter = (userId) => {
  const filters = [
    { _id: userId },
    { id: userId },
  ];

  if (ObjectId.isValid(userId)) {
    filters.push({ _id: new ObjectId(userId) });
  }

  return { $or: filters };
};

// GET: Get authenticated user's profile
export const getMyProfile = async (req, res, next) => {
  try {
    const db = getDB();

    const user = await db.collection("user").findOne(
      getUserFilter(req.user.id),
      {
        projection: {
          name: 1,
          email: 1,
          image: 1,
          role: 1,
          businessName: 1,
          subscriptionPlan: 1,
          subscriptionStatus: 1,
          subscriptionExpiresAt: 1,
          isBlocked: 1,
          createdAt: 1,
        },
      }
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Profile not found.",
      });
    }

    res.status(200).json({
      success: true,
      data: user,
    });
  } catch (error) {
    next(error);
  }
};

// PATCH: Update authenticated user's editable profile fields
export const updateMyProfile = async (req, res, next) => {
  try {
    const db = getDB();
    const userFilter = getUserFilter(req.user.id);

    const body = req.body;

    if (
      !body ||
      typeof body !== "object" ||
      Array.isArray(body)
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid profile data.",
      });
    }

    // These fields must never be editable through this endpoint.
    const protectedFields = [
      "role",
      "subscriptionPlan",
      "subscriptionStatus",
      "subscriptionExpiresAt",
      "isBlocked",
      "stripeCustomerId",
      "stripeSubscriptionId",
    ];

    if (protectedFields.some((field) => field in body)) {
      return res.status(403).json({
        success: false,
        message: "You cannot update protected account fields.",
      });
    }

    const allowedFields = ["name", "image"];

    if (req.user.role === "vendor") {
      allowedFields.push("businessName");
    }

    const unsupportedFields = Object.keys(body).filter(
      (field) => !allowedFields.includes(field)
    );

    if (unsupportedFields.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Unsupported profile field: ${unsupportedFields[0]}`,
      });
    }

    const updateData = {};

    // Validate name.
    if (body.name !== undefined) {
      if (typeof body.name !== "string") {
        return res.status(400).json({
          success: false,
          message: "Name must be a string.",
        });
      }

      const name = body.name.trim();

      if (name.length < 2 || name.length > 60) {
        return res.status(400).json({
          success: false,
          message: "Name must be between 2 and 60 characters.",
        });
      }

      updateData.name = name;
    }

    // Validate profile image URL.
    if (body.image !== undefined) {
      if (typeof body.image !== "string" || body.image.length > 1000) {
        return res.status(400).json({
          success: false,
          message: "Invalid profile image URL.",
        });
      }

      const imageUrl = body.image.trim();

      if (imageUrl) {
        let parsedUrl;

        try {
          parsedUrl = new URL(imageUrl);
        } catch {
          return res.status(400).json({
            success: false,
            message: "Please provide a valid profile image URL.",
          });
        }

        if (!["https:", "http:"].includes(parsedUrl.protocol)) {
          return res.status(400).json({
            success: false,
            message: "Profile image must use HTTP or HTTPS.",
          });
        }
      }

      // Empty string clears the profile image.
      updateData.image = imageUrl || null;
    }

    // Vendor-only business name.
    if (body.businessName !== undefined) {
      if (
        req.user.role !== "vendor" ||
        typeof body.businessName !== "string"
      ) {
        return res.status(400).json({
          success: false,
          message: "Invalid business name.",
        });
      }

      const businessName = body.businessName.trim();

      if (businessName.length < 2 || businessName.length > 80) {
        return res.status(400).json({
          success: false,
          message: "Business name must be between 2 and 80 characters.",
        });
      }

      updateData.businessName = businessName;
    }

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({
        success: false,
        message: "Provide at least one profile field to update.",
      });
    }

    updateData.updatedAt = new Date();

    const result = await db.collection("user").updateOne(
      userFilter,
      {
        $set: updateData,
      }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({
        success: false,
        message: "Profile not found.",
      });
    }

    const updatedUser = await db.collection("user").findOne(
      userFilter,
      {
        projection: {
          name: 1,
          email: 1,
          image: 1,
          role: 1,
          businessName: 1,
          subscriptionPlan: 1,
          subscriptionStatus: 1,
          subscriptionExpiresAt: 1,
          isBlocked: 1,
        },
      }
    );

    res.status(200).json({
      success: true,
      message: "Profile updated successfully.",
      data: updatedUser,
    });
  } catch (error) {
    next(error);
  }
};
