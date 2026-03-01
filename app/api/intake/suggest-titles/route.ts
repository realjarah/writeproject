export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { CONTENT_TYPE_LABELS, getGroupForType } from "@/lib/content-types";

let _gemini: GoogleGenAI;
function getGemini() {
  if (!_gemini) _gemini = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
  return _gemini;
}

const TITLE_STYLE_BY_GROUP: Record<string, string> = {
  "Personal":            "Authentic, conversational tone. Can be informal or heartfelt. Reflect the personal nature of the writing.",
  "Social Media":        "Scroll-stopping hooks. Use curiosity gaps, emotional triggers, bold claims. Keep under 8 words. Think viral.",
  "Professional":        "Clear, professional, trust-building. Action-oriented. Convey competence and clarity.",
  "Business":            "Authoritative and data-informed. Can reference metrics or outcomes. Convey strategic value.",
  "Marketing & Content": "SEO-aware where relevant. Include a contrarian or unexpected option. Lead with value proposition.",
  "Education":           "Learning-outcome focused. Action-oriented ('How to...', 'Master...', 'Learn...'). Clear about what the reader will gain.",
  "Academic & Technical": "Formal and precise. Descriptive of methodology or findings. Can use field-specific terminology.",
  "Creative & Spoken":   "Evocative and literary. Use metaphor, emotion, or rhythm. Can be poetic or provocative.",
};

export async function POST(req: NextRequest) {
  try {
  const { contentType, topic, angle, keyPoints } = await req.json();
  if (!topic) {
    return NextResponse.json({ error: "topic required" }, { status: 400 });
  }

  const group = getGroupForType(contentType);
  const styleGuidance = group ? TITLE_STYLE_BY_GROUP[group] ?? "" : "";
  const typeLabel = CONTENT_TYPE_LABELS[contentType] ?? contentType;

  const result = await getGemini().models.generateContent({
    model: "gemini-2.5-flash",
    contents: `Content type: ${typeLabel}\nTopic: ${topic}\nAngle: ${angle || "not specified"}\nKey points: ${keyPoints || "not specified"}`,
    config: {
      systemInstruction: `Generate exactly 4 compelling, specific title options for the described piece. Return ONLY valid JSON with no prose: { "titles": ["title1", "title2", "title3", "title4"] }

Rules:
- Be punchy, direct, and specific to the topic
- Avoid generic openers like "The Ultimate Guide", "Everything You Need", "A Deep Dive"
- Vary the style across the 4 options (e.g. one declarative, one question, one contrarian, one list-style if appropriate)
- Match the tone implied by the content type
- Keep titles concise (under 12 words each)${styleGuidance ? `\n\nCategory style guidance (${group}):\n${styleGuidance}` : ""}`,
      maxOutputTokens: 512,
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
