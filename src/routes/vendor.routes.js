
import { Router } from "express";

import {
  getVendorDashboardSummary,
  getVendorOrders,
  updateVendorOrderStatus,
} from "../controllers/vendor.controller.js";

import {
  createVendorMenuItem,
  getVendorMenuItems,
  updateVendorMenuItem,
  deleteVendorMenuItem,
  updateVendorMenuAvailability,
} from "../controllers/vendor-menu.controller.js";

import { uploadMenuImage } from "../middleware/upload.middleware.js";

import { verifyJWT } from "../middleware/auth.middleware.js";
import { requireRole } from "../middleware/role.middleware.js";

const router = Router();

router.use(verifyJWT, requireRole("vendor"));

router.get("/dashboard/summary", getVendorDashboardSummary);
router.get("/orders", getVendorOrders);
router.patch("/orders/:id/status", updateVendorOrderStatus);
router.get("/menu-items", getVendorMenuItems);

router.post(
  "/menu-items",
  uploadMenuImage.single("image"),
  createVendorMenuItem,
);

// Update a menu item (image is optional)
router.patch(
  "/menu-items/:id",
  uploadMenuImage.single("image"),
  updateVendorMenuItem
);

// Delete a menu item
router.delete("/menu-items/:id", deleteVendorMenuItem);

// Activate or deactivate a menu item
router.patch(
  "/menu-items/:id/availability",
  updateVendorMenuAvailability
);

export default router;
