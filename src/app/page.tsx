"use client";

import { AccountGate, FeedSettings } from "@/app/account";
import { Player, type PlayerRef } from "@remotion/player";
import { useCallback, useEffect, useRef, useState } from "react";
import { defaultArticle, NewsArticle, NewsIntro } from "@/remotion/NewsIntro";

type FeedArticle = NewsArticle & { id: string; url?: string; viewed?: boolean };
type PreparedNarration = { article: FeedArticle; audioUrl: string; durationInFrames: number };
const fps = 30;
const configuredRefreshInterval = Number(process.env.NEXT_PUBLIC_FEED_REFRESH_MS || 300_000);
const refreshInterval = Number.isFinite(configuredRefreshInterval) && configuredRefreshInterval >= 60_000 ? configuredRefreshInterval : 300_000;

const getAudioDuration = (url: string) => new Promise<number>((resolve, reject) => {
  const audio = new Audio();
  audio.preload = "metadata";
  audio.onloadedmetadata = () => Number.isFinite(audio.duration) ? resolve(audio.duration) : reject(new Error("The audio duration is unavailable."));
  audio.onerror = () => reject(new Error("The generated audio could not be read."));
  audio.src = url;
});

const toPlaybackArticle = (article: FeedArticle): FeedArticle => ({
  ...article,
  scrollText: `${article.title}. ${article.narration || article.body}`.trim().slice(0, 4096),
});

export default function Home() {
  return <AccountGate>{(email) => <Studio email={email} />}</AccountGate>;
}

function Studio({ email }: { email: string }) {
  const [article, setArticle] = useState<FeedArticle>({ ...defaultArticle, id: "demo" });
  const [audioUrl, setAudioUrl] = useState<string>();
  const [durationInFrames, setDurationInFrames] = useState(450);
  const [articles, setArticles] = useState<FeedArticle[]>([]);
  const [status, setStatus] = useState("Add feeds to your account to begin.");
  const [isGenerating, setIsGenerating] = useState(false);
  const playerRef = useRef<PlayerRef>(null);
  const hasAutoplayedRef = useRef(false);
  const hasStartedInitialLoadRef = useRef(false);
  const preparedNarrationsRef = useRef(new Map<string, PreparedNarration>());

  useEffect(() => () => { if (audioUrl) URL.revokeObjectURL(audioUrl); }, [audioUrl]);
  useEffect(() => () => { preparedNarrationsRef.current.forEach((prepared) => URL.revokeObjectURL(prepared.audioUrl)); }, []);

  useEffect(() => {
    if (!audioUrl) return;
    const timer = window.setTimeout(() => {
      playerRef.current?.seekTo(0);
      playerRef.current?.play();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [audioUrl, durationInFrames]);

  const requestNarration = useCallback(async (nextArticle: FeedArticle): Promise<PreparedNarration> => {
    const response = await fetch("/api/narration", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: nextArticle.scrollText || `${nextArticle.title}. ${nextArticle.narration || nextArticle.body}` }) });
    if (!response.ok) {
      const result = await response.json().catch(() => ({ error: "Narration failed." }));
      throw new Error(result.error);
    }
    const nextAudioUrl = URL.createObjectURL(await response.blob());
    try {
      const seconds = await getAudioDuration(nextAudioUrl);
      return { article: nextArticle, audioUrl: nextAudioUrl, durationInFrames: Math.max(1, Math.ceil(seconds * fps)) };
    } catch (error) {
      URL.revokeObjectURL(nextAudioUrl);
      throw error;
    }
  }, []);

  const generateNarration = useCallback(async (nextArticle: FeedArticle) => {
    setIsGenerating(true);
    setStatus("Generating narration with OmniVoice…");
    try {
      const narration = await requestNarration(nextArticle);
      setDurationInFrames(narration.durationInFrames);
      setAudioUrl((current) => { if (current) URL.revokeObjectURL(current); return narration.audioUrl; });
      setStatus("Narration is ready. Starting the preview…");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Narration failed.");
    } finally {
      setIsGenerating(false);
    }
  }, [requestNarration]);

  const prepareNarration = useCallback(async (nextArticle: FeedArticle) => {
    if (preparedNarrationsRef.current.has(nextArticle.id)) return;
    try {
      const prepared = await requestNarration(toPlaybackArticle(nextArticle));
      preparedNarrationsRef.current.set(nextArticle.id, prepared);
    } catch {
      // If pre-generation fails, normal playback will retry this article at its turn.
    }
  }, [requestNarration]);

  const selectArticle = useCallback((nextArticle: FeedArticle) => {
    const selectedArticle = toPlaybackArticle(nextArticle);
    setArticle(selectedArticle);
    setAudioUrl(undefined);
    setDurationInFrames(450);
    void generateNarration(selectedArticle);
  }, [generateNarration]);

  const markViewed = useCallback(async (id: string) => {
    try {
      const response = await fetch("/api/viewed", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ articleId: id }) });
      if (!response.ok) throw new Error("Viewing history could not be saved. Please sign in again if your session expired.");
      setArticles((current) => current.map((item) => item.id === id ? { ...item, viewed: true } : item));
    } catch (error) { setStatus(error instanceof Error ? error.message : "Viewing history could not be saved."); }
  }, []);

  const playNextArticle = useCallback(() => {
    if (isGenerating) return;
    const currentIndex = articles.findIndex((item) => item.id === article.id);
    const nextArticle = articles.slice(currentIndex + 1).find((item) => !item.viewed);
    if (!nextArticle) {
      setStatus("Playlist complete. Waiting for the next feed refresh.");
      return;
    }
    const prepared = preparedNarrationsRef.current.get(nextArticle.id);
    if (prepared) {
      preparedNarrationsRef.current.delete(nextArticle.id);
      setArticle(prepared.article);
      setDurationInFrames(prepared.durationInFrames);
      setAudioUrl((current) => { if (current) URL.revokeObjectURL(current); return prepared.audioUrl; });
      setStatus("Next narration is ready. Starting the preview…");
      return;
    }
    selectArticle(nextArticle);
  }, [article.id, articles, isGenerating, selectArticle]);

  const loadArticles = useCallback(async (autoplay = false) => {
    setStatus("Loading feeds…");
    try {
      const response = await fetch("/api/articles");
      const result = await response.json();
      if (!response.ok) return setStatus(result.error ?? "Feeds could not be loaded.");
      setArticles(result.articles);
      const firstUnviewed = result.articles.find((item: FeedArticle) => !item.viewed);
      if (autoplay && !hasAutoplayedRef.current && firstUnviewed) {
        hasAutoplayedRef.current = true;
        selectArticle(firstUnviewed);
        return;
      }
      setStatus(result.articles.length ? "Feed updated. Choose an article to play." : "No articles available. Add or check your feeds below.");
    } catch { setStatus("Feeds could not be loaded. Please try again."); }
  }, [selectArticle]);

  useEffect(() => {
    if (!hasStartedInitialLoadRef.current) {
      hasStartedInitialLoadRef.current = true;
      void loadArticles(true);
    }
    const interval = window.setInterval(() => void loadArticles(), refreshInterval);
    return () => window.clearInterval(interval);
  }, [loadArticles]);

  useEffect(() => {
    if (!audioUrl || isGenerating) return;
    const currentIndex = articles.findIndex((item) => item.id === article.id);
    const nextArticle = articles.slice(currentIndex + 1).find((item) => !item.viewed);
    if (nextArticle) void prepareNarration(nextArticle);
  }, [article.id, articles, audioUrl, isGenerating, prepareNarration]);

  useEffect(() => {
    const player = playerRef.current;
    if (!player || !audioUrl) return;
    const onEnded = () => { void markViewed(article.id); playNextArticle(); };
    player.addEventListener("ended", onEnded);
    return () => player.removeEventListener("ended", onEnded);
  }, [article.id, audioUrl, markViewed, playNextArticle]);

  return (
    <main>
      <section className="hero">
        <p className="eyebrow">Newsfeed Studio · {email}</p>
        <h1>Feeds to news video.</h1>
        <p className="intro">Select an RSS or Bluesky story to automatically generate its OmniVoice narration and preview the bulletin.</p>
      </section>
      <div className="studio">
        <aside className="editor">
          <FeedSettings onSaved={() => { setArticles([]); hasAutoplayedRef.current = false; void loadArticles(true); }} />
          <button onClick={() => void loadArticles()}>Refresh feeds</button>
          <p className="status" aria-live="polite">{status}</p>
          <div className="articles">{articles.map((item) => <button className="article" key={item.id} disabled={isGenerating} onClick={() => selectArticle(item)}><strong>{item.viewed ? "Viewed · " : ""}{item.title}</strong><span>{item.source} · {item.publishedAt}</span></button>)}</div>
          <p className="disclosure">Narration is AI-generated by OmniVoice.</p>
        </aside>
        <Player ref={playerRef} key={audioUrl ?? article.id} component={NewsIntro} inputProps={{ article: { ...article, audioUrl } }} durationInFrames={durationInFrames} compositionWidth={1920} compositionHeight={1080} fps={fps} controls style={{ width: "100%", borderRadius: 16, overflow: "hidden" }} />
      </div>
    </main>
  );
}
