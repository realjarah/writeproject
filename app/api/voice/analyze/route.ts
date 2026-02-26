export const dynamic = 'force-dynamic';

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { analyzeVoice } from "@/lib/claude";

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

  let analysis;
  try {
    analysis = await analyzeVoice(samples.map((s) => s.content));
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: `Analysis failed: ${message}` },
      { status: 500 }
    );
  }

  await prisma.voiceProfile.upsert({
    where: { id: 1 },
    create: { id: 1, analysis: JSON.stringify(analysis) },
    update: { analysis: JSON.stringify(analysis) },
  });

  return NextResponse.json(analysis);
}
