import { NextResponse } from "next/server";
import { getBlueskyArticles, getRssArticles } from "@/lib/articles";

import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
const trackingParameters = ["fbclid", "gclid", "mc_cid", "mc_eid"];

const canonicalUrl = (value?: string) => {
  if (!value || !URL.canParse(value)) return undefined;
  const url = new URL(value);
  url.hash = "";
  for (const key of [...url.searchParams.keys()]) {
    if (key.startsWith("utm_") || trackingParameters.includes(key)) url.searchParams.delete(key);
  }
  return url.toString();
};

export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Sign in to load your feeds." }, { status: 401 });
  const feeds = db().prepare("SELECT kind, value FROM feeds WHERE user_id = ?").all(user.id) as { kind: string; value: string }[];
  const rss = feeds.filter((feed) => feed.kind === "rss").map((feed) => feed.value);
  const bluesky = feeds.filter((feed) => feed.kind === "bluesky").map((feed) => feed.value);
  if (!rss.length && !bluesky.length) return NextResponse.json({ articles: [] });
  const results = await Promise.allSettled([...rss.map(getRssArticles), ...bluesky.map(getBlueskyArticles)]);
  const seenUrls = new Set<string>();
  const articles = results
    .flatMap((result) => result.status === "fulfilled" ? result.value : [])
    .sort((a, b) => ((b.publishedTimestamp ?? -Infinity) - (a.publishedTimestamp ?? -Infinity)) || a.id.localeCompare(b.id))
    .filter((article) => {
      const url = canonicalUrl(article.url);
      if (!url) return true;
      if (seenUrls.has(url)) return false;
      seenUrls.add(url);
      return true;
    });
  const viewed = new Set(db().prepare("SELECT article_id FROM viewed_articles WHERE user_id = ?").all(user.id).map((row) => row.article_id));
  return NextResponse.json({ articles: articles.map((article) => {
    const id = canonicalUrl(article.url) || article.id;
    return { ...article, id, viewed: viewed.has(id) };
  }) }, { headers: { "Cache-Control": "no-store" } });
}
