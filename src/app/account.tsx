"use client";

import { type FormEvent, type ReactNode, useEffect, useState } from "react";

type User = { id: string; email: string };
export function AccountGate({ children }: { children: (email: string) => ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [signup, setSignup] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    fetch("/api/account").then(async (response) => {
      if (!response.ok) throw new Error("Could not check your session. Please reload.");
      setUser((await response.json()).user);
    }).catch((error) => setError(error.message)).finally(() => setLoading(false));
  }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/account", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: signup ? "signup" : "login", email: data.get("email"), password: data.get("password") }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setUser(result.user);
    } catch (error) { setError(error instanceof Error ? error.message : "Could not sign in."); }
    finally { setBusy(false); }
  }
  async function logout() {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/account", { method: "DELETE" });
      if (!response.ok) throw new Error("Could not sign out. Please try again.");
      setUser(null);
    } catch (error) { setError(error instanceof Error ? error.message : "Could not sign out."); }
    finally { setBusy(false); }
  }
  if (loading) return <main><p role="status">Loading your account…</p></main>;
  if (user) return <><div className="account-bar"><button disabled={busy} onClick={() => void logout()}>Sign out</button>{error && <p role="alert">{error}</p>}</div><div key={user.id}>{children(user.email)}</div></>;
  return <main className="auth-page"><p className="eyebrow">Newsfeed Studio</p><h1>Your news, saved.</h1><p className="intro">Keep your RSS feeds, Bluesky sources, and viewing history in your account.</p><form className="editor" onSubmit={submit}><h2>{signup ? "Create account" : "Sign in"}</h2><label>Email<input name="email" type="email" autoComplete="email" required maxLength={254} /></label><label>Password<input name="password" type="password" autoComplete={signup ? "new-password" : "current-password"} minLength={12} maxLength={128} required /></label><p className="status">Use 12–128 characters for your password.</p><button disabled={busy}>{busy ? "Please wait…" : signup ? "Create account" : "Sign in"}</button>{error && <p role="alert">{error}</p>}<button type="button" className="secondary" disabled={busy} onClick={() => { setSignup(!signup); setError(""); }}>{signup ? "Already have an account? Sign in" : "Create a new account"}</button></form></main>;
}

export function FeedSettings({ onSaved }: { onSaved: () => void }) {
  const [rss, setRss] = useState("");
  const [bluesky, setBluesky] = useState("");
  const [busy, setBusy] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    fetch("/api/feeds").then(async (response) => {
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      const feeds = result.feeds as { kind: string; value: string }[];
      setRss(feeds.filter((feed) => feed.kind === "rss").map((feed) => feed.value).join("\n"));
      setBluesky(feeds.filter((feed) => feed.kind === "bluesky").map((feed) => feed.value).join("\n"));
      setLoaded(true);
    }).catch((error) => setMessage(error.message)).finally(() => setBusy(false));
  }, []);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage("");
    const split = (value: string, kind: string) => value.split(/[\n,]/).map((value) => value.trim()).filter(Boolean).map((value) => ({ kind, value }));
    try {
      const response = await fetch("/api/feeds", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ feeds: [...split(rss, "rss"), ...split(bluesky, "bluesky")] }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setMessage("Feeds saved to your account."); onSaved();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not save feeds."); }
    finally { setBusy(false); }
  }
  return <details><summary>Manage your feeds</summary><form className="feed-settings" onSubmit={save}><label>RSS feed URLs<textarea value={rss} onChange={(event) => setRss(event.target.value)} placeholder="https://example.com/feed.xml" rows={4} disabled={busy || !loaded} /></label><label>Bluesky handles<textarea value={bluesky} onChange={(event) => setBluesky(event.target.value)} placeholder="name.bsky.social" rows={3} disabled={busy || !loaded} /></label><p className="status">One source per line. Remove a line to unsubscribe.</p><button disabled={busy || !loaded}>{busy ? "Loading…" : "Save feeds"}</button><p className="status" role="status">{message}</p></form></details>;
}
