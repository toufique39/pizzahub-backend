import { Router } from "express";
import * as vendorController from "../controllers/vendor.controller.js";
import { requireAuth } from "../middleware/auth.js";
import { authorize } from "../middleware/authorize.js";
import { validate } from "../middleware/validate.js";
import {
  validateCreateVendor,
  validateUpdateVendor,
  validateVendorStatus,
} from "../validators/vendor.validator.js";

const router = Router();

router.get("/", vendorController.list);
router.get("/:id", vendorController.getById);

router.post(
  "/",
  requireAuth,
  authorize("vendor"),
  validate(validateCreateVendor),
  vendorController.create
);

router.patch(
  "/:id",
  requireAuth,
  authorize("vendor", "admin"),
  validate(validateUpdateVendor),
  vendorController.update
);

router.patch(
  "/:id/status",
  requireAuth,
  authorize("admin"),
  validate(validateVendorStatus),
  vendorController.updateStatus
);

export default router;
