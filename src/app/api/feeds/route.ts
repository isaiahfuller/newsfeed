import { NextResponse } from "next/server";
import { currentUser, sameOrigin } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Sign in to manage feeds." }, { status: 401 });
  return NextResponse.json({ feeds: db().prepare("SELECT kind, value FROM feeds WHERE user_id = ? ORDER BY kind, value").all(user.id) });
}
export async function PUT(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "Invalid origin." }, { status: 403 });
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Sign in to manage feeds." }, { status: 401 });
  const body = await request.json().catch(() => null);
  if (!Array.isArray(body?.feeds) || body.feeds.length > 50) return NextResponse.json({ error: "Provide at most 50 feeds." }, { status: 400 });
  const feeds: { kind: string; value: string }[] = [];
  for (const feed of body.feeds) {
    if (!feed || typeof feed.value !== "string" || feed.value.length > 2048) return NextResponse.json({ error: "Invalid feed." }, { status: 400 });
    let value = feed.value.trim();
    if (feed.kind === "rss") {
      if (!URL.canParse(value) || !["https:", "http:"].includes(new URL(value).protocol) || new URL(value).username || new URL(value).password) return NextResponse.json({ error: "RSS feeds need an HTTP or HTTPS URL without credentials." }, { status: 400 });
      value = new URL(value).toString();
    } else if (feed.kind === "bluesky") {
      value = value.replace(/^@/, "").toLowerCase();
      if (!/^[a-z0-9][a-z0-9.-]*\.[a-z0-9-]+$/.test(value) || value.length > 253) return NextResponse.json({ error: "Enter a Bluesky handle such as name.bsky.social." }, { status: 400 });
    } else return NextResponse.json({ error: "Unknown feed type." }, { status: 400 });
    feeds.push({ kind: feed.kind, value });
  }
  const database = db();
  database.exec("BEGIN IMMEDIATE");
  try {
    database.prepare("DELETE FROM feeds WHERE user_id = ?").run(user.id);
    const insert = database.prepare("INSERT OR IGNORE INTO feeds VALUES (?, ?, ?)");
    for (const feed of feeds) insert.run(user.id, feed.kind, feed.value);
    database.exec("COMMIT");
  } catch (error) { database.exec("ROLLBACK"); throw error; }
  return NextResponse.json({ ok: true });
}
