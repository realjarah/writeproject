export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";

let _gemini: GoogleGenAI;
function getGemini() {
  if (!_gemini) _gemini = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
  return _gemini;
}

export async function POST(req: NextRequest) {
  const { contentType, topic, angle, keyPoints } = await req.json();
  if (!topic) {
    return NextResponse.json({ error: "topic required" }, { status: 400 });
  }

  try {
    const result = await getGemini().models.generateContent({
      model: "gemini-2.5-flash",
      contents: `Content type: ${contentType}\nTopic: ${topic}\nAngle: ${angle || "not specified"}\nKey points: ${keyPoints || "not specified"}`,
      config: {
        systemInstruction: `Generate exactly 4 compelling, specific title options for the described piece. Return ONLY valid JSON with no prose: { "titles": ["title1", "title2", "title3", "title4"] }

Rules:
- Be punchy, direct, and specific to the topic
- Avoid generic openers like "The Ultimate Guide", "Everything You Need", "A Deep Dive"
- Vary the style across the 4 options (e.g. one declarative, one question, one contrarian, one list-style if appropriate)
- Match the tone implied by the content type
- Keep titles concise (under 12 words each)`,
        maxOutputTokens: 2048,
      },
    });

    const text = (result.text ?? "").trim();

    const clean = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
    const parsed = JSON.parse(clean);
    return NextResponse.json({ titles: parsed.titles ?? [] });
  } catch (err) {
    console.error("[suggest-titles] Failed:", err);
    return NextResponse.json({ titles: [], error: "Title suggestion failed" }, { status: 200 });
  }
}
