
import { Router } from "express";

import {
  getVendorDashboardSummary,
  getVendorOrders,
  updateVendorOrderStatus,
} from "../controllers/vendor.controller.js";

import { verifyJWT } from "../middleware/auth.middleware.js";
import { requireRole } from "../middleware/role.middleware.js";

const router = Router();

router.use(verifyJWT, requireRole("vendor"));

router.get("/dashboard/summary", getVendorDashboardSummary);
router.get("/orders", getVendorOrders);
router.patch("/orders/:id/status", updateVendorOrderStatus);

export default router;
