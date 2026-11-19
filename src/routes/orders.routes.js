import { Router } from "express";

import {
  createOrder,
  getMyOrders,
  getCustomerOrderSummary,
  cancelMyOrder,
} from "../controllers/orders.controller.js";

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

// Customer: View own orders
router.get(
  "/my-orders",
  verifyJWT,
  requireRole("customer"),
  getMyOrders
);


// Customer: Dashboard statistics
router.get(
  "/summary",
  verifyJWT,
  requireRole("customer"),
  getCustomerOrderSummary
);

// Customer: Cancel own pending order
router.patch(
  "/:id/cancel",
  verifyJWT,
  requireRole("customer"),
  cancelMyOrder
);
export default router;