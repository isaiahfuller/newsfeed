import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { cookies } from "next/headers";
import { db } from "./db";

const deriveKey = promisify(scrypt);
const cookieName = "newsfeed_session";
const lifetime = 60 * 60 * 24 * 30;
const digest = (token: string) => createHash("sha256").update(token).digest("hex");
export type User = { id: string; email: string };

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = await deriveKey(password, salt, 64) as Buffer;
  return `${salt}:${hash.toString("hex")}`;
}
export async function verifyPassword(password: string, stored: string) {
  const [salt, hex] = stored.split(":");
  const hash = await deriveKey(password, salt, 64) as Buffer;
  const expected = Buffer.from(hex, "hex");
  return hash.length === expected.length && timingSafeEqual(hash, expected);
}
export async function currentUser(): Promise<User | null> {
  const token = (await cookies()).get(cookieName)?.value;
  if (!token) return null;
  return db().prepare(`SELECT users.id, users.email FROM sessions JOIN users ON users.id = sessions.user_id
    WHERE token_hash = ? AND expires_at > ?`).get(digest(token), Date.now()) as User | undefined ?? null;
}
export async function endSession() {
  const jar = await cookies();
  const token = jar.get(cookieName)?.value;
  if (token) db().prepare("DELETE FROM sessions WHERE token_hash = ?").run(digest(token));
  jar.delete(cookieName);
}
export async function startSession(userId: string) {
  await endSession();
  const token = randomBytes(32).toString("hex");
  db().prepare("DELETE FROM sessions WHERE expires_at <= ?").run(Date.now());
  db().prepare("INSERT INTO sessions VALUES (?, ?, ?)").run(digest(token), userId, Date.now() + lifetime * 1000);
  (await cookies()).set(cookieName, token, {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: lifetime,
  });
}
export function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
}
