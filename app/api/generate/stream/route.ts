export const dynamic = 'force-dynamic';

import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { generateContent, InterviewAnswers, VoiceAnalysis, GenerationContext } from "@/lib/claude";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { signatureContent, context, ...interview } = body as InterviewAnswers & {
    signatureContent?: string;
    context?: GenerationContext;
  };

  const profileRow = await prisma.voiceProfile.findUnique({ where: { id: 1 } });
  if (!profileRow) {
    return new Response(
      JSON.stringify({ error: "No voice profile found. Please analyze your writing samples first." }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const voiceProfile: VoiceAnalysis = JSON.parse(profileRow.analysis);

  const contentStream = await generateContent(voiceProfile, interview, context);
  const [streamForClient, streamForBuffer] = contentStream.tee();

  // Save in background — append signature to stored content if provided
  (async () => {
    const reader = streamForBuffer.getReader();
    const chunks: Uint8Array[] = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }
    const generated = new TextDecoder().decode(
      Buffer.concat(chunks.map((c) => Buffer.from(c)))
    );
    const fullContent = signatureContent
      ? `${generated}\n\n${signatureContent}`
      : generated;

    await prisma.generatedContent.create({
      data: {
        contentType: interview.contentType,
        topic: interview.topic,
        interview: JSON.stringify(interview),
        content: fullContent,
      },
    });
  })();

  return new Response(streamForClient, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Transfer-Encoding": "chunked",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
