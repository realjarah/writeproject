import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic();

export async function POST(req: NextRequest) {
  const { description } = await req.json();
  if (!description?.trim()) {
    return Response.json({ error: "Description required" }, { status: 400 });
  }

  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1024,
    system: `You analyze content briefs and extract structured fields. Return ONLY valid JSON — no prose, no code fences.

Required output shape:
{
  "contentType": "blog" | "social" | "caption",
  "topic": string | null,
  "angle": string | null,
  "keyPoints": string | null,
  "targetAudience": string | null,
  "toneNotes": string | null,
  "summary": string,
  "questions": [{ "id": string, "label": string, "placeholder": string }]
}

Rules:
- contentType: "social" for Twitter/X/LinkedIn posts; "caption" for Instagram/TikTok/Reels; "blog" for articles, essays, long-form, or anything unclear
- topic: almost always extractable — null only if the brief is completely unintelligible
- angle: the specific take, argument, or thesis — null if genuinely absent
- keyPoints: comma-separated specific points to cover — null if none mentioned
- targetAudience: who the reader is — null if not mentioned (never ask for this)
- toneNotes: style or vibe notes — null if not mentioned (never ask for this)
- summary: complete "A [contentType] about [brief topic description]" — one tight phrase, no full sentence
- questions: ONLY for missing required fields. Required: angle (for blog/social), keyPoints (for blog/social). Optional: topic (only if truly absent). Never ask for targetAudience or toneNotes. Max 3 questions total. Make labels SPECIFIC to the topic (not generic like "What's your angle?" — instead: "What's your take on [specific topic]?"). Write helpful, specific placeholders.`,
    messages: [{
      role: "user",
      content: `Brief: """${description}"""`,
    }],
  });

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();

  try {
    // Strip code fences if model slips one in
    const clean = text.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
    const result = JSON.parse(clean);
    return Response.json(result);
  } catch {
    return Response.json({ error: "Parse failed", raw: text }, { status: 500 });
  }
}
