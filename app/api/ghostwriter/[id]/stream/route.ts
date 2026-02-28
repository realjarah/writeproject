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
  proposeDraftVariation,
  conductResearch,
  assessResearchNeeds,
  selfReviewDraft,
  uploadContextFiles,
  deleteUploadedFiles,
  LIGHT_TYPES,
  SKIP_SELF_REVIEW_TYPES,
  InterviewAnswers,
  VoiceAnalysis,
  GenerationContext,
  ContextItem,
  ContextItemTag,
} from "@/lib/claude";
import { resolveContext } from "@/lib/resolve-context";

const HUMANIZER = readFileSync(join(process.cwd(), "lib/humanizer.md"), "utf-8");

// Approximate word count range per content type (min, max).
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

// ── Adaptive pipeline tiers ─────────────────────────────────────────────────

const DEEP_TYPES = new Set([
  "essay", "report", "whitepaper", "research", "technical", "proposal", "case_study",
]);

type PipelineTier = "light" | "standard" | "deep";

function getPipelineTier(contentType: string): PipelineTier {
  if (LIGHT_TYPES.has(contentType)) return "light";
  if (DEEP_TYPES.has(contentType)) return "deep";
  return "standard";
}

function getPipelineSteps(tier: PipelineTier, contentType: string): { key: string; label: string }[] {
  const includeReview = !SKIP_SELF_REVIEW_TYPES.has(contentType);

  switch (tier) {
    case "light":
      return [
        { key: "planning", label: "Planning structure" },
        { key: "drafting", label: "Writing draft" },
        { key: "humanizing", label: "Final polish" },
      ];
    case "standard": {
      const steps = [
        { key: "planning", label: "Planning structure" },
        { key: "drafting", label: "Writing draft" },
        { key: "humanizing", label: "Final polish" },
      ];
      if (includeReview) steps.push({ key: "reviewing", label: "Self-review as the author" });
      return steps;
    }
    case "deep": {
      const steps = [
        { key: "planning", label: "Planning structure" },
        { key: "researching", label: "Assessing research needs" },
        { key: "drafting_1", label: "Writing first draft" },
        { key: "proposing", label: "Studying draft — proposing variation" },
        { key: "drafting_2", label: "Writing second draft" },
        { key: "comparing", label: "Comparing drafts against your voice" },
        { key: "checking", label: "Checking word count & structure" },
        { key: "humanizing", label: "Final polish" },
      ];
      if (includeReview) steps.push({ key: "reviewing", label: "Self-review as the author" });
      return steps;
    }
  }
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
  const sampleExamples = [...typeSpecific, ...others].map((s) => ({
    content: s.content,
    category: s.category,
  }));
  const favoriteWords = favoriteWordsRows.length > 0 ? favoriteWordsRows : undefined;

  // Build author context and extract editing preferences from onboarding Q&A
  let authorContext: string | undefined;
  let editingPrefs: string | undefined;
  if (userRow?.onboardingProfile) {
    try {
      const profile = JSON.parse(userRow.onboardingProfile) as {
        answers?: { question: string; answer: string }[];
      };
      if (profile.answers && profile.answers.length > 0) {
        const isBrand = userRow.accountType === "brand";
        const header = isBrand ? "Brand context (from onboarding):" : "About the author (from onboarding):";
        const contextAnswers = profile.answers.filter((a) => a.answer?.trim());

        // Extract editing preferences from the editing question
        const editingAnswer = contextAnswers.find((a) =>
          a.question.toLowerCase().includes("re-read") ||
          a.question.toLowerCase().includes("reviews a draft") ||
          a.question.toLowerCase().includes("usually change")
        );
        if (editingAnswer?.answer?.trim()) {
          editingPrefs = editingAnswer.answer.trim();
        }

        const lines = contextAnswers.map((a) => `- ${a.question} ${a.answer}`);
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
  let resolvedContext = rawContext ? await resolveContext(rawContext) : undefined;

  // Upload binary context items (PDFs, images) to the Files API once.
  // They'll be referenced by file_id in all subsequent pipeline calls.
  if (resolvedContext) {
    resolvedContext = await uploadContextFiles(resolvedContext);
  }

  const tier = getPipelineTier(interview.contentType);
  const pipelineSteps = getPipelineSteps(tier, interview.contentType);
  const encoder = new TextEncoder();
  const abortController = new AbortController();

  const sseStream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        if (abortController.signal.aborted) return;
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      const setStep = async (status: string, label: string) => {
        if (abortController.signal.aborted) return;
        await prisma.ghostwriterJob.update({ where: { id: jobId }, data: { status, stepLabel: label } });
        send({ type: "step", step: status, label });
      };

      const isAborted = () => abortController.signal.aborted;

      try {
        // Send pipeline configuration to client
        send({ type: "pipeline", steps: pipelineSteps, tier });

        // ── Plan ─────────────────────────────────────────────────────────
        await setStep("planning", "Planning structure…");
        const plan = await planContent(
          voiceProfile, interview, resolvedContext, sampleExamples, favoriteWords, authorContext
        );
        if (isAborted()) { controller.close(); return; }

        // ── Research (deep tier only) ────────────────────────────────────
        let enrichedContext = resolvedContext;
        if (tier === "deep") {
          await setStep("researching", "Assessing research needs…");
          try {
            const assessment = await assessResearchNeeds(plan, interview, resolvedContext);
            if (!isAborted() && assessment.needed && assessment.queries.length > 0) {
              const researchResults: string[] = [];
              for (const query of assessment.queries.slice(0, 3)) {
                if (isAborted()) break;
                await setStep("researching", `Researching: ${query.slice(0, 60)}…`);
                try {
                  const result = await conductResearch(query, {
                    topic: interview.topic,
                    angle: interview.angle,
                    contentType: interview.contentType,
                  });
                  if (result && result !== "Research could not be completed.") {
                    researchResults.push(result);
                  }
                } catch { /* skip failed queries */ }
              }
              if (researchResults.length > 0) {
                const researchItems: ContextItem[] = researchResults.map((r) => ({
                  tag: "research" as ContextItemTag,
                  text: r,
                  instructions: "Use this research to support factual claims and add specificity.",
                }));
                enrichedContext = {
                  items: [...(resolvedContext?.items ?? []), ...researchItems],
                };
              }
            }
          } catch { /* research assessment failed — continue without research */ }
          if (isAborted()) { controller.close(); return; }
        }

        // ── Drafting ─────────────────────────────────────────────────────
        let selected: string;

        if (tier === "deep") {
          // Draft 1 (full samples) → study it → propose 1 variation → draft 2 (fingerprint only)
          await setStep("drafting_1", "Writing first draft…");
          const draft1 = await draftContent(
            voiceProfile, interview, plan, enrichedContext, sampleExamples, favoriteWords, authorContext
          );
          if (isAborted()) { controller.close(); return; }

          // Propose variation: Opus reads draft 1 + voice profile and suggests
          // 1 alternative creative direction specific to this author
          await setStep("proposing", "Studying draft — proposing variation…");
          const variation = await proposeDraftVariation(
            draft1, voiceProfile, interview, plan
          );
          if (isAborted()) { controller.close(); return; }

          // Draft 2 uses condensed voice fingerprint (isFollowup=true) + reduced thinking budget
          await setStep("drafting_2", "Writing second draft…");
          const interview2: InterviewAnswers = {
            ...interview,
            toneNotes: [interview.toneNotes, variation.direction]
              .filter(Boolean).join(". "),
          };
          const draft2 = await draftContent(
            voiceProfile, interview2, plan, enrichedContext, sampleExamples, favoriteWords, authorContext, true
          );
          if (isAborted()) { controller.close(); return; }

          // Persist raw drafts
          await prisma.ghostwriterJob.update({
            where: { id: jobId },
            data: { drafts: JSON.stringify([draft1, draft2]) },
          });

          // Compare & select best (Sonnet — analytical, not creative)
          await setStep("comparing", "Comparing drafts against your voice…");
          selected = await compareAndSelectBestDraft([draft1, draft2], voiceProfile, interview);
          if (isAborted()) { controller.close(); return; }

          // Word count quality check
          await setStep("checking", "Checking word count & structure…");
          const wc = wordCount(selected);
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

          if (countNote) selected = `${selected}\n\n${countNote}`;
        } else {
          // Light and standard: single draft
          await setStep("drafting", "Writing draft…");
          selected = await draftContent(
            voiceProfile, interview, plan, enrichedContext, sampleExamples, favoriteWords, authorContext
          );
          if (isAborted()) { controller.close(); return; }
        }

        // ── Humanize (streams chunks to client) ──────────────────────────
        await setStep("humanizing", "Final polish…");
        const humanizedStream = await humanizeContent(
          selected, voiceProfile, HUMANIZER, interview.contentType
        );

        let finalContent = "";
        const reader = humanizedStream.getReader();
        const dec = new TextDecoder();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = dec.decode(value, { stream: true });
          finalContent += chunk;
          send({ type: "chunk", text: chunk });
        }
        if (isAborted()) { controller.close(); return; }

        // ── Self-review (only for types where it adds value) ────────────
        // Skipped for light tier and business-medium types (blog, newsletter,
        // email, etc.) where the humanizer already handles AI-pattern removal
        if (!SKIP_SELF_REVIEW_TYPES.has(interview.contentType)) {
          await setStep("reviewing", "Self-review as the author…");
          try {
            const reviewed = await selfReviewDraft(
              finalContent, voiceProfile, interview, editingPrefs
            );
            if (reviewed && reviewed.trim()) {
              finalContent = reviewed;
            }
          } catch { /* self-review failed — keep humanized version */ }
          if (isAborted()) { controller.close(); return; }
        }

        // ── Done ─────────────────────────────────────────────────────────
        const dbContent = signatureContent
          ? `${finalContent}\n\n${signatureContent}`
          : finalContent;

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
        if (isAborted()) { controller.close(); return; }
        console.error("Ghostwriter pipeline error:", err);
        const msg = err instanceof Error ? err.message : "Unknown error";
        await prisma.ghostwriterJob
          .update({ where: { id: jobId }, data: { status: "error", errorMsg: msg } })
          .catch(console.error);
        send({ type: "error", message: "Ghostwriting failed. Please try again." });
      } finally {
        // Clean up uploaded files from the Files API
        if (resolvedContext) {
          deleteUploadedFiles(resolvedContext).catch(() => {});
        }
      }

      controller.close();
    },
    cancel() {
      abortController.abort();
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
