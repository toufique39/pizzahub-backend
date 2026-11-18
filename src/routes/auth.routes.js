import { Router } from "express";
import * as authController from "../controllers/auth.controller.js";
import { requireAuth } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import {
  validateSignIn,
  validateSignUp,
} from "../validators/auth.validator.js";

const router = Router();

router.post("/signup", validate(validateSignUp), authController.signUp);
router.post("/signin", validate(validateSignIn), authController.signIn);
router.get("/me", requireAuth, authController.me);

export default router;
