export const dynamic = "force-dynamic";
export const maxDuration = 300;

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { analyzeVoiceWithSubVoices } from "@/lib/claude";
import { getUserId } from "@/lib/session";

export async function POST(req: NextRequest) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const selectedCategories: string[] = body.selectedCategories ?? [];

  const samples = await prisma.voiceSample.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
    take: 500,
  });

  if (samples.length === 0) {
    return NextResponse.json(
      { error: "Add at least one writing sample before analyzing." },
      { status: 400 }
    );
  }

  const totalWords = samples.reduce((sum, s) => sum + s.wordCount, 0);
  const sampleCount = samples.length;

  // Set status to analyzing
  await prisma.voiceProfile.upsert({
    where: { userId },
    create: { userId, analysis: "{}", status: "analyzing", totalWords, sampleCount },
    update: { status: "analyzing", totalWords, sampleCount },
  });

  // Fire analysis in background (non-blocking)
  analyzeVoiceWithSubVoices(
    samples.map((s) => ({ content: s.content, category: s.category, notes: s.notes })),
    selectedCategories
  )
    .then(async (analysis) => {
      await prisma.voiceProfile.upsert({
        where: { userId },
        create: {
          userId,
          analysis: JSON.stringify(analysis),
          status: "done",
          totalWords,
          sampleCount,
        },
        update: {
          analysis: JSON.stringify(analysis),
          status: "done",
          totalWords,
          sampleCount,
        },
      });
    })
    .catch(async (err) => {
      console.error("[voice/analyze] Failed:", err);
      await prisma.voiceProfile.update({
        where: { userId },
        data: { status: "error" },
      }).catch(() => {});
    });

  return NextResponse.json({ status: "analyzing", totalWords, sampleCount });
}
