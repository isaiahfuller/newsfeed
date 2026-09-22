import { NextResponse } from "next/server";
import { getBlueskyArticles, getRssArticles } from "@/lib/articles";

const configured = (value?: string) => value?.split(",").map((item) => item.trim()).filter(Boolean) ?? [];
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
  const rss = configured(process.env.RSS_FEEDS);
  const bluesky = configured(process.env.BLUESKY_HANDLES);
  if (!rss.length && !bluesky.length) return NextResponse.json({ articles: [] });
  const results = await Promise.allSettled([...rss.map(getRssArticles), ...bluesky.map(getBlueskyArticles)]);
  const seenUrls = new Set<string>();
  const articles = results
    .flatMap((result) => result.status === "fulfilled" ? result.value : [])
    .filter((article) => {
      const url = canonicalUrl(article.url);
      if (!url) return true;
      if (seenUrls.has(url)) return false;
      seenUrls.add(url);
      return true;
    });
  return NextResponse.json({ articles });
}
