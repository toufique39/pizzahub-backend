import { ObjectId } from "mongodb";
import { collection } from "../config/db.js";
import { env } from "../config/env.js";
import { getStripe, isStripeConfigured } from "../config/stripe.js";
import { ApiError } from "../utils/api-error.js";
import { pageResult, parsePagination } from "../utils/pagination.js";
import { serialize } from "../utils/serialize.js";
import { toObjectId } from "./user.service.js";
import { findVendorByOwner } from "./vendor.service.js";

const TRANSACTION_STATUSES = ["pending", "succeeded", "failed", "refunded"];
const SUBSCRIPTION_STATUS_MAP = {
  active: "active",
  trialing: "trialing",
  past_due: "past_due",
  unpaid: "past_due",
  incomplete: "past_due",
  incomplete_expired: "cancelled",
  canceled: "cancelled",
  paused: "cancelled",
};

function stripeId(value) {
  if (!value) return null;
  return typeof value === "string" ? value : value.id;
}

function invoicePeriodEnd(subscription) {
  // Newer Stripe API versions expose billing periods on subscription items.
  const seconds =
    subscription.items?.data?.[0]?.current_period_end ??
    subscription.current_period_end;

  return seconds ? new Date(seconds * 1000) : null;
}

function checkoutUrls() {
  const baseUrl = env.clientUrls[0] ?? "http://localhost:10000";

  return {
    successUrl: `${baseUrl}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
    cancelUrl: `${baseUrl}/payment-cancel`,
  };
}

export async function createOrderCheckout(actor, orderId) {
  if (!isStripeConfigured()) {
    throw ApiError.badRequest("Stripe is not configured");
  }

  const order = await collection("orders").findOne({
    _id: toObjectId(orderId, "order id"),
  });

  if (!order) throw ApiError.notFound("Order not found");
  if (order.customerId.toString() !== actor.id) {
    throw ApiError.forbidden("You can only pay for your own orders");
  }
  if (order.status !== "pending") {
    throw ApiError.conflict("Only pending orders can be paid");
  }

  const session = await getStripe().checkout.sessions.create({
    mode: "payment",
    customer_email: actor.email,
    line_items: order.items.map((item) => ({
      price_data: {
        currency: order.currency ?? env.currency,
        product_data: { name: item.name },
        unit_amount: Math.round(item.unitPrice * 100),
      },
      quantity: item.quantity,
    })),
    metadata: { orderId: order._id.toString() },
    ...checkoutUrls(),
  });

  await collection("transactions").updateOne(
    { orderId: order._id },
    { $set: { providerRef: session.id, updatedAt: new Date() } }
  );

  return { sessionId: session.id, url: session.url };
}

export async function listMyTransactions(actor, query = {}) {
  const { page, pageSize, skip, limit } = parsePagination(query);

  const filter = { userId: toObjectId(actor.id, "user id") };
  if (TRANSACTION_STATUSES.includes(query.status)) {
    filter.status = query.status;
  }

  const transactions = collection("transactions");
  const [docs, total] = await Promise.all([
    transactions
      .find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .toArray(),
    transactions.countDocuments(filter),
  ]);

  return pageResult(docs.map(serialize), total, { page, pageSize });
}

export async function getMySubscription(actor) {
  const vendor = await findVendorByOwner(actor.id);
  if (!vendor) throw ApiError.notFound("Vendor profile not found");

  const subscription = await collection("subscriptions").findOne({
    vendorId: vendor._id,
  });

  return serialize(subscription);
}

export async function createSubscriptionCheckout(actor) {
  if (!isStripeConfigured()) {
    throw ApiError.badRequest("Stripe is not configured");
  }
  if (!env.stripeSubscriptionPriceId) {
    throw ApiError.badRequest("STRIPE_SUBSCRIPTION_PRICE_ID is not configured");
  }

  const vendor = await findVendorByOwner(actor.id);
  if (!vendor) throw ApiError.notFound("Vendor profile not found");

  const session = await getStripe().checkout.sessions.create({
    mode: "subscription",
    customer_email: actor.email,
    line_items: [{ price: env.stripeSubscriptionPriceId, quantity: 1 }],
    metadata: { vendorId: vendor._id.toString() },
    ...checkoutUrls(),
  });

  return { sessionId: session.id, url: session.url };
}

export async function handleWebhook(rawBody, signature) {
  if (!isStripeConfigured() || !env.stripeWebhookSecret) {
    throw ApiError.badRequest("Stripe webhook is not configured");
  }

  let event;
  try {
    event = getStripe().webhooks.constructEvent(
      rawBody,
      signature,
      env.stripeWebhookSecret
    );
  } catch {
    throw ApiError.badRequest("Invalid Stripe signature");
  }

  switch (event.type) {
    case "checkout.session.completed":
      await onCheckoutCompleted(event.data.object);
      break;
    case "checkout.session.expired":
      await onCheckoutExpired(event.data.object);
      break;
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
      await saveSubscription(event.data.object);
      break;
    default:
      break;
  }

  return { received: true, type: event.type };
}

async function onCheckoutCompleted(session) {
  const orderId = session.metadata?.orderId;
  const vendorId = session.metadata?.vendorId;

  if (orderId && ObjectId.isValid(orderId)) {
    const _id = new ObjectId(orderId);

    await collection("orders").updateOne(
      { _id, status: "pending" },
      { $set: { status: "confirmed", updatedAt: new Date() } }
    );

    await collection("transactions").updateOne(
      { orderId: _id },
      {
        $set: {
          status: "succeeded",
          providerRef: stripeId(session.payment_intent) ?? session.id,
          updatedAt: new Date(),
        },
      }
    );
  }

  if (vendorId && ObjectId.isValid(vendorId) && session.subscription) {
    await saveSubscription({
      id: stripeId(session.subscription),
      customer: session.customer,
      status: "active",
      metadata: { vendorId },
      items: { data: [] },
    });
  }
}

async function onCheckoutExpired(session) {
  const orderId = session.metadata?.orderId;
  if (!orderId || !ObjectId.isValid(orderId)) return;

  await collection("transactions").updateOne(
    { orderId: new ObjectId(orderId), status: "pending" },
    { $set: { status: "failed", updatedAt: new Date() } }
  );
}

async function saveSubscription(subscription) {
  const patch = {
    status: SUBSCRIPTION_STATUS_MAP[subscription.status] ?? "cancelled",
    stripeCustomerId: stripeId(subscription.customer),
    stripeSubscriptionId: subscription.id,
    currentPeriodEnd: invoicePeriodEnd(subscription),
    updatedAt: new Date(),
  };

  const vendorId = subscription.metadata?.vendorId;
  if (vendorId && ObjectId.isValid(vendorId)) {
    const vendorObjectId = new ObjectId(vendorId);

    await collection("subscriptions").updateOne(
      { vendorId: vendorObjectId },
      {
        $set: patch,
        $setOnInsert: {
          vendorId: vendorObjectId,
          planId: env.stripeSubscriptionPriceId || null,
          createdAt: new Date(),
        },
      },
      { upsert: true }
    );
    return;
  }

  await collection("subscriptions").updateOne(
    { stripeSubscriptionId: subscription.id },
    { $set: patch }
  );
}
