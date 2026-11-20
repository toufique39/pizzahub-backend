import "dotenv/config";
import express from "express";
import cors from "cors";
import { connectDB, getDB } from "./config/database.js";
import { createDatabaseIndexes } from "./config/indexes.js";
import { verifyJWT } from "./middleware/auth.middleware.js";
import menuRoutes from "./routes/menu.routes.js";
import orderRoutes from "./routes/orders.routes.js";
import vendorRoutes from "./routes/vendor.routes.js";
import adminRoutes from "./routes/admin.routes.js";

const app = express();

const PORT = 5000;

// Allowed frontend origins
const allowedOrigins = (
  process.env.CLIENT_URLS ||
  process.env.CLIENT_URL ||
  "http://localhost:10000"
)
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

// Middlewares
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      const error = new Error("Origin not allowed by CORS.");
      error.status = 403;

      return callback(error);
    },
    credentials: true,
  })
);



app.use(express.json());
app.use("/api/menu-items", menuRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/vendor", vendorRoutes);
app.use("/api/admin", adminRoutes);



// Root route
app.get("/", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Welcome to PizzaHub API!",
  });
});

// Server health check
app.get("/api/health", (req, res) => {
  res.status(200).json({
    success: true,
    message: "PizzaHub API is running.",
  });
});

// Database health check
app.get("/api/health/db", async (req, res) => {
  try {
    const db = getDB();

    await db.command({ ping: 1 });

    res.status(200).json({
      success: true,
      message: "MongoDB connection is working.",
      database: db.databaseName,
    });
  } catch (error) {
    console.error("Database health check failed:", error);

    res.status(500).json({
      success: false,
      message: "Database connection failed.",
    });
  }
});

// Protected authentication test
app.get("/api/auth/me", verifyJWT, (req, res) => {
  res.status(200).json({
    success: true,
    message: "Authentication successful.",
    user: req.user,
  });
});

// Unknown routes
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found.",
  });
});

// Global error handler
app.use((error, req, res, next) => {
  // If the response has already started, let Express finish it.
  if (res.headersSent) {
    return next(error);
  }

  const isMulterError = error?.name === "MulterError";
  const rawStatus = Number(error?.status || error?.statusCode);
  const status =
    Number.isInteger(rawStatus) && rawStatus >= 400 && rawStatus <= 599
      ? rawStatus
      : isMulterError
        ? 400
        : 500;

  if (status >= 500) {
    console.error("Server Error:", error);
  }

  res.status(status).json({
    success: false,
    message:
      status >= 500
        ? "Internal server error."
        : error?.message || "Request failed.",
  });
});

// Start server
const startServer = async () => {

  
  try {
    await connectDB();
await createDatabaseIndexes();

    app.listen(PORT, () => {
      console.log(`PizzaHub API running on port ${PORT}`);
      console.log(`http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error("Server startup failed:", error.message);
    process.exit(1);
  }
};

startServer();