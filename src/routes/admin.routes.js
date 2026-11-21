
import { Router } from "express";
import {
  getAdminDashboardAnalytics,
} from "../controllers/admin-analytics.controller.js";
import {
  getAdminDashboardSummary,
  getAllUsers,
  updateUserBlockStatus,
  getAllMenuItems,
  updateMenuItemStatus,
  deleteMenuItemByAdmin,
  getAllTransactions,
} from "../controllers/admin.controller.js";
import { verifyJWT } from "../middleware/auth.middleware.js";
import { requireRole } from "../middleware/role.middleware.js";

const router = Router();

// All admin routes require a valid JWT and admin role.
router.use(verifyJWT, requireRole("admin"));

router.get("/dashboard/summary", getAdminDashboardSummary);
router.get("/users", getAllUsers);
router.patch("/users/:id/status", updateUserBlockStatus);
router.get("/menu-items", getAllMenuItems);
router.patch( "/menu-items/:id/status",updateMenuItemStatus);
router.delete("/menu-items/:id",deleteMenuItemByAdmin);
router.get("/transactions", getAllTransactions);
router.get(
  "/dashboard/analytics",
  getAdminDashboardAnalytics
);


export default router;
