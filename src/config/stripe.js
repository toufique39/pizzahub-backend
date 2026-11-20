import Stripe from "stripe";

let stripeInstance;

export const getStripe = () => {
  const secretKey = process.env.STRIPE_SECRET_KEY;

  if (!secretKey) {
    throw new Error("STRIPE_SECRET_KEY is not configured.");
  }

  // Keep the integration in test mode during development.
  if (!secretKey.startsWith("sk_test_")) {
    throw new Error(
      "Please use a Stripe Test Mode secret key during development."
    );
  }

  if (!stripeInstance) {
    stripeInstance = new Stripe(secretKey);
  }

  return stripeInstance;
};