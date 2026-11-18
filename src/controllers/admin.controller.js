import * as adminService from "../services/admin.service.js";
import * as vendorService from "../services/vendor.service.js";
import { asyncHandler } from "../utils/async-handler.js";
import { ok, paginated } from "../utils/response.js";

export const getStats = asyncHandler(async (_req, res) => {
  ok(res, await adminService.getPlatformStats());
});

export const listUsers = asyncHandler(async (req, res) => {
  paginated(res, await adminService.listUsers(req.query));
});

export const listVendors = asyncHandler(async (req, res) => {
  paginated(res, await vendorService.listVendors(req.query));
});

export const listTransactions = asyncHandler(async (req, res) => {
  paginated(res, await adminService.listTransactions(req.query));
});
