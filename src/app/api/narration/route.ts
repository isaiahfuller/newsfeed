import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const { text } = await request.json() as { text?: unknown };
  if (typeof text !== "string" || !text.trim()) return NextResponse.json({ error: "Article text is required." }, { status: 400 });
  if (!process.env.OMNIVOICE_API_URL) return NextResponse.json({ error: "Set OMNIVOICE_API_URL in .env.local to your OmniVoice server." }, { status: 503 });
  try {
    const response = await fetch(new URL("/v1/audio/speech", process.env.OMNIVOICE_API_URL), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(process.env.OMNIVOICE_API_KEY ? { Authorization: `Bearer ${process.env.OMNIVOICE_API_KEY}` } : {}),
      },
      body: JSON.stringify({
        input: text.trim().slice(0, 4096),
        model: process.env.OMNIVOICE_VOICE || "Auto"
      }),
    });
    if (!response.ok) return NextResponse.json({ error: "OmniVoice generation failed.", detail: await response.text() }, { status: response.status });
    return new Response(response.body, { headers: { "Content-Type": response.headers.get("content-type") || "audio/wav", "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "OmniVoice could not be reached. Check OMNIVOICE_API_URL and the server network connection." }, { status: 502 });
  }
}
