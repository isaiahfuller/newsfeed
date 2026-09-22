import { AbsoluteFill, Audio, interpolate, useCurrentFrame, useVideoConfig } from "remotion";

export type NewsArticle = {
  title: string;
  body: string;
  narration?: string;
  scrollText?: string;
  source: string;
  publishedAt: string;
  audioUrl?: string;
};

export const defaultArticle: NewsArticle = {
  title: "The story starts here",
  body: "Choose an item from a configured RSS feed or Bluesky account to create a concise news bulletin.",
  source: "NEWSFEED DESK",
  publishedAt: "JUST NOW",
};

export const NewsIntro = ({ article = defaultArticle }: { article?: NewsArticle }) => {
  const frame = useCurrentFrame();
  const { durationInFrames, height } = useVideoConfig();
  const scale = height / 720;
  const opacity = interpolate(frame, [0, 18], [0, 1], { extrapolateRight: "clamp" });
  const translateY = interpolate(frame, [0, 25], [36, 0], { extrapolateRight: "clamp" });
  const scrollText = article.scrollText || article.narration || article.body;
  const estimatedTextHeight = Math.ceil(scrollText.length / 64) * 40 * scale;
  const scrollWindowHeight = 300 * scale;
  const scrollDistance = Math.max(0, estimatedTextHeight - scrollWindowHeight);
  const scrollY = interpolate(frame, [0, durationInFrames], [0, -scrollDistance]);

  return (
    <AbsoluteFill
      style={{
        background: "linear-gradient(135deg, #08111f 0%, #102c4e 100%)",
        color: "white",
        opacity,
      }}
    >
      {article.audioUrl ? <Audio src={article.audioUrl} /> : null}
      <div style={{ display: "flex", flex: 1, flexDirection: "column", justifyContent: "center", padding: `${48 * scale}px ${96 * scale}px`, transform: `translateY(${translateY * scale}px)` }}>
        <div style={{ color: "#56d6ff", fontSize: 18 * scale, fontWeight: 700, letterSpacing: 2 * scale }}>{article.source}</div>
        <h1 style={{ fontSize: 48 * scale, letterSpacing: -2 * scale, lineHeight: 1.02, margin: `${20 * scale}px 0 ${24 * scale}px` }}>{article.title}</h1>
        <div style={{ borderTop: "1px solid #395673", borderBottom: "1px solid #395673", height: scrollWindowHeight, overflow: "hidden", padding: `${22 * scale}px 0` }}>
          <p style={{ color: "#d3dfef", fontSize: 24 * scale, lineHeight: `${40 * scale}px`, margin: 0, transform: `translateY(${scrollY}px)`, whiteSpace: "pre-wrap" }}>{scrollText}</p>
        </div>
      </div>
      <div style={{ borderTop: "1px solid #395673", color: "#a9c5df", display: "flex", fontSize: 18 * scale, fontWeight: 700, justifyContent: "space-between", letterSpacing: 2 * scale, padding: `${24 * scale}px ${64 * scale}px` }}><span>NEWSFEED</span><span>{article.publishedAt}</span></div>
    </AbsoluteFill>
  );
};
