import { cookies } from "next/headers";
import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const SESSION_COOKIE = "rc_session";
const SESSION_MAX_AGE = 60 * 60 * 24 * 90; // 90 days

function getEncryptionKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY;
  if (!key || key.length < 32) {
    throw new Error("ENCRYPTION_KEY env var must be at least 32 characters");
  }
  // Derive a 32-byte key from the env var
  return crypto.createHash("sha256").update(key).digest();
}

/** Encrypt a plaintext string. Returns "iv:authTag:ciphertext" in hex. */
export function encrypt(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted.toString("hex")}`;
}

/** Decrypt a string produced by encrypt(). */
export function decrypt(ciphertext: string): string {
  const key = getEncryptionKey();
  const [ivHex, authTagHex, encHex] = ciphertext.split(":");
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");
  const encrypted = Buffer.from(encHex, "hex");
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString("utf8");
}

/** Create a signed session token containing the user ID. */
export function createSessionToken(userId: string): string {
  const payload = JSON.stringify({ userId, exp: Date.now() + SESSION_MAX_AGE * 1000 });
  return encrypt(payload);
}

/** Verify and decode a session token. Returns userId or null. */
export function verifySessionToken(token: string): string | null {
  try {
    const json = decrypt(token);
    const { userId, exp } = JSON.parse(json);
    if (typeof exp === "number" && Date.now() > exp) return null;
    return userId as string;
  } catch {
    return null;
  }
}

/** Set the session cookie. */
export async function setSessionCookie(userId: string) {
  const token = createSessionToken(userId);
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SESSION_MAX_AGE,
    path: "/",
  });
}

/** Read the session cookie and return the userId, or null. */
export async function getSessionUserId(): Promise<string | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

/** Clear the session cookie. */
export async function clearSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}
