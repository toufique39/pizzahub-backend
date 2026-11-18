import { MongoClient } from "mongodb";
import { env } from "./env.js";

let client;
let database;

/**
 * Connect once per process and make sure the indexes the app relies on exist.
 */
export async function connectDb() {
  if (database) return database;

  client = new MongoClient(env.mongoUri);
  await client.connect();
  database = client.db(env.mongoDbName);
  await ensureIndexes(database);

  return database;
}

export function getDb() {
  if (!database) {
    throw new Error("Database is not connected. Call connectDb() first.");
  }
  return database;
}

export function collection(name) {
  return getDb().collection(name);
}

export async function closeDb() {
  await client?.close();
  client = undefined;
  database = undefined;
}

async function ensureIndexes(db) {
  await Promise.all([
    db.collection("users").createIndex({ email: 1 }, { unique: true }),
    db.collection("users").createIndex({ role: 1 }),
    db.collection("vendors").createIndex({ ownerId: 1 }, { unique: true }),
    db.collection("vendors").createIndex({ status: 1 }),
    db.collection("menuItems").createIndex({ vendorId: 1, category: 1 }),
    db.collection("menuItems").createIndex({ name: "text", description: "text" }),
    db.collection("orders").createIndex({ customerId: 1, createdAt: -1 }),
    db.collection("orders").createIndex({ vendorId: 1, createdAt: -1 }),
    db.collection("orders").createIndex({ status: 1 }),
    db.collection("transactions").createIndex({ orderId: 1 }),
    db.collection("transactions").createIndex({ userId: 1, createdAt: -1 }),
    db.collection("subscriptions").createIndex({ vendorId: 1 }, { unique: true }),
    db.collection("subscriptions").createIndex({ stripeSubscriptionId: 1 }),
  ]);
}
