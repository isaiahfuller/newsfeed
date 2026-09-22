import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { currentUser, endSession, hashPassword, sameOrigin, startSession, verifyPassword } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET() {
  return NextResponse.json({ user: await currentUser() }, { headers: { "Cache-Control": "no-store" } });
}
export async function POST(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "Invalid origin." }, { status: 403 });
  const body = await request.json().catch(() => null);
  if (!body || !["signup", "login"].includes(body.action) || typeof body.email !== "string" || typeof body.password !== "string") {
    return NextResponse.json({ error: "Email and password are required." }, { status: 400 });
  }
  const email = body.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || body.password.length < 12 || body.password.length > 128) {
    return NextResponse.json({ error: "Use a valid email and a password of 12–128 characters." }, { status: 400 });
  }
  const now = Date.now();
  db().prepare("DELETE FROM login_attempts WHERE reset_at <= ?").run(now);
  const attempt = db().prepare("SELECT attempts FROM login_attempts WHERE email = ?").get(email);
  if (attempt && Number(attempt.attempts) >= 10) return NextResponse.json({ error: "Too many attempts. Try again in 15 minutes." }, { status: 429 });
  db().prepare(`INSERT INTO login_attempts VALUES (?, 1, ?) ON CONFLICT(email) DO UPDATE SET attempts = attempts + 1`).run(email, now + 900_000);
  let user = db().prepare("SELECT * FROM users WHERE email = ?").get(email) as { id: string; email: string; password_hash: string } | undefined;
  if (body.action === "signup") {
    const passwordHash = await hashPassword(body.password);
    const id = randomUUID();
    const inserted = db().prepare("INSERT OR IGNORE INTO users VALUES (?, ?, ?)").run(id, email, passwordHash);
    if (!inserted.changes) return NextResponse.json({ error: "An account already exists for that email. Sign in instead." }, { status: 409 });
    user = { id, email, password_hash: passwordHash };
  } else {
    const valid = await verifyPassword(body.password, user?.password_hash ?? `${"0".repeat(32)}:${"0".repeat(128)}`);
    if (!user || !valid) return NextResponse.json({ error: "Email or password is incorrect." }, { status: 401 });
  }
  db().prepare("DELETE FROM login_attempts WHERE email = ?").run(email);
  await startSession(user!.id);
  return NextResponse.json({ user: { id: user!.id, email } });
}
export async function DELETE(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "Invalid origin." }, { status: 403 });
  await endSession();
  return NextResponse.json({ ok: true });
}
