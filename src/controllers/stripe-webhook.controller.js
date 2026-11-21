
import { ObjectId } from "mongodb";
import { getDB } from "../config/database.js";
import { getStripe } from "../config/stripe.js";

const getVendorFilter = (vendorId) => {
  const filters = [
    { _id: vendorId },
    { id: vendorId },
  ];

  if (ObjectId.isValid(vendorId)) {
    filters.push({ _id: new ObjectId(vendorId) });
  }

  return {
    $and: [
      { role: "vendor" },
      { $or: filters },
    ],
  };
};

const activatePremiumSubscription = async (session) => {
  const stripe = getStripe();
  const db = getDB();

  // Only subscription Checkout Sessions are supported.
  if (session.mode !== "subscription") {
    return;
  }

  // Never grant Premium for an unpaid Checkout Session.
  if (session.payment_status !== "paid") {
    console.log(
      `Checkout session ${session.id} is not paid. Premium not activated.`
    );
    return;
  }

  const vendorId = session.metadata?.vendorId;
  const subscriptionId =
    typeof session.subscription === "string"
      ? session.subscription
      : session.subscription?.id;

  if (!vendorId || !subscriptionId) {
    throw new Error(
      "Checkout Session is missing vendor or subscription metadata."
    );
  }

  if (
    session.client_reference_id &&
    session.client_reference_id !== vendorId
  ) {
    throw new Error("Checkout vendor identity mismatch.");
  }

  // Retrieve the actual subscription directly from Stripe.
  const subscription =
    await stripe.subscriptions.retrieve(subscriptionId);

  if (subscription.status !== "active") {
    throw new Error(
      `Subscription is not active. Current status: ${subscription.status}`
    );
  }

  const expectedPriceId = process.env.STRIPE_PREMIUM_PRICE_ID;

  const hasExpectedPrice = subscription.items.data.some(
    (item) => item.price.id === expectedPriceId
  );

  if (!expectedPriceId || !hasExpectedPrice) {
    throw new Error(
      "Subscription does not contain the configured Premium Price."
    );
  }

  // Current period end is available on subscription items.
  const periodEndSeconds = subscription.items.data.reduce(
    (latest, item) =>
      Math.max(latest, item.current_period_end || 0),
    0
  );

  if (!periodEndSeconds) {
    throw new Error("Subscription period end is unavailable.");
  }

  const subscriptionExpiresAt = new Date(
    periodEndSeconds * 1000
  );

  const users = db.collection("user");
  const transactions = db.collection("transactions");

  // Confirm that the vendor account exists.
  const vendor = await users.findOne(
    getVendorFilter(vendorId),
    {
      projection: {
        _id: 1,
        email: 1,
        role: 1,
      },
    }
  );

  if (!vendor) {
    throw new Error("Vendor account was not found.");
  }

  const customerId =
    typeof session.customer === "string"
      ? session.customer
      : session.customer?.id;

  // Store one transaction per Checkout Session.
  // A unique index on stripeSessionId prevents duplicate records.
 
const invoiceId =
  typeof session.invoice === "string"
    ? session.invoice
    : session.invoice?.id || null;

const transactionFilter = invoiceId
  ? { stripeInvoiceId: invoiceId }
  : { stripeSessionId: session.id };

await transactions.updateOne(
  transactionFilter,
  {
    $set: {
      vendorId,
      plan: "premium",
      amount: (session.amount_total || 0) / 100,
      currency: (session.currency || "usd").toUpperCase(),
      status: "paid",
      stripeSessionId: session.id,
      stripeSubscriptionId: subscriptionId,
      ...(invoiceId ? { stripeInvoiceId: invoiceId } : {}),
      updatedAt: new Date(),
    },
    $setOnInsert: {
      createdAt: new Date(session.created * 1000),
    },
  },
  { upsert: true }
);
;

  // Update the vendor only after the payment and subscription
  // have been verified with Stripe.
  await users.updateOne(
    {
      _id: vendor._id,
      role: "vendor",
    },
    {
      $set: {
        subscriptionPlan: "premium",
        subscriptionExpiresAt,
        stripeCustomerId: customerId || null,
        stripeSubscriptionId: subscriptionId,
        updatedAt: new Date(),
      },
    }
  );

  console.log(
    `Premium activated for vendor ${vendorId}.`
  );
};


const getSubscriptionPeriodEnd = (subscription) => {
  const itemPeriodEnds = (subscription.items?.data || [])
    .map((item) => item.current_period_end || 0);

  // Support older Stripe API versions too.
  const periodEnd = Math.max(
    ...itemPeriodEnds,
    subscription.current_period_end || 0
  );

  return periodEnd ? new Date(periodEnd * 1000) : null;
};

const findVendorForSubscription = async (db, subscription) => {
  const users = db.collection("user");

  // Prefer an exact subscription ID match.
  let vendor = await users.findOne({
    role: "vendor",
    stripeSubscriptionId: subscription.id,
  });

  // Support the case where subscription.updated arrives before
  // checkout.session.completed stores the subscription ID.
  if (!vendor && subscription.metadata?.vendorId) {
    vendor = await users.findOne(
      getVendorFilter(subscription.metadata.vendorId)
    );
  }

  if (!vendor) return null;

  // Never let an old subscription event overwrite a newer subscription.
  if (
    vendor.stripeSubscriptionId &&
    vendor.stripeSubscriptionId !== subscription.id
  ) {
    return null;
  }

  return vendor;
};

const syncVendorSubscriptionState = async (subscription) => {
  const db = getDB();
  const users = db.collection("user");

  const vendor = await findVendorForSubscription(db, subscription);

  if (!vendor) {
    console.log(
      `No matching vendor found for subscription ${subscription.id}.`
    );
    return null;
  }

  const expectedPriceId = process.env.STRIPE_PREMIUM_PRICE_ID;

  const hasPremiumPrice = subscription.items?.data?.some(
    (item) => item.price?.id === expectedPriceId
  );

  const customerId =
    typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer?.id;

  const updateData = {
    stripeSubscriptionId: subscription.id,
    subscriptionStatus: subscription.status,
    ubscriptionCancelAtPeriodEnd: false,
    stripeCustomerId: customerId || null,
    subscriptionCancelAtPeriodEnd: Boolean(
      subscription.cancel_at_period_end || subscription.cancel_at
    ),
    updatedAt: new Date(),
  };

  const unsetData = {};

  if (
    subscription.status === "active" &&
    hasPremiumPrice
  ) {
    const periodEnd = getSubscriptionPeriodEnd(subscription);

    if (!periodEnd) {
      throw new Error(
        "Active subscription is missing its billing period end."
      );
    }

    updateData.subscriptionPlan = "premium";
    updateData.subscriptionExpiresAt = periodEnd;

    unsetData.subscriptionPastDueAt = "";
  } else if (subscription.status === "past_due") {
    // Keep the existing plan during Stripe's retry period.
    // Do not grant Premium to an account that never paid.
    updateData.subscriptionPastDueAt = new Date();
  } else if (
    [
      "unpaid",
      "canceled",
      "incomplete_expired",
      "paused",
    ].includes(subscription.status) ||
    (subscription.status === "active" && !hasPremiumPrice)
  ) {
    updateData.subscriptionPlan = "free";
    updateData.subscriptionExpiresAt = new Date();
    updateData.subscriptionCancelAtPeriodEnd = false;

    unsetData.subscriptionPastDueAt = "";
  }

  const update = {
    $set: updateData,
  };

  if (Object.keys(unsetData).length > 0) {
    update.$unset = unsetData;
  }

  const result = await users.updateOne(
    {
      _id: vendor._id,
      role: "vendor",
      $or: [
        { stripeSubscriptionId: subscription.id },
        { stripeSubscriptionId: { $exists: false } },
        { stripeSubscriptionId: null },
      ],
    },
    update
  );

  if (result.matchedCount === 0) {
    console.log(
      `Subscription ${subscription.id} no longer belongs to this vendor.`
    );
    return null;
  }

  console.log(
    `Vendor subscription synced: ${subscription.id} (${subscription.status})`
  );

  return vendor;
};



const getInvoiceSubscriptionId = (invoice) => {
  const candidates = [
    invoice.parent?.subscription_details?.subscription,
    invoice.subscription,
    ...((invoice.lines?.data || []).map(
      (line) => line.parent?.subscription_item_details?.subscription
    )),
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string") return candidate;
    if (candidate?.id) return candidate.id;
  }

  return null;
};

const handleSubscriptionInvoice = async (invoiceEventObject) => {
  const stripe = getStripe();
  const db = getDB();

  const subscriptionId = getInvoiceSubscriptionId(
    invoiceEventObject
  );

  if (!subscriptionId) {
    console.log(
      `Invoice ${invoiceEventObject.id} is not linked to a subscription.`
    );
    return;
  }

  // Retrieve the latest invoice and subscription state from Stripe.
  // This helps avoid processing stale or out-of-order webhook data.
  const [invoice, subscription] = await Promise.all([
    stripe.invoices.retrieve(invoiceEventObject.id),
    stripe.subscriptions.retrieve(subscriptionId),
  ]);

  const hasPremiumPrice = subscription.items?.data?.some(
    (item) =>
      item.price?.id === process.env.STRIPE_PREMIUM_PRICE_ID
  );

  if (!hasPremiumPrice) {
    return;
  }

  const vendor = await syncVendorSubscriptionState(subscription);

  if (!vendor) {
    return;
  }

  // Read the latest invoice state instead of blindly trusting
  // the event type. A delayed failure event must not overwrite
  // a payment that has already succeeded.
  const paymentStatus =
    invoice.status === "paid" || invoice.paid === true
      ? "paid"
      : "failed";

  const amountInMinorUnits =
    paymentStatus === "paid"
      ? invoice.amount_paid
      : invoice.amount_due;

  // This project uses USD for its Premium test price.
  const amount = Number(amountInMinorUnits || 0) / 100;

  const vendorId =
    subscription.metadata?.vendorId ||
    vendor.id ||
    String(vendor._id);

  await db.collection("transactions").updateOne(
    {
      stripeInvoiceId: invoice.id,
    },
    {
      $set: {
        vendorId,
        plan: "premium",
        amount,
        currency: String(invoice.currency || "usd").toUpperCase(),
        status: paymentStatus,
        stripeInvoiceId: invoice.id,
        stripeSubscriptionId: subscription.id,
        updatedAt: new Date(),
      },
      $setOnInsert: {
        createdAt: new Date(invoice.created * 1000),
      },
    },
    {
      upsert: true,
    }
  );

  console.log(
    `Subscription invoice ${invoice.id} recorded as ${paymentStatus}.`
  );
};


// POST: Stripe webhook endpoint
export const handleStripeWebhook = async (req, res) => {
  const stripe = getStripe();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const signature = req.headers["stripe-signature"];

  if (!webhookSecret) {
    return res.status(500).json({
      success: false,
      message: "Stripe webhook secret is not configured.",
    });
  }

  let event;

  // Verify the Stripe signature against the original raw body.
  try {
    if (!Buffer.isBuffer(req.body)) {
      return res.status(400).json({
        success: false,
        message: "Webhook requires the original raw request body.",
      });
    }

    event = stripe.webhooks.constructEvent(
      req.body,
      signature,
      webhookSecret
    );
  } catch (error) {
    console.error(
      "Stripe webhook signature verification failed:",
      error.message
    );

    return res.status(400).json({
      success: false,
      message: "Invalid Stripe webhook signature.",
    });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded": {
        await activatePremiumSubscription(
          event.data.object
        );
        break;
      }

     case "customer.subscription.updated": {
  // Retrieve the current Stripe state to avoid stale event data.
  const subscription = await stripe.subscriptions.retrieve(
    event.data.object.id
  );

  await syncVendorSubscriptionState(subscription);
  break;
}

case "customer.subscription.deleted":
case "customer.subscription.paused": {
  // These events contain the subscription's changed state.
  await syncVendorSubscriptionState(event.data.object);
  break;
}

case "customer.subscription.resumed": {
  const subscription = await stripe.subscriptions.retrieve(
    event.data.object.id
  );

  await syncVendorSubscriptionState(subscription);
  break;
}

case "invoice.paid":
case "invoice.payment_failed": {
  await handleSubscriptionInvoice(event.data.object);
  break;
}


      default:
        console.log(
          `Stripe event received but not handled: ${event.type}`
        );
    }

    return res.status(200).json({
      received: true,
    });
  } catch (error) {
    console.error(
      "Stripe webhook processing failed:",
      error
    );

    // Return a failure so Stripe can retry delivery.
    return res.status(500).json({
      success: false,
      message: "Webhook processing failed.",
    });
  }
};
