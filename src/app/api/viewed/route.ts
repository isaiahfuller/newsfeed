import { NextResponse } from "next/server";
import { currentUser, sameOrigin } from "@/lib/auth";
import { db } from "@/lib/db";

export async function POST(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "Invalid origin." }, { status: 403 });
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Sign in to save viewing history." }, { status: 401 });
  const body = await request.json().catch(() => null);
  if (typeof body?.articleId !== "string" || !body.articleId || body.articleId.length > 4096) return NextResponse.json({ error: "Invalid article ID." }, { status: 400 });
  db().prepare(`INSERT INTO viewed_articles VALUES (?, ?, ?) ON CONFLICT(user_id, article_id) DO UPDATE SET viewed_at = excluded.viewed_at`).run(user.id, body.articleId, Date.now());
  return NextResponse.json({ ok: true });
}
