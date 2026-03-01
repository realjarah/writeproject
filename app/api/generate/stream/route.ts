export const dynamic = "force-dynamic";
export const maxDuration = 800; // Vercel Pro plan max — multi-stage pipeline can be lengthy for long-form content

import { NextRequest } from "next/server";
import { readFileSync } from "fs";
import { join } from "path";
import { prisma } from "@/lib/db";
import { getUserId } from "@/lib/session";
import {
  planContent,
  draftContent,
  humanizeContent,
  uploadContextFiles,
  deleteUploadedFiles,
  InterviewAnswers,
  VoiceAnalysis,
  GenerationContext,
} from "@/lib/claude";
import { resolveContext } from "@/lib/resolve-context";

// Load humanizer instructions once at module load (server-side only)
const HUMANIZER = readFileSync(join(process.cwd(), "lib/humanizer.md"), "utf-8");

export async function POST(req: NextRequest) {
  const userId = await getUserId();
  if (!userId) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { "Content-Type": "application/json" },
    });
  }

  const body = await req.json();
  const { signatureContent, context, ...interview } = body as InterviewAnswers & {
    signatureContent?: string;
    context?: GenerationContext;
  };

  const profileRow = await prisma.voiceProfile.findUnique({ where: { userId } });
  if (!profileRow) {
    return new Response(
      JSON.stringify({ error: "No voice profile found. Please analyze your writing samples first." }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const voiceProfile: VoiceAnalysis = JSON.parse(profileRow.analysis);

  // NOTE: Writing samples are NOT loaded here. The voice profile (analyzed by
  // Grok during voice setup) contains all voice data the pipeline needs.
  // Passing raw samples caused content contamination.

  // Resolve any URL context items to actual fetched content before the pipeline.
  let resolvedContext = context ? await resolveContext(context) : undefined;
  // Upload binary context (PDFs, images) to Files API; extract PDF text for Grok
  if (resolvedContext) {
    resolvedContext = await uploadContextFiles(resolvedContext);
  }

  const encoder = new TextEncoder();

  const sseStream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      // Keepalive heartbeat to prevent proxy/CDN timeouts during long AI calls
      const heartbeat = setInterval(() => {
        send({ type: "heartbeat" });
      }, 15_000);

      try {
        // ── Stage 1: Plan ────────────────────────────────────────────────
        send({ type: "stage", step: 1, total: 3, label: "Planning structure..." });
        const plan = await planContent(voiceProfile, interview, resolvedContext);

        // ── Stage 2: Draft ───────────────────────────────────────────────
        send({ type: "stage", step: 2, total: 3, label: "Writing first draft..." });
        const draft = await draftContent(voiceProfile, interview, plan, resolvedContext);

        // ── Stage 3: Humanize (streams to client) ────────────────────────
        send({ type: "stage", step: 3, total: 3, label: "Humanizing..." });
        const humanizedStream = await humanizeContent(draft, voiceProfile, HUMANIZER, interview.contentType);

        let finalContent = "";
        const reader = humanizedStream.getReader();
        const decoder = new TextDecoder();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const text = decoder.decode(value, { stream: true });
          finalContent += text;
          send({ type: "chunk", text });
        }

        // Save to DB (fire and forget — includes signature if provided)
        const dbContent = signatureContent
          ? `${finalContent}\n\n${signatureContent}`
          : finalContent;

        prisma.generatedContent
          .create({
            data: {
              userId,
              contentType: interview.contentType,
              topic: interview.topic,
              interview: JSON.stringify(interview),
              content: dbContent,
            },
          })
          .catch(console.error);

        send({ type: "done" });
      } catch (err) {
        console.error("Generation pipeline error:", err);
        send({ type: "error", message: "Generation failed. Please try again." });
      } finally {
        // Clean up any files uploaded to the Files API
        if (resolvedContext) {
          deleteUploadedFiles(resolvedContext).catch(console.error);
        }
      }

      controller.close();
    },
  });

  return new Response(sseStream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no", // disable proxy buffering (Nginx/Vercel)
    },
  });
}
