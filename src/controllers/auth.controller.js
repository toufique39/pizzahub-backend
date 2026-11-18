import * as authService from "../services/auth.service.js";
import { getProfile } from "../services/user.service.js";
import { asyncHandler } from "../utils/async-handler.js";
import { created, ok } from "../utils/response.js";

export const signUp = asyncHandler(async (req, res) => {
  const session = await authService.signUp(req.body);
  created(res, session, "Account created");
});

export const signIn = asyncHandler(async (req, res) => {
  const session = await authService.signIn(req.body);
  ok(res, session, "Signed in");
});

export const me = asyncHandler(async (req, res) => {
  ok(res, await getProfile(req.user.id));
});
