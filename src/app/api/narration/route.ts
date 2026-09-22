import { NextResponse } from "next/server";
import { currentUser, sameOrigin } from "@/lib/auth";

export async function POST(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "Invalid origin." }, { status: 403 });
  if (!await currentUser()) return NextResponse.json({ error: "Sign in to generate narration." }, { status: 401 });
  const { text } = await request.json().catch(() => ({})) as { text?: unknown };
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
