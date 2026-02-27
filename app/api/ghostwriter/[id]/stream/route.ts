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

// Approximate word count range per content type (min, max).
// Upper bounds are intentionally generous for long-form types —
// a wordCountTarget in the interview overrides these entirely.
const WORD_RANGES: Record<string, [number, number]> = {
  blog: [600, 1400], essay: [500, 2000], newsletter: [200, 1000],
  whitepaper: [1500, 10000], email: [50, 400], report: [500, 4000],
  press_release: [300, 600], proposal: [500, 3000], case_study: [800, 2500],
  resume: [300, 800], cover_letter: [250, 400], research: [1500, 20000],
  technical: [500, 10000], social: [20, 300], caption: [10, 100],
  text_message: [5, 50], speech: [500, 2500], script: [500, 3000],
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

  // Load samples, favorite words, and user onboarding profile
  const [typeSpecific, others, favoriteWordsRows, userRow] = await Promise.all([
    prisma.voiceSample.findMany({ where: { userId, category: job.contentType }, orderBy: { wordCount: "desc" } }),
    prisma.voiceSample.findMany({ where: { userId, NOT: { category: job.contentType } }, orderBy: { wordCount: "desc" } }),
    prisma.favoriteWord.findMany({ where: { userId }, select: { word: true, definition: true } }),
    prisma.user.findUnique({ where: { id: userId }, select: { accountType: true, onboardingProfile: true } }),
  ]);
  // Topic-boost sample ordering: samples whose topics overlap with the job's topic/angle
  // float to the top within each tier (type-specific first, then general).
  function topicScore(sampleTopics: string, jobKeywords: string[]): number {
    try {
      const tags: string[] = JSON.parse(sampleTopics);
      return tags.filter((t) => jobKeywords.some((kw) => t.includes(kw) || kw.includes(t))).length;
    } catch { return 0; }
  }
  // Tokenise the job's topic+angle into lowercase words ≥ 4 chars
  const jobKeywords = `${job.topic} ${JSON.parse(job.brief)?.interview?.angle ?? ""}`.toLowerCase()
    .split(/\W+/).filter((w) => w.length >= 4);

  function sortByTopic<T extends { topics: string }>(arr: T[]): T[] {
    return [...arr].sort((a, b) => topicScore(b.topics, jobKeywords) - topicScore(a.topics, jobKeywords));
  }

  const sampleExamples = [
    ...sortByTopic(typeSpecific),
    ...sortByTopic(others),
  ].map((s) => ({
    content: s.content,
    category: s.category,
    topics: (() => { try { return JSON.parse(s.topics) as string[]; } catch { return []; } })(),
  }));
  const favoriteWords = favoriteWordsRows.length > 0 ? favoriteWordsRows : undefined;

  // Build author context from onboarding Q&A
  let authorContext: string | undefined;
  if (userRow?.onboardingProfile) {
    try {
      const profile = JSON.parse(userRow.onboardingProfile) as {
        answers?: { question: string; answer: string }[];
      };
      if (profile.answers && profile.answers.length > 0) {
        const isBrand = userRow.accountType === "brand";
        const header = isBrand ? "Brand context (from onboarding):" : "About the author (from onboarding):";
        const lines = profile.answers
          .filter((a) => a.answer?.trim())
          .map((a) => `- ${a.question} ${a.answer}`);
        if (lines.length > 0) {
          authorContext = `${header}\n${lines.join("\n")}`;
        }
      }
    } catch {
      // Malformed JSON — skip silently
    }
  }

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
        const plan = await planContent(voiceProfile, interview, resolvedContext, sampleExamples, favoriteWords, authorContext);

        // ── Step 2: Draft 1 — standard ────────────────────────────────────
        await setStep("drafting_1", "Writing first draft…");
        const draft1 = await draftContent(voiceProfile, interview, plan, resolvedContext, sampleExamples, favoriteWords, authorContext);

        // ── Step 3: Draft 2 — narrative emphasis ──────────────────────────
        await setStep("drafting_2", "Writing second draft…");
        const interview2: InterviewAnswers = {
          ...interview,
          toneNotes: [interview.toneNotes, "Prioritize narrative momentum — let the story carry the argument"]
            .filter(Boolean).join(". "),
        };
        const draft2 = await draftContent(voiceProfile, interview2, plan, resolvedContext, sampleExamples, favoriteWords, authorContext);

        // ── Step 4: Draft 3 — bold and direct ─────────────────────────────
        await setStep("drafting_3", "Writing third draft…");
        const interview3: InterviewAnswers = {
          ...interview,
          toneNotes: [interview.toneNotes, "Be bold and direct — fewer qualifications, stronger claims, sharper edges"]
            .filter(Boolean).join(". "),
        };
        const draft3 = await draftContent(voiceProfile, interview3, plan, resolvedContext, sampleExamples, favoriteWords, authorContext);

        // Persist raw drafts
        await prisma.ghostwriterJob.update({
          where: { id: jobId },
          data: { drafts: JSON.stringify([draft1, draft2, draft3]) },
        });

        // ── Step 5: Compare ───────────────────────────────────────────────
        await setStep("comparing", "Comparing drafts against your voice…");
        const selected = await compareAndSelectBestDraft([draft1, draft2, draft3], voiceProfile, interview);

        // ── Step 6: Quality check ─────────────────────────────────────────
        // MUST stay immediately before humanizing — never reorder.
        await setStep("checking", "Checking word count & structure…");
        const wc = wordCount(selected);

        // wordCountTarget from the brief always beats WORD_RANGES.
        let minW: number, maxW: number;
        const targetStr = interview.wordCountTarget;
        if (targetStr) {
          const targetNum = parseInt(String(targetStr).replace(/[^\d]/g, ""), 10);
          if (!isNaN(targetNum) && targetNum > 0) {
            minW = Math.floor(targetNum * 0.7);
            maxW = Math.ceil(targetNum * 1.3);
          } else {
            [minW, maxW] = WORD_RANGES[interview.contentType] ?? [300, 2000];
          }
        } else {
          [minW, maxW] = WORD_RANGES[interview.contentType] ?? [300, 2000];
        }

        let countNote = "";
        if (wc < minW * 0.7) {
          countNote = `[Polishing note: draft is ${wc} words; target is ${minW}–${maxW}. Expand thin sections — add substance, not padding.]`;
        } else if (wc > maxW * 1.4) {
          countNote = `[Polishing note: draft is ${wc} words; target is ${minW}–${maxW}. Tighten by cutting redundancy, not ideas.]`;
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
