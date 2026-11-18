import {
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);
const KEY_LENGTH = 64;

/**
 * Hash format: `scrypt$<salt>$<derivedKey>`
 */
export async function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const derivedKey = await scrypt(password, salt, KEY_LENGTH);
  return `scrypt$${salt}$${derivedKey.toString("hex")}`;
}

export async function verifyPassword(password, storedHash) {
  const [scheme, salt, hash] = String(storedHash ?? "").split("$");
  if (scheme !== "scrypt" || !salt || !hash) return false;

  const derivedKey = await scrypt(password, salt, KEY_LENGTH);
  const expected = Buffer.from(hash, "hex");

  return (
    expected.length === derivedKey.length &&
    timingSafeEqual(expected, derivedKey)
  );
}
