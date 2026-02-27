export const dynamic = "force-dynamic";
export const maxDuration = 120; // guidelines generation runs in parallel after analysis

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { analyzeVoice, generateContentGuideline, VoiceAnalysis } from "@/lib/claude";
import { CONTENT_TYPE_LABELS } from "@/lib/content-types";

export async function POST() {
  const samples = await prisma.voiceSample.findMany({
    orderBy: { createdAt: "asc" },
  });

  if (samples.length === 0) {
    return NextResponse.json(
      { error: "Add at least one writing sample before analyzing." },
      { status: 400 }
    );
  }

  // Step 1: Run voice analysis
  const analysis = await analyzeVoice(
    samples.map((s) => ({ content: s.content, category: s.category }))
  );

  // Step 2: Determine which known content types have samples (skip legacy/unknown categories)
  const typeWordMap: Record<string, number> = {};
  for (const s of samples) {
    if (s.category in CONTENT_TYPE_LABELS) {
      typeWordMap[s.category] = (typeWordMap[s.category] ?? 0) + s.wordCount;
    }
  }
  const typesWithSamples = Object.keys(typeWordMap).filter(
    (type) => typeWordMap[type] >= 50
  );

  // Step 3: Preserve existing guidelines for types without samples, regenerate for types with samples
  const existingProfile = await prisma.voiceProfile.findUnique({ where: { id: 1 } });
  const existingGuidelines: Record<string, string[]> = existingProfile
    ? (JSON.parse(existingProfile.analysis) as VoiceAnalysis).contentGuidelines ?? {}
    : {};

  const guidelineResults = await Promise.allSettled(
    typesWithSamples.map(async (type) => {
      const guidelines = await generateContentGuideline(analysis, type);
      return { type, guidelines };
    })
  );

  const mergedGuidelines: Record<string, string[]> = { ...existingGuidelines };
  for (const result of guidelineResults) {
    if (result.status === "fulfilled") {
      mergedGuidelines[result.value.type] = result.value.guidelines;
    }
  }

  // Step 4: Save the combined profile (analysis + guidelines)
  const finalAnalysis: VoiceAnalysis = {
    ...analysis,
    contentGuidelines: mergedGuidelines,
  };

  await prisma.voiceProfile.upsert({
    where: { id: 1 },
    create: { id: 1, analysis: JSON.stringify(finalAnalysis) },
    update: { analysis: JSON.stringify(finalAnalysis) },
  });

  return NextResponse.json(finalAnalysis);
}
