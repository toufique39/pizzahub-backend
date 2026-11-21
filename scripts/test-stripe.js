import "dotenv/config";
import Stripe from "stripe";

const secretKey = process.env.STRIPE_SECRET_KEY;

if (!secretKey || !secretKey.startsWith("sk_test_")) {
  console.error("A valid Stripe Test Mode secret key is required.");
  process.exit(1);
}

try {
  const stripe = new Stripe(secretKey);

  // Retrieve test account balance to verify API authentication.
  const balance = await stripe.balance.retrieve();

  console.log("Stripe Test API connection: SUCCESS");
  console.log(
    "Available balance currencies:",
    balance.available.map((item) => item.currency).join(", ") || "None"
  );
} catch (error) {
  console.error("Stripe API connection failed:", error.message);
  process.exit(1);
}