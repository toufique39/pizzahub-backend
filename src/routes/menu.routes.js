import { Router } from "express";
import * as menuController from "../controllers/menu.controller.js";
import { requireAuth } from "../middleware/auth.js";
import { authorize } from "../middleware/authorize.js";
import { validate } from "../middleware/validate.js";
import {
  validateCreateMenuItem,
  validateMenuItemQuery,
  validateUpdateMenuItem,
} from "../validators/menu.validator.js";

const router = Router();

router.get("/", validate(validateMenuItemQuery), menuController.list);
router.get("/:id", menuController.getById);

router.post(
  "/",
  requireAuth,
  authorize("vendor"),
  validate(validateCreateMenuItem),
  menuController.create
);

router.patch(
  "/:id",
  requireAuth,
  authorize("vendor", "admin"),
  validate(validateUpdateMenuItem),
  menuController.update
);

router.delete(
  "/:id",
  requireAuth,
  authorize("vendor", "admin"),
  menuController.remove
);

export default router;
