import { Router } from "express";
import { getPublicMenuItems } from "../controllers/menu.controller.js";

const router = Router();

// Public: Browse, search, filter and sort menu
router.get("/", getPublicMenuItems);

export default router;