import * as paymentService from "../services/payment.service.js";
import { ApiError } from "../utils/api-error.js";
import { asyncHandler } from "../utils/async-handler.js";
import { created, ok, paginated } from "../utils/response.js";

export const createCheckout = asyncHandler(async (req, res) => {
  const session = await paymentService.createOrderCheckout(
    req.user,
    req.body.orderId
  );
  created(res, session, "Checkout session created");
});

export const listTransactions = asyncHandler(async (req, res) => {
  paginated(res, await paymentService.listMyTransactions(req.user, req.query));
});

/**
 * Mounted in `src/index.js` before `express.json()` so `req.body` is the raw
 * Buffer Stripe needs to verify the signature.
 */
export const webhook = asyncHandler(async (req, res) => {
  const signature = req.headers["stripe-signature"];
  if (!signature) throw ApiError.badRequest("Missing Stripe signature header");

  const result = await paymentService.handleWebhook(req.body, signature);
  ok(res, result, "Webhook processed");
});
