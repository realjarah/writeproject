export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { generateContent, InterviewAnswers, VoiceAnalysis } from "@/lib/claude";
import { getUserId } from "@/lib/session";

export async function POST(req: NextRequest) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const interview: InterviewAnswers = await req.json();

  const profileRow = await prisma.voiceProfile.findUnique({ where: { userId } });
  if (!profileRow) {
    return NextResponse.json(
      { error: "No voice profile found. Please analyze your writing samples first." },
      { status: 400 }
    );
  }

  const voiceProfile: VoiceAnalysis = JSON.parse(profileRow.analysis);
  const stream = await generateContent(voiceProfile, interview);

  // Buffer the full content so we can save it
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  const fullContent = new TextDecoder().decode(
    Buffer.concat(chunks.map((c) => Buffer.from(c)))
  );

  await prisma.generatedContent.create({
    data: {
      userId,
      contentType: interview.contentType,
      topic: interview.topic,
      interview: JSON.stringify(interview),
      content: fullContent,
    },
  });

  return new NextResponse(fullContent, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
