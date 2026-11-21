
import { Router } from "express";
import express from "express";

import {
  handleStripeWebhook,
} from "../controllers/stripe-webhook.controller.js";

const router = Router();

// Stripe signature verification needs the original raw body.
router.post(
  "/webhook",
  express.raw({ type: "application/json" }),
  handleStripeWebhook
);

export default router;
