import { createRemoteJWKSet, jwtVerify } from "jose";
import { getDB } from "../config/database.js";
import { ObjectId } from "mongodb";

let JWKS;

function getAuthConfig() {
  const authBaseURL = (
    process.env.BETTER_AUTH_URL ||
    process.env.AUTH_BASE_URL ||
    ""
  ).replace(/\/+$/, "");

  if (!authBaseURL) {
    throw new Error("BETTER_AUTH_URL is not configured.");
  }

  if (!JWKS) {
    JWKS = createRemoteJWKSet(
      new URL("/api/auth/jwks", authBaseURL)
    );
  }

  return { authBaseURL, JWKS };
}

export const verifyJWT = async (req, res, next) => {
  const authorization = req.headers.authorization;

  if (!authorization?.startsWith("Bearer ")) {
    return res.status(401).json({
      success: false,
      message: "Authentication token is required.",
    });
  }

  const token = authorization.slice(7).trim();

  if (!token) {
    return res.status(401).json({
      success: false,
      message: "Invalid authentication token.",
    });
  }

  let payload;

  try {
    const { authBaseURL, JWKS } = getAuthConfig();

    const verified = await jwtVerify(token, JWKS, {
      issuer: authBaseURL,
      audience: authBaseURL,
    });

    payload = verified.payload;
  } catch (error) {
    console.error("JWT verification failed:", error.message);

    return res.status(401).json({
      success: false,
      message: "Invalid or expired authentication token.",
    });
  }

  const userId =
    typeof payload.id === "string" ? payload.id : payload.sub;

  if (!userId || typeof userId !== "string") {
    return res.status(401).json({
      success: false,
      message: "Invalid user token.",
    });
  }

  // Fetch the latest user record, not just JWT claims.
  // This ensures recently blocked users are denied access.
  const db = getDB();
  const userCollection = db.collection("user");

  // Support string IDs and MongoDB ObjectId IDs.
  const idConditions = [{ _id: userId }, { id: userId }];

  if (ObjectId.isValid(userId)) {
    idConditions.push({ _id: new ObjectId(userId) });
  }

  const user = await userCollection.findOne(
    { $or: idConditions },
    {
      projection: {
        name: 1,
        email: 1,
        role: 1,
        isBlocked: 1,
      },
    }
  );

  if (!user) {
    console.error("User lookup failed:", {
      database: db.databaseName,
      collection: "user",
      userIdType: typeof userId,
      userIdLength: userId.length,
    });

    return res.status(401).json({
      success: false,
      message: "User account not found.",
    });
  }

  if (user.isBlocked === true) {
    return res.status(403).json({
      success: false,
      message: "Your account is blocked.",
    });
  }

  if (!["customer", "vendor", "admin"].includes(user.role)) {
    return res.status(403).json({
      success: false,
      message: "Invalid account role.",
    });
  }

  // Attach verified database user to request.
  req.user = {
    id: userId,
    name: user.name,
    email: user.email,
    role: user.role,
  };

  next();
};
