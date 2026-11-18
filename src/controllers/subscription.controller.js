import * as paymentService from "../services/payment.service.js";
import { asyncHandler } from "../utils/async-handler.js";
import { created, ok } from "../utils/response.js";

export const getMine = asyncHandler(async (req, res) => {
  ok(res, await paymentService.getMySubscription(req.user));
});

export const createCheckout = asyncHandler(async (req, res) => {
  const session = await paymentService.createSubscriptionCheckout(req.user);
  created(res, session, "Subscription checkout session created");
});
