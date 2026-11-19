import "dotenv/config";

import express from "express";
import cors from "cors";

import { connectDB, getDB } from "./config/database.js";
import { createDatabaseIndexes } from "./config/indexes.js";
import { verifyJWT } from "./middleware/auth.middleware.js";

const app = express();

const PORT =  5000;

// Allowed frontend origins
const allowedOrigins = (
  process.env.CLIENT_URL || "http://localhost:10000"
)
  .split(",")
  .map((origin) => origin.trim());

// Middlewares
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(new Error("Origin not allowed by CORS"));
    },
    credentials: true,
  })
);

app.use(express.json());


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

// Global error handler
app.use((error, req, res, next) => {
  console.error("Server Error:", error.message);

  res.status(500).json({
    success: false,
    message: "Internal server error.",
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