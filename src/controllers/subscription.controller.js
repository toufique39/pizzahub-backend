
import { ObjectId } from "mongodb";
import { getDB } from "../config/database.js";
import { getStripe } from "../config/stripe.js";

const getUserFilter = (userId) => {
  const filters = [
    { _id: userId },
    { id: userId },
  ];

  if (ObjectId.isValid(userId)) {
    filters.push({ _id: new ObjectId(userId) });
  }

  return { $or: filters };
};

// POST: Create Premium subscription Checkout Session
export const createPremiumCheckoutSession = async (req, res, next) => {
  try {
    const db = getDB();
    const vendorId = req.user.id;

    const priceId = process.env.STRIPE_PREMIUM_PRICE_ID;
    const clientUrl = process.env.CLIENT_URL;

    if (!priceId) {
      return res.status(500).json({
        success: false,
        message: "Stripe Premium Price ID is not configured.",
      });
    }

    if (!clientUrl) {
      return res.status(500).json({
        success: false,
        message: "Client URL is not configured.",
      });
    }

    const parsedClientUrl = new URL(clientUrl);

    const allowedProtocols =
      parsedClientUrl.protocol === "https:" ||
      parsedClientUrl.hostname === "localhost";

    if (!allowedProtocols) {
      return res.status(500).json({
        success: false,
        message: "Invalid client URL configuration.",
      });
    }

    const users = db.collection("user");

    // Always get the vendor from the authenticated session.
    const vendor = await users.findOne(
      getUserFilter(vendorId),
      {
        projection: {
          name: 1,
          email: 1,
          role: 1,
          subscriptionPlan: 1,
          subscriptionExpiresAt: 1,
        },
      }
    );

    if (!vendor || vendor.role !== "vendor") {
      return res.status(403).json({
        success: false,
        message: "Only vendors can purchase Premium.",
      });
    }

    // Prevent creating another subscription for an active Premium vendor.
    const currentPlan = String(
      vendor.subscriptionPlan || "free"
    ).toLowerCase();

    const expiryTime = vendor.subscriptionExpiresAt
      ? new Date(vendor.subscriptionExpiresAt).getTime()
      : null;

    const hasActivePremium =
      currentPlan === "premium" &&
      (expiryTime === null ||
        (Number.isFinite(expiryTime) && expiryTime > Date.now()));

    if (hasActivePremium) {
      return res.status(409).json({
        success: false,
        message: "You already have an active Premium subscription.",
      });
    }

    const stripe = getStripe();

    // Verify that the configured Price exists, is active,
    // and is a monthly recurring price.
    const price = await stripe.prices.retrieve(priceId);

    if (
      !price.active ||
      !price.recurring ||
      price.recurring.interval !== "month"
    ) {
      return res.status(400).json({
        success: false,
        message: "Configured Premium Price must be an active monthly recurring price.",
      });
    }

    const baseUrl = parsedClientUrl.origin;

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",

      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],

      customer_email: vendor.email,

      client_reference_id: vendorId,

      metadata: {
        vendorId,
        plan: "premium",
      },

      subscription_data: {
        metadata: {
          vendorId,
          plan: "premium",
        },
      },

      success_url:
        `${baseUrl}/payment-success?session_id={CHECKOUT_SESSION_ID}`,

      cancel_url:
        `${baseUrl}/payment-cancel`,
    });

    if (!session.url) {
      throw new Error("Stripe did not return a Checkout URL.");
    }

    res.status(201).json({
      success: true,
      message: "Premium Checkout Session created successfully.",
      data: {
        checkoutUrl: session.url,
        sessionId: session.id,
      },
    });
  } catch (error) {
    next(error);
  }
};



export const cancelPremiumSubscription = async (req, res, next) => {
  try {
    const db = getDB();
    const vendorId = req.user.id;

    const vendor = await db.collection("user").findOne(
      getUserFilter(vendorId),
      {
        projection: {
          role: 1,
          stripeSubscriptionId: 1,
          subscriptionPlan: 1,
          subscriptionCancelAtPeriodEnd: 1,
        },
      }
    );

    if (!vendor || vendor.role !== "vendor") {
      return res.status(403).json({
        success: false,
        message: "Only vendors can manage subscriptions.",
      });
    }

    if (!vendor.stripeSubscriptionId) {
      return res.status(409).json({
        success: false,
        message: "No active Stripe subscription was found.",
      });
    }

    const stripe = getStripe();

    const currentSubscription =
      await stripe.subscriptions.retrieve(
        vendor.stripeSubscriptionId
      );

    if (currentSubscription.cancel_at_period_end) {
      return res.status(200).json({
        success: true,
        message: "Cancellation is already scheduled.",
        data: {
          cancelAtPeriodEnd: true,
        },
      });
    }

    if (
      !["active", "trialing", "past_due"].includes(
        currentSubscription.status
      )
    ) {
      return res.status(409).json({
        success: false,
        message: "This subscription cannot be cancelled in its current state.",
      });
    }

    // Schedule cancellation at the end of the current billing period.
    const updatedSubscription =
      await stripe.subscriptions.update(
        vendor.stripeSubscriptionId,
        {
          cancel_at_period_end: true,
        }
      );

    const periodEnd = updatedSubscription.items.data.reduce(
      (latest, item) =>
        Math.max(latest, item.current_period_end || 0),
      0
    );

    const subscriptionExpiry = periodEnd
      ? new Date(periodEnd * 1000)
      : null;

    // Update local UI state after Stripe confirms the request.
    await db.collection("user").updateOne(
      { _id: vendor._id, role: "vendor" },
      {
        $set: {
          subscriptionStatus: updatedSubscription.status,
          subscriptionCancelAtPeriodEnd: true,
          ...(subscriptionExpiry
            ? { subscriptionExpiresAt: subscriptionExpiry }
            : {}),
          updatedAt: new Date(),
        },
      }
    );

    res.status(200).json({
      success: true,
      message:
        "Subscription cancellation scheduled. Your Premium access remains active until the current billing period ends.",
      data: {
        cancelAtPeriodEnd: true,
        subscriptionExpiresAt: subscriptionExpiry,
      },
    });
  } catch (error) {
    next(error);
  }
};