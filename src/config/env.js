import "dotenv/config";

function toInt(value, fallback) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toList(value) {
  return String(value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  isProduction: process.env.NODE_ENV === "production",
  port: toInt(process.env.PORT, 5000),
  apiPrefix: process.env.API_PREFIX ?? "/api",
  clientUrls: toList(
    process.env.CLIENT_URLS ?? process.env.CLIENT_URL ?? "http://localhost:10000"
  ),
  mongoUri: process.env.MONGODB_URI ?? "mongodb://127.0.0.1:27017",
  mongoDbName: process.env.MONGODB_DB ?? "pizzahub",
  jwtSecret: process.env.JWT_SECRET ?? "dev-only-change-me",
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? "7d",
  currency: process.env.DEFAULT_CURRENCY ?? "usd",
  stripeSecretKey: process.env.STRIPE_SECRET_KEY ?? "",
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? "",
  stripeSubscriptionPriceId: process.env.STRIPE_SUBSCRIPTION_PRICE_ID ?? "",
};

/**
 * Fail fast on unsafe configuration instead of silently running with defaults.
 */
export function assertConfig() {
  if (env.isProduction && env.jwtSecret === "dev-only-change-me") {
    throw new Error("JWT_SECRET must be set to a strong secret in production");
  }
}
