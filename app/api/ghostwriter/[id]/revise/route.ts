export const dynamic = "force-dynamic";
export const maxDuration = 300;

import { readFileSync } from "fs";
import { join } from "path";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { reviseDraft, humanizeContent } from "@/lib/claude";
import type { VoiceAnalysis } from "@/lib/claude";
import { getUserId } from "@/lib/session";

const HUMANIZER = readFileSync(join(process.cwd(), "lib/humanizer.md"), "utf-8");

// POST — revise a finished draft, then humanize before returning
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const userId = await getUserId();
  if (!userId) return new Response("Unauthorized", { status: 401 });

  const jobId = parseInt(params.id);
  if (isNaN(jobId)) return new Response("Invalid ID", { status: 400 });

  const { feedback } = await req.json();
  if (!feedback?.trim()) return new Response("feedback is required", { status: 400 });

  const [job, profileRow, favoriteWords] = await Promise.all([
    prisma.ghostwriterJob.findFirst({ where: { id: jobId, userId } }),
    prisma.voiceProfile.findUnique({ where: { userId } }),
    prisma.favoriteWord.findMany({ where: { userId }, select: { word: true, definition: true } }),
  ]);

  if (!job) return new Response("Job not found", { status: 404 });
  if (!job.finalDraft) return new Response("No draft to revise", { status: 400 });
  if (!profileRow) return new Response("No voice profile", { status: 400 });

  const voiceProfile: VoiceAnalysis = JSON.parse(profileRow.analysis);
  const encoder = new TextEncoder();

  const sseStream = new ReadableStream({
    async start(controller) {
      const send = (data: object) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));

      try {
        // Step 1: Apply feedback surgically (Gemini Flash — fast)
        send({ type: "step", step: "revising", label: "Applying your feedback…" });
        const revised = await reviseDraft(
          job.finalDraft,
          feedback,
          voiceProfile,
          job.contentType
        );

        // Step 2: Run humanizer on revised output (Opus — catches any AI
        // patterns the revision introduced)
        send({ type: "step", step: "humanizing", label: "Humanizing revised draft…" });
        const humanizedStream = await humanizeContent(
          revised, voiceProfile, HUMANIZER, job.contentType,
          favoriteWords.length > 0 ? favoriteWords : undefined,
        );

        const reader = humanizedStream.getReader();
        const dec = new TextDecoder();
        let finalContent = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = dec.decode(value, { stream: true });
          finalContent += chunk;
          send({ type: "chunk", text: chunk });
        }

        // Persist humanized revised draft
        await prisma.ghostwriterJob.update({
          where: { id: jobId },
          data: { finalDraft: finalContent },
        });

        send({ type: "done", finalDraft: finalContent });
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
