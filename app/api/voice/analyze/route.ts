export const dynamic = "force-dynamic";
export const maxDuration = 120;

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { analyzeVoice } from "@/lib/claude";
import { getUserId } from "@/lib/session";

export async function POST() {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const samples = await prisma.voiceSample.findMany({
    where: { userId },
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
    where: { userId },
    create: { userId, analysis: JSON.stringify(analysis) },
    update: { analysis: JSON.stringify(analysis) },
  });

  return NextResponse.json(analysis);
}
