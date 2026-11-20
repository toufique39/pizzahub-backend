/**
 * Resolve a vendor's effective subscription plan.
 *
 * An expired Premium subscription is treated as Free, and unknown or
 * missing plans fall back to Free.
 */
export const normalizeSubscriptionPlan = (vendor) => {
  const plan = String(vendor?.subscriptionPlan || "free").toLowerCase();

  if (plan !== "premium") {
    return "free";
  }

  const expiresAt = vendor?.subscriptionExpiresAt;

  if (expiresAt) {
    const expiryTime = new Date(expiresAt).getTime();

    // Invalid dates are treated as expired rather than granting Premium.
    if (!Number.isFinite(expiryTime) || expiryTime <= Date.now()) {
      return "free";
    }
  }

  return "premium";
};
