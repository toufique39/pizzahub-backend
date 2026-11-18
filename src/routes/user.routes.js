import { Router } from "express";
import * as userController from "../controllers/user.controller.js";
import { requireAuth } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { validateUpdateProfile } from "../validators/auth.validator.js";

const router = Router();

router.get("/me", requireAuth, userController.getMe);
router.patch(
  "/me",
  requireAuth,
  validate(validateUpdateProfile),
  userController.updateMe
);

export default router;
