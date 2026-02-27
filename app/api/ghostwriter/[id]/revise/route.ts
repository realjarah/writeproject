export const dynamic = "force-dynamic";
export const maxDuration = 120;

import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { reviseDraft } from "@/lib/claude";
import type { VoiceAnalysis } from "@/lib/claude";

// POST — stream a targeted revision of a finished draft
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const jobId = parseInt(params.id);
  if (isNaN(jobId)) return new Response("Invalid ID", { status: 400 });

  const { feedback } = await req.json();
  if (!feedback?.trim()) return new Response("feedback is required", { status: 400 });

  const job = await prisma.ghostwriterJob.findUnique({ where: { id: jobId } });
  if (!job) return new Response("Job not found", { status: 404 });
  if (!job.finalDraft) return new Response("No draft to revise", { status: 400 });

  const profileRow = await prisma.voiceProfile.findUnique({ where: { id: 1 } });
  if (!profileRow) return new Response("No voice profile", { status: 400 });

  const voiceProfile: VoiceAnalysis = JSON.parse(profileRow.analysis);
  const encoder = new TextEncoder();

  const sseStream = new ReadableStream({
    async start(controller) {
      const send = (data: object) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));

      try {
        const revisionStream = await reviseDraft(
          job.finalDraft,
          feedback,
          voiceProfile,
          job.contentType
        );

        const reader = revisionStream.getReader();
        const dec = new TextDecoder();
        let revised = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = dec.decode(value, { stream: true });
          revised += chunk;
          send({ type: "chunk", text: chunk });
        }

        // Persist revised draft
        await prisma.ghostwriterJob.update({
          where: { id: jobId },
          data: { finalDraft: revised },
        });

        send({ type: "done", finalDraft: revised });
      } catch (err) {
        console.error("Revision error:", err);
        send({ type: "error", message: "Revision failed. Please try again." });
      }

      controller.close();
    },
  });

  return new Response(sseStream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
