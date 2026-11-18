import * as menuService from "../services/menu.service.js";
import { asyncHandler } from "../utils/async-handler.js";
import { created, ok, paginated } from "../utils/response.js";

export const list = asyncHandler(async (req, res) => {
  paginated(res, await menuService.listMenuItems(req.query));
});

export const getById = asyncHandler(async (req, res) => {
  ok(res, await menuService.getMenuItem(req.params.id));
});

export const create = asyncHandler(async (req, res) => {
  const item = await menuService.createMenuItem(req.user, req.body);
  created(res, item, "Menu item created");
});

export const update = asyncHandler(async (req, res) => {
  const item = await menuService.updateMenuItem(
    req.params.id,
    req.user,
    req.body
  );
  ok(res, item, "Menu item updated");
});

export const remove = asyncHandler(async (req, res) => {
  const result = await menuService.deleteMenuItem(req.params.id, req.user);
  ok(res, result, "Menu item deleted");
});
