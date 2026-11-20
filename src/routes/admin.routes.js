
import { Router } from "express";

import {
  getAdminDashboardSummary,
  getAllUsers,
  updateUserBlockStatus,
  getAllMenuItems,
  updateMenuItemStatus,
  deleteMenuItemByAdmin,
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




export default router;
