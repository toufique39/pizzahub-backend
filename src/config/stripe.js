import Stripe from "stripe";
import { env } from "./env.js";

let stripeClient;

export function isStripeConfigured() {
  return Boolean(env.stripeSecretKey);
}

export function getStripe() {
  if (!isStripeConfigured()) {
    throw new Error("Stripe is not configured. Set STRIPE_SECRET_KEY in .env.");
  }

  stripeClient ??= new Stripe(env.stripeSecretKey);
  return stripeClient;
}
