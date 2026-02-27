export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic();

export async function POST(req: NextRequest) {
  const { contentType, topic, angle, keyPoints } = await req.json();
  if (!topic) {
    return NextResponse.json({ error: "topic required" }, { status: 400 });
  }

  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 512,
    system: `Generate exactly 4 compelling, specific title options for the described piece. Return ONLY valid JSON with no prose: { "titles": ["title1", "title2", "title3", "title4"] }

Rules:
- Be punchy, direct, and specific to the topic
- Avoid generic openers like "The Ultimate Guide", "Everything You Need", "A Deep Dive"
- Vary the style across the 4 options (e.g. one declarative, one question, one contrarian, one list-style if appropriate)
- Match the tone implied by the content type
- Keep titles concise (under 12 words each)`,
    messages: [
      {
        role: "user",
        content: `Content type: ${contentType}\nTopic: ${topic}\nAngle: ${angle || "not specified"}\nKey points: ${keyPoints || "not specified"}`,
      },
    ],
  });

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();

  try {
    const clean = text.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
    const result = JSON.parse(clean);
    return NextResponse.json({ titles: result.titles ?? [] });
  } catch {
    return NextResponse.json({ titles: [] });
  }
}
