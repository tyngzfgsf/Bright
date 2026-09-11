import { NextResponse } from "next/server";
import type { TurnResult } from "@/lib/prompt";

export const runtime = "nodejs";
/** Never cached: every turn is a fresh call. */
export const dynamic = "force-dynamic";

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
/** The app's default, from UserPreferences.DEFAULT_MODEL. */
const DEFAULT_MODEL = "openai/gpt-oss-120b";

type Body = {
  apiKey?: string;
  model?: string;
  messages?: { role: "system" | "user" | "assistant"; content: string }[];
};

/**
 * Forwards one turn to Groq using the key the browser sent.
 *
 * The key is used for this request and nothing else: it isn't logged, cached,
 * or written anywhere on the server. It goes through a route handler rather
 * than straight from the page so the browser isn't making cross-origin calls
 * with an Authorization header.
 */
export async function POST(request: Request) {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Malformed request." }, { status: 400 });
  }

  const { apiKey, messages } = body;
  if (!apiKey) {
    return NextResponse.json({ error: "Missing Groq API key." }, { status: 400 });
  }
  if (!messages?.length) {
    return NextResponse.json({ error: "No messages to send." }, { status: 400 });
  }

  let response: Response;
  try {
    response = await fetch(GROQ_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: body.model || DEFAULT_MODEL,
        messages,
        response_format: { type: "json_object" },
      }),
    });
  } catch {
    return NextResponse.json(
      { error: "Couldn't reach Groq. Check your connection." },
      { status: 502 },
    );
  }

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      payload?.error?.message ?? `Groq request failed (HTTP ${response.status}).`;
    return NextResponse.json({ error: message }, { status: response.status });
  }

  const reply: string | undefined = payload?.choices?.[0]?.message?.content;
  if (!reply) {
    return NextResponse.json({ error: "Empty response from the model." }, { status: 502 });
  }

  // The prompt demands a bare JSON object, but models sometimes wrap it in a
  // fence anyway — strip that before parsing rather than failing the turn.
  const cleaned = reply.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();

  let turn: TurnResult;
  try {
    turn = JSON.parse(cleaned) as TurnResult;
  } catch {
    return NextResponse.json(
      { error: "The model didn't return the expected JSON." },
      { status: 502 },
    );
  }

  return NextResponse.json({ turn });
}
