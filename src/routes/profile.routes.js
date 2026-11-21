
import { Router } from "express";

import {
  getMyProfile,
  updateMyProfile,
} from "../controllers/profile.controller.js";

import { verifyJWT } from "../middleware/auth.middleware.js";
import { requireRole } from "../middleware/role.middleware.js";

const router = Router();

// Only authenticated customers and vendors can manage their profiles.
router.use(
  verifyJWT,
  requireRole("customer", "vendor")
);

router.get("/", getMyProfile);
router.patch("/", updateMyProfile);

export default router;