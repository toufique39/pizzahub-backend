import * as orderService from "../services/order.service.js";
import { asyncHandler } from "../utils/async-handler.js";
import { created, ok, paginated } from "../utils/response.js";

export const create = asyncHandler(async (req, res) => {
  const order = await orderService.createOrder(req.user, req.body);
  created(res, order, "Order placed");
});

export const list = asyncHandler(async (req, res) => {
  paginated(res, await orderService.listOrders(req.user, req.query));
});

export const getById = asyncHandler(async (req, res) => {
  ok(res, await orderService.getOrder(req.params.id, req.user));
});

export const updateStatus = asyncHandler(async (req, res) => {
  const order = await orderService.updateOrderStatus(
    req.params.id,
    req.user,
    req.body.status
  );
  ok(res, order, "Order status updated");
});

export const cancel = asyncHandler(async (req, res) => {
  const order = await orderService.cancelOrder(req.params.id, req.user);
  ok(res, order, "Order cancelled");
});
