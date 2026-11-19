import { Router } from "express";

import {
  getPublicMenuItems,
  getPublicMenuItemById,
} from "../controllers/menu.controller.js";

const router = Router();

router.get("/", getPublicMenuItems);
router.get("/:id", getPublicMenuItemById);

export default router;