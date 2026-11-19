import { Router } from "express";

import { createOrder } from "../controllers/orders.controller.js";

import { verifyJWT } from "../middleware/auth.middleware.js";

import { requireRole } from "../middleware/role.middleware.js";

const router = Router();

// Only authenticated customers can place orders
router.post(
  "/",
  verifyJWT,
  requireRole("customer"),
  createOrder
);

export default router;