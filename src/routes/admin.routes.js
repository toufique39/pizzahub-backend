import { Router } from "express";
import * as adminController from "../controllers/admin.controller.js";
import * as vendorController from "../controllers/vendor.controller.js";
import { requireAuth } from "../middleware/auth.js";
import { authorize } from "../middleware/authorize.js";
import { validate } from "../middleware/validate.js";
import { validateVendorStatus } from "../validators/vendor.validator.js";

const router = Router();

router.use(requireAuth, authorize("admin"));

router.get("/stats", adminController.getStats);
router.get("/users", adminController.listUsers);
router.get("/vendors", adminController.listVendors);
router.get("/transactions", adminController.listTransactions);

router.patch(
  "/vendors/:id/status",
  validate(validateVendorStatus),
  vendorController.updateStatus
);

export default router;
