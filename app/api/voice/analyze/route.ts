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

  const analysis = await analyzeVoice(
    samples.map((s) => ({ content: s.content, category: s.category }))
  );

  await prisma.voiceProfile.upsert({
    where: { id: 1 },
    create: { id: 1, analysis: JSON.stringify(analysis) },
    update: { analysis: JSON.stringify(analysis) },
  });

  return NextResponse.json(analysis);
}
