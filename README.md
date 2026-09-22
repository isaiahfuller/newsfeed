# Newsfeed Video Studio

A Next.js app that turns configured RSS and Bluesky posts into a Remotion news-video preview with OmniVoice narration.

The composition is rendered at 1920×1080 (1080p); the browser preview scales responsively to the available screen width.

## Start developing

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to preview the page and video player.

## Configure article sources and OmniVoice narration

Use Node.js 22.13 or newer. Create an account on the home page, then open **Manage your feeds** to save RSS URLs and Bluesky handles. Each account has its own sources and viewing history. Articles are marked viewed when playback finishes; automatic playback skips viewed articles and you can replay them manually. Bluesky sources use the public endpoint and need no Bluesky credentials.

Accounts, hashed passwords, expiring sessions, feeds, and viewed article IDs are stored in `data/newsfeed.sqlite` (ignored by Git). Back up the data directory. Set `DATABASE_PATH` to choose another persistent location. Deploy with a persistent disk and a single app instance; ephemeral/serverless filesystems are not supported by this local database setup. Production sessions require HTTPS. Email verification and password recovery are not included.

Existing `RSS_FEEDS` and `BLUESKY_HANDLES` environment variables are no longer read. Copy those sources into your account’s feed settings once. They are not automatically assigned to new accounts.

Copy `.env.example` to `.env.local` for server-side narration configuration.

Set `OMNIVOICE_API_URL` to the base URL of your [OmniVoice server](https://github.com/maemreyo/omnivoice-server). The app requests its `/v1/audio/speech` endpoint with the article text, then proxies the returned audio straight to the browser preview. Set `OMNIVOICE_API_KEY` only if your server expects a bearer token.

RSS items use their full embedded content where available. Otherwise, the app fetches the item’s linked HTML page and extracts its main article text before requesting narration. Bluesky posts are handled the same way: an attached external card, rich-text link, or URL in the post is followed and its article body is used when extraction succeeds. Selecting a feed item begins narration automatically.

The first unviewed item starts automatically after the first successful feed load. The source list refreshes every five minutes by default without interrupting playback; change `NEXT_PUBLIC_FEED_REFRESH_MS` to adjust that interval.

## Work with Remotion

```bash
npm run remotion:studio
npm run remotion:render
```

`remotion:studio` opens the Remotion editor. `remotion:render` writes the `NewsIntro` composition to `out/news-intro.mp4`.

Before commercial use, review the [Remotion license](https://www.remotion.dev/license) and, if appropriate for your organization, add `acknowledgeRemotionLicense` to the embedded `<Player />`.

## Verify account storage

Run `npm test` to build the app and check registration, login, per-account feeds and history, persistence across restarts, logout, and session expiration using a temporary database. Run `npm run lint` for lint checks.
