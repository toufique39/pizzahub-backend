import { getDB } from "./database.js";

export const createDatabaseIndexes = async () => {
  const db = getDB();

  // Menu Items Indexes
  await Promise.all([
    db.collection("menuItems").createIndex(
      { vendorId: 1, createdAt: -1 },
      { name: "vendor_menu_items" }
    ),

    db.collection("menuItems").createIndex(
      { status: 1, isAvailable: 1, price: 1 },
      { name: "menu_status_availability_price" }
    ),

    db.collection("menuItems").createIndex(
      { "location.city": 1, "location.area": 1 },
      { name: "menu_location" }
    ),

    // Customer Orders
    db.collection("orders").createIndex(
      { customerId: 1, createdAt: -1 },
      { name: "customer_orders" }
    ),

    // Vendor Orders
    db.collection("orders").createIndex(
      { vendorId: 1, status: 1, createdAt: -1 },
      { name: "vendor_orders" }
    ),

    // Transaction Lookup
    db.collection("transactions").createIndex(
      { stripeSessionId: 1 },
      {
        unique: true,
        sparse: true,
        name: "unique_stripe_session"
      }
    ),

    db.collection("transactions").createIndex(
      { vendorId: 1, createdAt: -1 },
      { name: "vendor_transactions" }
    ),
  ]);

  console.log("PizzaHub database indexes created successfully!");
};