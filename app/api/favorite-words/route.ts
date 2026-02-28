export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUserId } from "@/lib/session";
import { GoogleGenAI } from "@google/genai";

const gemini = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

export async function GET() {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const words = await prisma.favoriteWord.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json(words);
}

export async function POST(req: NextRequest) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { word } = await req.json();
  if (!word?.trim()) return NextResponse.json({ error: "word required" }, { status: 400 });

  const trimmed = word.trim();

  // Generate a writer-focused definition with Gemini Flash
  let definition = "";
  try {
    const result = await gemini.models.generateContent({
      model: "gemini-2.5-flash",
      contents: `Define the word or phrase "${trimmed}" in 1–2 sentences from a writer's perspective — capture its precise meaning, connotation, texture, and when a writer might reach for it. Be specific and evocative, not dictionary-flat. Return only the definition, no intro.`,
      config: { maxOutputTokens: 200 },
    });
    definition = (result.text ?? "").trim();
  } catch { /* definition stays empty */ }

  const created = await prisma.favoriteWord.create({
    data: { userId, word: trimmed, definition },
  });

  return NextResponse.json(created, { status: 201 });
}
