export const dynamic = "force-dynamic";
export const maxDuration = 800; // Vercel Pro plan max — deep-tier pipelines (research papers, whitepapers) can run 9+ AI stages

import { NextRequest } from "next/server";
import { readFileSync } from "fs";
import { join } from "path";
import { prisma } from "@/lib/db";
import { getUserId } from "@/lib/session";
import {
  planContent,
  draftContent,
  humanizeContent,
  compareDraftsGrok,
  proposeDraftVariation,
  conductResearchGrok,
  assessResearchNeeds,
  selfReviewDraft,
  checkFabrications,
  assessBriefQuality,
  scoreVoiceFidelity,
  repairVoice,
  VOICE_FIDELITY_THRESHOLD,
  uploadContextFiles,
  deleteUploadedFiles,
  LIGHT_TYPES,
  InterviewAnswers,
  VoiceAnalysis,
  GenerationContext,
  ContextItem,
  ContextItemTag,
} from "@/lib/claude";
import { resolveContext } from "@/lib/resolve-context";
import { CONTENT_TYPE_LABELS } from "@/lib/content-types";

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

function getPipelineSteps(tier: PipelineTier, interview: InterviewAnswers): { key: string; label: string }[] {
  const typeLabel = CONTENT_TYPE_LABELS[interview.contentType]
    ?? interview.contentTypeLabel
    ?? interview.contentType;

  switch (tier) {
    case "light":
      return [
        { key: "planning", label: `Planning your ${typeLabel}` },
        { key: "drafting", label: `Writing your ${typeLabel}` },
        { key: "reviewing", label: "Re-reading as you" },
        { key: "humanizing", label: `Polishing your ${typeLabel}` },
        { key: "scoring", label: "Scoring voice fidelity" },
      ];
    case "standard":
      return [
        { key: "planning", label: `Planning your ${typeLabel}` },
        { key: "drafting", label: `Writing your ${typeLabel}` },
        { key: "reviewing", label: "Re-reading as you" },
        { key: "fact_checking", label: "Fact-checking claims" },
        { key: "humanizing", label: `Polishing your ${typeLabel}` },
        { key: "scoring", label: "Scoring voice fidelity" },
      ];
    case "deep":
      return [
        { key: "planning", label: `Planning your ${typeLabel}` },
        { key: "researching", label: "Researching your topic" },
        { key: "drafting_1", label: "Writing first draft" },
        { key: "proposing", label: "Studying draft — proposing variation" },
        { key: "drafting_2", label: "Writing second draft" },
        { key: "comparing", label: "Comparing drafts against your voice" },
        { key: "checking", label: "Checking word count & structure" },
        { key: "reviewing", label: "Re-reading as you" },
        { key: "fact_checking", label: "Fact-checking claims" },
        { key: "humanizing", label: `Polishing your ${typeLabel}` },
        { key: "scoring", label: "Scoring voice fidelity" },
      ];
  }
}

// ── Inter-stage delays (rate-limit spacing + agentic UX) ─────────────────────

interface TransitionConfig {
  baseMs: number;
  jitterMs: number;
  messages: string[];
}

// Minimal delays: just enough for UX pacing between pipeline steps.
// All agents now use the same provider (Opus), so rate-limit spacing
// between providers is no longer a concern.
const TRANSITION_DELAYS: Record<PipelineTier, Record<string, TransitionConfig>> = {
  light: {
    "drafting->reviewing": {
      baseMs: 500, jitterMs: 500,
      messages: ["Reviewing draft…"],
    },
    "reviewing->humanizing": {
      baseMs: 500, jitterMs: 500,
      messages: ["Preparing final polish…"],
    },
    "humanizing->scoring": {
      baseMs: 500, jitterMs: 300,
      messages: ["Scoring voice match…"],
    },
  },
  standard: {
    "planning->drafting": {
      baseMs: 800, jitterMs: 500,
      messages: ["Mapping structure to your voice…"],
    },
    "research->drafting": {
      baseMs: 800, jitterMs: 500,
      messages: ["Synthesizing research…"],
    },
    "drafting->reviewing": {
      baseMs: 800, jitterMs: 500,
      messages: ["Reviewing draft…"],
    },
    "reviewing->fact_checking": {
      baseMs: 500, jitterMs: 300,
      messages: ["Verifying claims…"],
    },
    "fact_checking->humanizing": {
      baseMs: 500, jitterMs: 300,
      messages: ["Preparing final polish…"],
    },
    "humanizing->scoring": {
      baseMs: 500, jitterMs: 300,
      messages: ["Scoring voice match…"],
    },
  },
  deep: {
    "research->drafting_1": {
      baseMs: 800, jitterMs: 500,
      messages: ["Preparing draft approach…"],
    },
    "proposing->drafting_2": {
      baseMs: 800, jitterMs: 500,
      messages: ["Setting up second draft…"],
    },
    "checking->reviewing": {
      baseMs: 800, jitterMs: 500,
      messages: ["Reviewing draft…"],
    },
    "reviewing->fact_checking": {
      baseMs: 500, jitterMs: 300,
      messages: ["Verifying claims…"],
    },
    "fact_checking->humanizing": {
      baseMs: 500, jitterMs: 300,
      messages: ["Preparing final polish…"],
    },
    "humanizing->scoring": {
      baseMs: 500, jitterMs: 300,
      messages: ["Scoring voice match…"],
    },
  },
};

/**
 * SSE keepalive: sends a comment line every 15s to prevent proxy/CDN timeouts
 * during long AI calls. Returns a stop function.
 */
function startHeartbeat(
  send: (data: object) => void,
  isAborted: () => boolean
): () => void {
  const interval = setInterval(() => {
    if (isAborted()) { clearInterval(interval); return; }
    send({ type: "heartbeat" });
  }, 15_000);
  return () => clearInterval(interval);
}

/**
 * Deliberate delay between pipeline stages. Sends cycling sub-step messages
 * via SSE so the UI feels agentic. Uses send() directly (not setStep) to
 * avoid writing transient labels to the database.
 */
async function paceTransition(
  tier: PipelineTier,
  transitionKey: string,
  nextStepKey: string,
  send: (data: object) => void,
  isAborted: () => boolean,
): Promise<void> {
  const config = TRANSITION_DELAYS[tier]?.[transitionKey];
  if (!config) return;

  const totalMs = config.baseMs + Math.floor(Math.random() * config.jitterMs);
  const perMsg = Math.floor(totalMs / config.messages.length);

  for (let i = 0; i < config.messages.length; i++) {
    if (isAborted()) return;
    send({ type: "step", step: nextStepKey, label: config.messages[i] });
    await new Promise((r) => setTimeout(r, perMsg));
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

  // Load favorite words and user onboarding profile
  // NOTE: Writing samples are NOT loaded here. The voice profile (analyzed by
  // Grok during voice setup) contains all voice data the pipeline needs.
  // Passing raw samples caused content contamination — the AI would copy
  // specific content from samples into unrelated articles.
  const [favoriteWordsRows, userRow] = await Promise.all([
    prisma.favoriteWord.findMany({ where: { userId }, select: { word: true, definition: true } }),
    prisma.user.findUnique({ where: { id: userId }, select: { accountType: true, onboardingProfile: true } }),
  ]);
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

  // Validate interview has required fields (angle/keyPoints can be empty strings)
  if (!interview?.contentType || interview?.topic == null) {
    await prisma.ghostwriterJob.update({
      where: { id: jobId },
      data: { status: "error", errorMsg: "Malformed brief — missing required interview fields." },
    });
    return new Response(
      JSON.stringify({ error: "Malformed brief data." }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  // Normalize context: ensure items is a valid array, filter out malformed items
  let normalizedContext: GenerationContext | undefined;
  if (rawContext && Array.isArray(rawContext.items) && rawContext.items.length > 0) {
    const validTags = new Set(["data", "example", "research", "reference", "note"]);
    const validItems = rawContext.items.filter((item: ContextItem) => {
      if (!item.tag || !validTags.has(item.tag)) {
        console.warn(`[stream] Dropping context item with invalid tag: ${JSON.stringify(item.tag)}`);
        return false;
      }
      // Must have at least one content source
      const hasContent = item.url || item.text !== undefined || item.data || item.fileName;
      if (!hasContent) {
        console.warn(`[stream] Dropping context item with no content source (tag: ${item.tag})`);
        return false;
      }
      return true;
    });
    normalizedContext = validItems.length > 0 ? { items: validItems } : undefined;
  }
  let resolvedContext = normalizedContext ? await resolveContext(normalizedContext) : undefined;

  // Upload binary context (PDFs, images) to Files API once — avoids re-sending
  // base64 data in every pipeline stage. For PDFs, also extracts text so
  // text-only models (Grok) can see content during planning/drafting.
  if (resolvedContext) {
    resolvedContext = await uploadContextFiles(resolvedContext);
  }

  const tier = getPipelineTier(interview.contentType);
  const pipelineSteps = getPipelineSteps(tier, interview);
  const typeLabel = CONTENT_TYPE_LABELS[interview.contentType]
    ?? interview.contentTypeLabel
    ?? interview.contentType;
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

      // Safety net: if the pipeline hasn't finished 30s before the hard
      // timeout, mark the job as errored so it doesn't get stuck forever.
      const SAFETY_MARGIN_MS = 30_000;
      const timeoutMs = (maxDuration * 1000) - SAFETY_MARGIN_MS;
      const timeoutTimer = setTimeout(async () => {
        if (!abortController.signal.aborted) {
          abortController.abort();
          try {
            await prisma.ghostwriterJob.update({
              where: { id: jobId },
              data: { status: "error", errorMsg: "Pipeline timed out. Try a shorter piece or simpler content type." },
            });
          } catch { /* best-effort */ }
          send({ type: "error", message: "Pipeline timed out. Try a shorter piece or simpler content type." });
          controller.close();
        }
      }, timeoutMs);

      try {
        // Send pipeline configuration to client
        send({ type: "pipeline", steps: pipelineSteps, tier });

        // ── Brief quality prediction (Grok — non-blocking) ──────────────
        // Run in parallel with planning to save time. Fires a warning SSE
        // event if the brief is weak, but does NOT block the pipeline.
        const briefQualityPromise = assessBriefQuality(
          interview, voiceProfile, resolvedContext
        ).catch(() => null);

        // ── Plan ─────────────────────────────────────────────────────────
        await setStep("planning", `Planning your ${typeLabel}…`);
        const plan = await planContent(
          voiceProfile, interview, resolvedContext, favoriteWords, authorContext
        );
        if (isAborted()) { controller.close(); return; }

        // Check brief quality result (already finished or finishing now)
        try {
          const briefAssessment = await briefQualityPromise;
          if (briefAssessment && briefAssessment.warnings.length > 0) {
            send({
              type: "brief_warning",
              score: briefAssessment.score,
              warnings: briefAssessment.warnings,
            });
          }
        } catch { /* non-blocking */ }

        // ── Research (all tiers except light) ─────────────────────────────
        // Research is gated by TOPIC NEEDS, not content format. A blog about
        // cancer studies needs research just as much as a whitepaper does.
        // assessResearchNeeds (Haiku) makes the call — we just give it the chance.
        let enrichedContext = resolvedContext;
        if (tier !== "light") {
          try {
            const assessment = await assessResearchNeeds(plan, interview, resolvedContext);
            if (!isAborted() && assessment.needed && assessment.queries.length > 0) {
              // Inject "researching" step into the pipeline UI if it wasn't
              // already there (deep tier has it; standard doesn't by default)
              if (tier !== "deep") {
                const updatedSteps = [
                  pipelineSteps[0], // planning
                  { key: "researching", label: "Researching your topic" },
                  ...pipelineSteps.slice(1),
                ];
                send({ type: "pipeline", steps: updatedSteps, tier });
              }
              await setStep("researching", "Researching your topic…");
              const researchResults: string[] = [];
              for (const query of assessment.queries.slice(0, 3)) {
                if (isAborted()) break;
                await setStep("researching", `Researching: ${query.slice(0, 60)}…`);
                try {
                  const result = await conductResearchGrok(query, {
                    topic: interview.topic,
                    angle: interview.angle,
                    contentType: interview.contentType,
                  });
                  if (result && result.trim()) {
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
          // Pace before first Opus draft (research used Haiku/Sonnet, different rate pool)
          await paceTransition(tier, "research->drafting_1", "drafting_1", send, isAborted);
          if (isAborted()) { controller.close(); return; }

          // Draft 1 (full samples) → study it → propose 1 variation → draft 2 (fingerprint only)
          await setStep("drafting_1", "Writing first draft…");
          const draft1 = await draftContent(
            voiceProfile, interview, plan, enrichedContext, favoriteWords, authorContext
          );
          if (isAborted()) { controller.close(); return; }

          // Propose variation: Sonnet reads draft 1 + voice profile and suggests
          // 1 alternative creative direction specific to this author
          await setStep("proposing", "Studying draft — proposing variation…");
          const variation = await proposeDraftVariation(
            draft1, voiceProfile, interview, plan
          );
          if (isAborted()) { controller.close(); return; }

          // Pace before second Opus draft
          await paceTransition(tier, "proposing->drafting_2", "drafting_2", send, isAborted);
          if (isAborted()) { controller.close(); return; }

          // Draft 2 uses condensed voice fingerprint (isFollowup=true) + reduced thinking budget
          await setStep("drafting_2", "Writing second draft…");
          const interview2: InterviewAnswers = {
            ...interview,
            toneNotes: [interview.toneNotes, variation.direction]
              .filter(Boolean).join(". "),
          };
          const draft2 = await draftContent(
            voiceProfile, interview2, plan, enrichedContext, favoriteWords, authorContext, true
          );
          if (isAborted()) { controller.close(); return; }

          // Persist raw drafts
          await prisma.ghostwriterJob.update({
            where: { id: jobId },
            data: { drafts: JSON.stringify([draft1, draft2]) },
          });

          // Compare & select best (Grok — analytical reasoning, cheaper than Opus for judgment)
          await setStep("comparing", "Comparing drafts against your voice…");
          selected = await compareDraftsGrok([draft1, draft2], voiceProfile, interview);
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
          // Pace before Opus draft call — use correct transition key based on
          // whether research ran (enrichedContext differs from resolvedContext)
          const didResearch = enrichedContext !== resolvedContext;
          const draftTransition = didResearch ? "research->drafting" : "planning->drafting";
          await paceTransition(tier, draftTransition, "drafting", send, isAborted);
          if (isAborted()) { controller.close(); return; }

          await setStep("drafting", `Writing your ${typeLabel}…`);
          selected = await draftContent(
            voiceProfile, interview, plan, enrichedContext, favoriteWords, authorContext
          );
          if (isAborted()) { controller.close(); return; }
        }

        // ── Self-review (runs BEFORE humanizer — every type) ────────────
        // Self-review checks voice fidelity, brief adherence, and fabrication.
        // It runs on the raw draft so it can catch content issues before the
        // humanizer does its final AI-pattern cleanup pass.
        const reviewTransition = tier === "deep" ? "checking->reviewing" : "drafting->reviewing";
        await paceTransition(tier, reviewTransition, "reviewing", send, isAborted);
        if (isAborted()) { controller.close(); return; }

        await setStep("reviewing", "Re-reading as you…");
        let reviewedDraft = selected;
        try {
          const reviewed = await selfReviewDraft(
            selected, voiceProfile, interview, editingPrefs,
            enrichedContext, favoriteWords, authorContext
          );
          if (reviewed && reviewed.trim()) {
            reviewedDraft = reviewed;
          }
        } catch { /* self-review failed — keep draft as-is */ }
        if (isAborted()) { controller.close(); return; }

        // ── Fabrication check (Grok + web search — non-light tiers) ──────
        // Verifies specific factual claims by searching the web. Replaces
        // fabricated specifics with honest placeholders the author can fill in.
        let checkedDraft = reviewedDraft;
        if (tier !== "light") {
          await paceTransition(tier, "reviewing->fact_checking", "fact_checking", send, isAborted);
          if (isAborted()) { controller.close(); return; }

          await setStep("fact_checking", "Fact-checking claims…");
          try {
            const { cleanDraft, fabricationsFound } = await checkFabrications(
              reviewedDraft, interview, enrichedContext
            );
            if (cleanDraft && cleanDraft.trim()) {
              checkedDraft = cleanDraft;
              if (fabricationsFound > 0) {
                send({
                  type: "fact_check_result",
                  fabricationsFound,
                  message: `Found and replaced ${fabricationsFound} unverifiable claim${fabricationsFound > 1 ? "s" : ""} with placeholders.`,
                });
              }
            }
          } catch { /* fact-check failed — keep draft as-is */ }
          if (isAborted()) { controller.close(); return; }
        }

        // ── Humanize (streams final output to client) ────────────────────
        const humanizeTransition = tier !== "light" ? "fact_checking->humanizing" : "reviewing->humanizing";
        await paceTransition(tier, humanizeTransition, "humanizing", send, isAborted);
        if (isAborted()) { controller.close(); return; }

        await setStep("humanizing", `Polishing your ${typeLabel}…`);
        const humanizedStream = await humanizeContent(
          checkedDraft, voiceProfile, HUMANIZER, interview.contentType,
          favoriteWords, authorContext,
          () => {
            send({ type: "step", step: "humanizing", label: `Humanizing your ${typeLabel}…` });
          }
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

        // ── Voice fidelity scoring (Grok — quality gate) ─────────────────
        // Scores how well the final output matches the author's voice.
        // If the score is below threshold, runs a targeted repair pass on
        // the flagged sentences using Grok, then re-scores once.
        await paceTransition(tier, "humanizing->scoring", "scoring", send, isAborted);
        if (isAborted()) { controller.close(); return; }

        await setStep("scoring", "Scoring voice fidelity…");
        try {
          const fidelityResult = await scoreVoiceFidelity(
            finalContent, voiceProfile, interview.contentType
          );
          send({
            type: "voice_score",
            score: fidelityResult.score,
            flags: fidelityResult.flags.slice(0, 5),
          });

          // If score is below threshold and we have actionable flags, repair
          if (
            fidelityResult.score < VOICE_FIDELITY_THRESHOLD &&
            fidelityResult.flags.length > 0 &&
            !isAborted()
          ) {
            await setStep("scoring", "Voice score low — repairing flagged sentences…");
            const repaired = await repairVoice(
              finalContent, voiceProfile, fidelityResult.flags.slice(0, 8),
              interview.contentType
            );
            if (repaired && repaired.trim() && repaired !== finalContent) {
              finalContent = repaired;
              // Clear streamed chunks and send the repaired version
              send({ type: "replace", text: finalContent });

              // Re-score to confirm improvement (one attempt only, no loop)
              if (!isAborted()) {
                await setStep("scoring", "Re-scoring after repair…");
                try {
                  const reScore = await scoreVoiceFidelity(
                    finalContent, voiceProfile, interview.contentType
                  );
                  send({
                    type: "voice_score",
                    score: reScore.score,
                    flags: reScore.flags.slice(0, 5),
                    repaired: true,
                  });
                } catch { /* re-score failed — we already have the repair */ }
              }
            }
          }
        } catch { /* scoring failed — continue without score */ }
        if (isAborted()) { controller.close(); return; }

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
        clearTimeout(timeoutTimer);
        // Clean up any files uploaded to the Files API
        if (resolvedContext) {
          deleteUploadedFiles(resolvedContext).catch(console.error);
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
