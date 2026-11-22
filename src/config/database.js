import { MongoClient } from "mongodb";

let client;
let database;
let connectionPromise;

export const connectDB = async () => {
  if (database) {
    return database;
  }

  if (connectionPromise) {
    return connectionPromise;
  }

  connectionPromise = (async () => {
    const MONGO_URI =
      process.env.MONGO_URI || process.env.MONGODB_URI;
    const MONGO_DB =
      process.env.MONGO_DB || process.env.MONGODB_DB || "pizzahub";

    if (!MONGO_URI) {
      throw new Error("MONGO_URI (or MONGODB_URI) is missing.");
    }

    client = new MongoClient(MONGO_URI, {
      serverSelectionTimeoutMS: 10000,
    });

    await client.connect();

    database = client.db(MONGO_DB);

    await database.command({ ping: 1 });

    console.log("MongoDB connected successfully!");
    console.log(`Database: ${MONGO_DB}`);

    return database;
  })();

  try {
    return await connectionPromise;
  } catch (error) {
    connectionPromise = null;

    throw error;
  }
};

export const getDB = () => {
  if (!database) {
    throw new Error("Database is not connected.");
  }

  return database;
};