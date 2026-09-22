import { XMLParser } from "fast-xml-parser";
import { Readability } from "@mozilla/readability";
import { JSDOM } from "jsdom";
import type { NewsArticle } from "@/remotion/NewsIntro";

export type FeedArticle = NewsArticle & { id: string; url?: string };

const value = (input: unknown): string => {
  if (typeof input === "string") return input;
  if (input && typeof input === "object" && "#text" in input && typeof input["#text" as keyof typeof input] === "string") return input["#text" as keyof typeof input] as string;
  return "";
};
const list = (input: unknown) => (Array.isArray(input) ? input : input ? [input] : []);
const clean = (input: string) => input.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
const formatPublishedAt = (input: string) => {
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return "RECENTLY";
  return `${date.toISOString().slice(0, 16).replace("T", " ")} UTC`;
};

const itemUrl = (input: unknown) => {
  if (typeof input === "string") return input;
  if (Array.isArray(input)) return itemUrl(input.find((item) => typeof item === "object" && item && "@_rel" in item ? item["@_rel" as keyof typeof item] === "alternate" : true));
  if (input && typeof input === "object" && "@_href" in input && typeof input["@_href" as keyof typeof input] === "string") return input["@_href" as keyof typeof input] as string;
  return undefined;
};

async function extractArticle(url?: string) {
  if (!url || !URL.canParse(url)) return "";
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(12_000), headers: { "User-Agent": "NewsfeedStudio/1.0" }, next: { revalidate: 300 } });
    if (!response.ok || !response.headers.get("content-type")?.includes("text/html")) return "";
    const document = new JSDOM(await response.text(), { url }).window.document;
    return clean(new Readability(document).parse()?.textContent ?? "");
  } catch {
    return "";
  }
}

export async function getRssArticles(url: string): Promise<FeedArticle[]> {
  const response = await fetch(url, { next: { revalidate: 300 } });
  if (!response.ok) throw new Error(`RSS request failed: ${response.status}`);
  const parsed = new XMLParser({ ignoreAttributes: false }).parse(await response.text());
  const channel = parsed.rss?.channel ?? parsed.feed ?? {};
  const source = value(channel.title) || new URL(url).hostname;
  return Promise.all(list(channel.item ?? channel.entry).slice(0, 10).map(async (item: Record<string, unknown>, index) => {
    const url = itemUrl(item.link);
    const feedContent = clean(value(item["content:encoded"]) || value(item.content) || value(item.summary) || value(item.description));
    const fullText = feedContent.length > 800 ? feedContent : await extractArticle(url);
    const narration = fullText || feedContent;
    return {
      id: `rss-${url}-${index}`,
      title: clean(value(item.title)) || "Untitled story",
      body: (narration || "No article text was available from this feed.").slice(0, 700),
      narration,
      source,
      publishedAt: formatPublishedAt(value(item.pubDate) || value(item.published)),
      url,
    };
  }));
}

export async function getBlueskyArticles(handle: string): Promise<FeedArticle[]> {
  const url = new URL("https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed");
  url.searchParams.set("actor", handle);
  url.searchParams.set("limit", "10");
  const response = await fetch(url, { next: { revalidate: 300 } });
  if (!response.ok) throw new Error(`Bluesky request failed: ${response.status}`);
  const data = await response.json() as { feed?: Array<{ post: {
    uri: string;
    record: { text?: string; createdAt?: string; facets?: Array<{ features?: Array<{ uri?: string }> }> };
    author: { displayName?: string; handle: string };
    embed?: { external?: { uri?: string; title?: string; description?: string } };
  } }> };
  const linkedPosts = (data.feed ?? []).flatMap(({ post }) => {
    const text = clean(post.record.text ?? "");
    const linkedArticle = post.embed?.external;
    const facetUrl = post.record.facets?.flatMap((facet) => facet.features ?? []).find((feature) => feature.uri)?.uri;
    const textUrl = text.match(/https?:\/\/[^\s]+/)?.[0];
    const url = linkedArticle?.uri || facetUrl || textUrl;
    if (!url || !URL.canParse(url) || !["http:", "https:"].includes(new URL(url).protocol)) return [];
    return [{ post, url }];
  });
  return Promise.all(linkedPosts.map(async ({ post, url }) => {
    const text = clean(post.record.text ?? "");
    const linkedArticle = post.embed?.external;
    const fullText = await extractArticle(url);
    const narration = fullText || clean(linkedArticle?.description || text);
    return {
      id: post.uri,
      title: clean(linkedArticle?.title || text || "Bluesky post").slice(0, 180),
      body: (narration || "No article text was available from this post.").slice(0, 700),
      narration,
      source: post.author.displayName || `@${post.author.handle}`,
      publishedAt: formatPublishedAt(post.record.createdAt || ""),
      url,
    };
  }));
}
