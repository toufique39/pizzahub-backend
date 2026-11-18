import { Router } from "express";
import * as paymentController from "../controllers/payment.controller.js";
import { requireAuth } from "../middleware/auth.js";
import { authorize } from "../middleware/authorize.js";

/**
 * The Stripe webhook is intentionally not defined here. It is mounted in
 * `src/index.js` before the JSON body parser so the raw body stays available
 * for signature verification.
 */
const router = Router();

router.post(
  "/checkout",
  requireAuth,
  authorize("customer"),
  paymentController.createCheckout
);

router.get(
  "/transactions",
  requireAuth,
  authorize("customer"),
  paymentController.listTransactions
);

export default router;
