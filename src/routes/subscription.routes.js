import { Router } from "express";
import * as subscriptionController from "../controllers/subscription.controller.js";
import { requireAuth } from "../middleware/auth.js";
import { authorize } from "../middleware/authorize.js";

const router = Router();

router.use(requireAuth, authorize("vendor"));

router.get("/me", subscriptionController.getMine);
router.post("/checkout", subscriptionController.createCheckout);

export default router;
