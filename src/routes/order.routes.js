import { Router } from "express";
import * as orderController from "../controllers/order.controller.js";
import { requireAuth } from "../middleware/auth.js";
import { authorize } from "../middleware/authorize.js";
import { validate } from "../middleware/validate.js";
import {
  validateCreateOrder,
  validateOrderQuery,
  validateUpdateOrderStatus,
} from "../validators/order.validator.js";

const router = Router();

router.post(
  "/",
  requireAuth,
  authorize("customer"),
  validate(validateCreateOrder),
  orderController.create
);

router.get(
  "/",
  requireAuth,
  validate(validateOrderQuery),
  orderController.list
);

router.get("/:id", requireAuth, orderController.getById);

router.patch(
  "/:id/status",
  requireAuth,
  authorize("vendor", "admin"),
  validate(validateUpdateOrderStatus),
  orderController.updateStatus
);

router.post(
  "/:id/cancel",
  requireAuth,
  authorize("customer"),
  orderController.cancel
);

export default router;
