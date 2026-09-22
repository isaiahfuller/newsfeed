# Newsfeed Video Studio

A Next.js app that turns configured RSS and Bluesky posts into a Remotion news-video preview with OmniVoice narration.

The composition is rendered at 1920×1080 (1080p); the browser preview scales responsively to the available screen width.

## Start developing

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to preview the page and video player.

## Configure article sources and OmniVoice narration

Copy `.env.example` to `.env.local`, then set comma-separated `RSS_FEEDS` URLs and/or `BLUESKY_HANDLES`. The app uses Bluesky's public profile-feed endpoint; it needs no account credentials.

Set `OMNIVOICE_API_URL` to the base URL of your OmniVoice server. The app requests its `/v1/audio/speech` endpoint with the article text, then proxies the returned audio straight to the browser preview. Set `OMNIVOICE_API_KEY` only if your server expects a bearer token.

RSS items use their full embedded content where available. Otherwise, the app fetches the item’s linked HTML page and extracts its main article text before requesting narration. Bluesky posts are handled the same way: an attached external card, rich-text link, or URL in the post is followed and its article body is used when extraction succeeds. Selecting a feed item begins narration automatically.

The newest item starts automatically after the first successful feed load. The source list refreshes every five minutes by default without interrupting playback; change `NEXT_PUBLIC_FEED_REFRESH_MS` to adjust that interval.

## Work with Remotion

```bash
npm run remotion:studio
npm run remotion:render
```

`remotion:studio` opens the Remotion editor. `remotion:render` writes the `NewsIntro` composition to `out/news-intro.mp4`.

Before commercial use, review the [Remotion license](https://www.remotion.dev/license) and, if appropriate for your organization, add `acknowledgeRemotionLicense` to the embedded `<Player />`.
