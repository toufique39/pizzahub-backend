import { collection } from "../config/db.js";
import { ApiError } from "../utils/api-error.js";
import { signToken, tokenPayload } from "../utils/jwt.js";
import { hashPassword, verifyPassword } from "../utils/password.js";
import { serializeUser } from "./user.service.js";

async function buildSession(user) {
  return {
    user: serializeUser(user),
    token: await signToken(tokenPayload(user)),
  };
}

export async function signUp({ name, email, password, role = "customer" }) {
  const normalizedEmail = email.trim().toLowerCase();

  const existing = await collection("users").findOne({
    email: normalizedEmail,
  });
  if (existing) {
    throw ApiError.conflict("An account with this email already exists");
  }

  const now = new Date();
  const doc = {
    name: name.trim(),
    email: normalizedEmail,
    passwordHash: await hashPassword(password),
    role,
    phone: null,
    image: null,
    createdAt: now,
    updatedAt: now,
  };

  const { insertedId } = await collection("users").insertOne(doc);
  return buildSession({ ...doc, _id: insertedId });
}

export async function signIn({ email, password }) {
  const user = await collection("users").findOne({
    email: email.trim().toLowerCase(),
  });

  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    throw ApiError.unauthorized("Invalid email or password");
  }

  return buildSession(user);
}
