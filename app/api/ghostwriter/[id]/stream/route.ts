export const dynamic = "force-dynamic";
export const maxDuration = 300;

import { NextRequest } from "next/server";
import { readFileSync } from "fs";
import { join } from "path";
import { prisma } from "@/lib/db";
import { getUserId } from "@/lib/session";
import {
  planContent,
  draftContent,
  humanizeContent,
  compareAndSelectBestDraft,
  InterviewAnswers,
  VoiceAnalysis,
  GenerationContext,
} from "@/lib/claude";
import { resolveContext } from "@/lib/resolve-context";

const HUMANIZER = readFileSync(join(process.cwd(), "lib/humanizer.md"), "utf-8");

// Approximate word count range per content type (min, max)
const WORD_RANGES: Record<string, [number, number]> = {
  blog: [600, 1200], essay: [500, 1500], newsletter: [200, 1000],
  whitepaper: [1500, 3000], email: [50, 400], report: [500, 2000],
  press_release: [300, 600], proposal: [500, 2000], case_study: [800, 1500],
  resume: [300, 800], cover_letter: [250, 400], research: [1500, 5000],
  technical: [500, 2000], social: [20, 300], caption: [10, 100],
  text_message: [5, 50], speech: [500, 2000], script: [500, 2000],
};

function wordCount(text: string) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const userId = await getUserId();
  if (!userId) return new Response("Unauthorized", { status: 401 });

  const jobId = parseInt(params.id);
  if (isNaN(jobId)) return new Response("Invalid ID", { status: 400 });

  const job = await prisma.ghostwriterJob.findFirst({ where: { id: jobId, userId } });
  if (!job) return new Response("Job not found", { status: 404 });

  const profileRow = await prisma.voiceProfile.findUnique({ where: { userId } });
  if (!profileRow) {
    await prisma.ghostwriterJob.update({
      where: { id: jobId },
      data: { status: "error", errorMsg: "No voice profile. Add and analyze writing samples in Profile first." },
    });
    return new Response(
      JSON.stringify({ error: "No voice profile found." }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const voiceProfile: VoiceAnalysis = JSON.parse(profileRow.analysis);

  // Load samples — type-matching first
  const typeSpecific = await prisma.voiceSample.findMany({
    where: { userId, category: job.contentType },
    orderBy: { wordCount: "desc" },
  });
  const others = await prisma.voiceSample.findMany({
    where: { userId, NOT: { category: job.contentType } },
    orderBy: { wordCount: "desc" },
  });
  const sampleExamples = [...typeSpecific, ...others].map((s) => ({
    content: s.content,
    category: s.category,
  }));

  const briefData = JSON.parse(job.brief) as {
    interview: InterviewAnswers;
    context?: GenerationContext;
    signatureContent?: string;
  };
  const { interview, context: rawContext, signatureContent } = briefData;
  const resolvedContext = rawContext ? await resolveContext(rawContext) : undefined;

  const encoder = new TextEncoder();

  const sseStream = new ReadableStream({
    async start(controller) {
      const send = (data: object) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));

      const setStep = async (status: string, label: string) => {
        await prisma.ghostwriterJob.update({ where: { id: jobId }, data: { status, stepLabel: label } });
        send({ type: "step", step: status, label });
      };

      try {
        // ── Step 1: Plan ───────────────────────────────────────────────────
        await setStep("planning", "Planning structure…");
        const plan = await planContent(voiceProfile, interview, resolvedContext, sampleExamples);

        // ── Step 2: Draft 1 — standard ────────────────────────────────────
        await setStep("drafting_1", "Writing first draft…");
        const draft1 = await draftContent(voiceProfile, interview, plan, resolvedContext, sampleExamples);

        // ── Step 3: Draft 2 — narrative emphasis ──────────────────────────
        await setStep("drafting_2", "Writing second draft…");
        const interview2: InterviewAnswers = {
          ...interview,
          toneNotes: [interview.toneNotes, "Prioritize narrative momentum — let the story carry the argument"]
            .filter(Boolean).join(". "),
        };
        const draft2 = await draftContent(voiceProfile, interview2, plan, resolvedContext, sampleExamples);

        // ── Step 4: Draft 3 — bold and direct ─────────────────────────────
        await setStep("drafting_3", "Writing third draft…");
        const interview3: InterviewAnswers = {
          ...interview,
          toneNotes: [interview.toneNotes, "Be bold and direct — fewer qualifications, stronger claims, sharper edges"]
            .filter(Boolean).join(". "),
        };
        const draft3 = await draftContent(voiceProfile, interview3, plan, resolvedContext, sampleExamples);

        // Persist raw drafts
        await prisma.ghostwriterJob.update({
          where: { id: jobId },
          data: { drafts: JSON.stringify([draft1, draft2, draft3]) },
        });

        // ── Step 5: Compare ───────────────────────────────────────────────
        await setStep("comparing", "Comparing drafts against your voice…");
        const selected = await compareAndSelectBestDraft([draft1, draft2, draft3], voiceProfile, interview);

        // ── Step 6: Quality check ─────────────────────────────────────────
        await setStep("checking", "Checking word count & structure…");
        const wc = wordCount(selected);
        const [minW, maxW] = WORD_RANGES[interview.contentType] ?? [300, 2000];
        let countNote = "";
        if (wc < minW * 0.7) {
          countNote = `[Note for polish: draft is short at ${wc} words; target range ${minW}–${maxW}. Expand where appropriate.]`;
        } else if (wc > maxW * 1.4) {
          countNote = `[Note for polish: draft is long at ${wc} words; target range ${minW}–${maxW}. Tighten where possible.]`;
        }

        // ── Step 7: Humanize ──────────────────────────────────────────────
        await setStep("humanizing", "Final polish…");
        const inputForHumanize = countNote ? `${selected}\n\n${countNote}` : selected;
        const humanizedStream = await humanizeContent(
          inputForHumanize, voiceProfile, HUMANIZER, interview.contentType
        );

        let finalContent = "";
        const reader = humanizedStream.getReader();
        const dec = new TextDecoder();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          finalContent += dec.decode(value, { stream: true });
        }

        const dbContent = signatureContent
          ? `${finalContent}\n\n${signatureContent}`
          : finalContent;

        // Save completed job
        await prisma.ghostwriterJob.update({
          where: { id: jobId },
          data: { status: "done", stepLabel: "Done", finalDraft: dbContent },
        });

        // Mirror to GeneratedContent for history compatibility
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

        send({ type: "done", finalDraft: dbContent });
      } catch (err) {
        console.error("Ghostwriter pipeline error:", err);
        const msg = err instanceof Error ? err.message : "Unknown error";
        await prisma.ghostwriterJob
          .update({ where: { id: jobId }, data: { status: "error", errorMsg: msg } })
          .catch(console.error);
        send({ type: "error", message: "Ghostwriting failed. Please try again." });
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
