import cors from "cors";
import express from "express";
import { assertConfig, env } from "./config/env.js";
import { closeDb, connectDb } from "./config/db.js";
import { webhook } from "./controllers/payment.controller.js";
import { errorHandler } from "./middleware/error-handler.js";
import { notFound } from "./middleware/not-found.js";
import apiRoutes from "./routes/index.js";

assertConfig();

const app = express();

app.disable("x-powered-by");
app.set("trust proxy", 1);

app.use(
  cors({
    origin: env.clientUrls.length > 0 ? env.clientUrls : true,
    credentials: true,
  })
);

// Stripe needs the untouched request body, so this route must run before
// the JSON parser below.
app.post(
  `${env.apiPrefix}/payments/webhook`,
  express.raw({ type: "application/json" }),
  webhook
);

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

app.get("/", (_req, res) => {
  res.json({
    name: "PizzaHub API",
    version: "1.0.0",
    health: `${env.apiPrefix}/health`,
  });
});

app.use(env.apiPrefix, apiRoutes);

app.use(notFound);
app.use(errorHandler);

async function start() {
  await connectDb();

  const server = app.listen(env.port, () => {
    console.log(
      `PizzaHub API listening on http://localhost:${env.port}${env.apiPrefix} [${env.nodeEnv}]`
    );
  });

  const shutdown = (signal) => {
    console.log(`${signal} received, shutting down...`);
    server.close(async () => {
      await closeDb();
      process.exit(0);
    });
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled promise rejection:", reason);
});

start().catch((error) => {
  console.error("Failed to start PizzaHub API:", error);
  process.exit(1);
});

export default app;
