import { getProfile, updateProfile } from "../services/user.service.js";
import { asyncHandler } from "../utils/async-handler.js";
import { ok } from "../utils/response.js";

export const getMe = asyncHandler(async (req, res) => {
  ok(res, await getProfile(req.user.id));
});

export const updateMe = asyncHandler(async (req, res) => {
  ok(res, await updateProfile(req.user.id, req.body), "Profile updated");
});
