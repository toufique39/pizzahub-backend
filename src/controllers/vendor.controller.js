import * as vendorService from "../services/vendor.service.js";
import { asyncHandler } from "../utils/async-handler.js";
import { created, ok, paginated } from "../utils/response.js";

export const list = asyncHandler(async (req, res) => {
  // Public marketplace only exposes approved vendors.
  const result = await vendorService.listVendors({
    ...req.query,
    status: "approved",
  });
  paginated(res, result);
});

export const getById = asyncHandler(async (req, res) => {
  ok(res, await vendorService.getVendor(req.params.id));
});

export const create = asyncHandler(async (req, res) => {
  const vendor = await vendorService.createVendor(req.user.id, req.body);
  created(res, vendor, "Vendor profile submitted for approval");
});

export const update = asyncHandler(async (req, res) => {
  const vendor = await vendorService.updateVendor(
    req.params.id,
    req.user,
    req.body
  );
  ok(res, vendor, "Vendor updated");
});

export const updateStatus = asyncHandler(async (req, res) => {
  const vendor = await vendorService.setVendorStatus(
    req.params.id,
    req.body.status
  );
  ok(res, vendor, "Vendor status updated");
});
