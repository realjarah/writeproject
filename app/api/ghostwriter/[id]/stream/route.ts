export const dynamic = "force-dynamic";
export const maxDuration = 800; // Vercel Pro plan max — deep-tier pipelines (research papers, whitepapers) can run 9+ AI stages

import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getUserId } from "@/lib/session";
import {
  planContent,
  draftContent,
  conductResearch,
  assessResearchNeeds,
  selfReviewDraft,
  humanize,
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

// Approximate word count range per content type (min, max).
const WORD_RANGES: Record<string, [number, number]> = {
  // Personal
  notes: [50, 500], list: [20, 300], ai_prompt: [50, 500], letter: [200, 800],
  thank_you_note: [50, 200], review: [100, 500], bio: [50, 300], text_message: [5, 50],
  // Social Media
  social: [20, 300], twitter_thread: [200, 2000], caption: [10, 100],
  // Professional
  email: [50, 400], proposal: [500, 3000], cover_letter: [250, 400], resume: [300, 800],
  press_release: [300, 600], scope_of_work: [500, 2000], rfp: [500, 3000],
  // Business
  business_plan: [1500, 10000], report: [500, 4000], case_study: [800, 2500], handbook: [1000, 10000],
  // Marketing & Content
  blog: [600, 1400], newsletter: [200, 1000], ad_copy: [25, 200], product_description: [50, 300],
  // Education
  lesson_plan: [300, 1000], course: [500, 10000], guide: [500, 2000], textbook_chapter: [1500, 20000],
  // Academic & Technical
  research: [1500, 20000], technical: [500, 10000], whitepaper: [1500, 10000],
  // Creative & Spoken
  essay: [500, 2000], speech: [500, 2500], script: [500, 3000],
};

function wordCount(text: string) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

// ── Adaptive pipeline tiers ─────────────────────────────────────────────────

const DEEP_TYPES = new Set([
  "essay", "report", "whitepaper", "research", "technical", "proposal", "case_study", "textbook_chapter",
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
        { key: "reviewing", label: "Final review as you" },
        { key: "humanizing", label: "Cleaning up AI tells" },
      ];
    case "standard":
      return [
        { key: "planning", label: `Planning your ${typeLabel}` },
        { key: "drafting", label: `Writing your ${typeLabel}` },
        { key: "reviewing", label: "Final review as you" },
        { key: "humanizing", label: "Cleaning up AI tells" },
      ];
    case "deep":
      return [
        { key: "planning", label: `Planning your ${typeLabel}` },
        { key: "researching", label: "Researching your topic" },
        { key: "drafting", label: `Writing your ${typeLabel}` },
        { key: "checking", label: "Checking word count & structure" },
        { key: "reviewing", label: "Final review as you" },
        { key: "humanizing", label: "Cleaning up AI tells" },
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
      baseMs: 400, jitterMs: 300,
      messages: ["Cleaning up…"],
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
    "reviewing->humanizing": {
      baseMs: 400, jitterMs: 300,
      messages: ["Cleaning up…"],
    },
  },
  deep: {
    "research->drafting": {
      baseMs: 800, jitterMs: 500,
      messages: ["Preparing draft approach…"],
    },
    "planning->drafting": {
      baseMs: 800, jitterMs: 500,
      messages: ["Mapping structure to your voice…"],
    },
    "checking->reviewing": {
      baseMs: 800, jitterMs: 500,
      messages: ["Reviewing draft…"],
    },
    "reviewing->humanizing": {
      baseMs: 400, jitterMs: 300,
      messages: ["Cleaning up…"],
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

      // Track best available content so a timeout delivers work, not an error.
      let bestContent: string | null = null;
      let bestStage = "";

      // Safety net: if the pipeline hasn't finished before the hard timeout,
      // deliver whatever content we have instead of showing an error.
      const SAFETY_MARGIN_MS = 15_000;
      const timeoutMs = (maxDuration * 1000) - SAFETY_MARGIN_MS;
      const timeoutTimer = setTimeout(async () => {
        if (!abortController.signal.aborted) {
          abortController.abort();
          try {
            if (bestContent) {
              // We have usable content — deliver it as a success
              const dbContent = signatureContent
                ? `${bestContent}\n\n${signatureContent}`
                : bestContent;
              await prisma.ghostwriterJob.update({
                where: { id: jobId },
                data: { status: "done", stepLabel: "Done", finalDraft: dbContent },
              });
              send({ type: "chunk", text: dbContent });
              send({ type: "done", finalDraft: dbContent });
            } else {
              // No content yet (still planning/researching) — genuine timeout
              await prisma.ghostwriterJob.update({
                where: { id: jobId },
                data: { status: "error", errorMsg: "Pipeline timed out before drafting could complete. Try a shorter piece or simpler content type." },
              });
              send({ type: "error", message: "Pipeline timed out before drafting could complete. Try a shorter piece or simpler content type." });
            }
          } catch { /* best-effort */ }
          controller.close();
        }
      }, timeoutMs);

      const stopHeartbeat = startHeartbeat(send, isAborted);

      try {
        // Send pipeline configuration to client
        send({ type: "pipeline", steps: pipelineSteps, tier });

        // ── Plan ─────────────────────────────────────────────────────────
        await setStep("planning", `Planning your ${typeLabel}…`);
        const plan = await planContent(
          voiceProfile, interview, resolvedContext, favoriteWords, authorContext
        );
        if (isAborted()) { controller.close(); return; }

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
          // Pace before Opus draft
          const didResearch = enrichedContext !== resolvedContext;
          const deepTransition = didResearch ? "research->drafting" : "planning->drafting";
          await paceTransition(tier, deepTransition, "drafting", send, isAborted);
          if (isAborted()) { controller.close(); return; }

          // Single draft (full voice profile)
          await setStep("drafting", `Writing your ${typeLabel}…`);
          selected = await draftContent(
            voiceProfile, interview, plan, enrichedContext, favoriteWords, authorContext
          );
          if (isAborted()) { controller.close(); return; }

          // Persist raw draft — also save as bestContent so timeout can deliver it
          bestContent = selected;
          bestStage = "drafted";
          await prisma.ghostwriterJob.update({
            where: { id: jobId },
            data: { drafts: JSON.stringify([selected]) },
          });

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
          bestContent = selected;
          bestStage = "drafted";
          if (isAborted()) { controller.close(); return; }
        }

        // ── Self-review (FINAL STAGE — voice fidelity, AI cleanup, fabrication) ──
        const reviewTransition = tier === "deep" ? "checking->reviewing" : "drafting->reviewing";
        await paceTransition(tier, reviewTransition, "reviewing", send, isAborted);
        if (isAborted()) { controller.close(); return; }

        await setStep("reviewing", "Final review as you…");
        let finalContent = selected;
        try {
          const reviewed = await selfReviewDraft(
            selected, voiceProfile, interview, editingPrefs,
            enrichedContext, favoriteWords, authorContext
          );
          if (reviewed && reviewed.trim()) {
            finalContent = reviewed;
          }
        } catch { /* self-review failed — keep draft as-is */ }
        bestContent = finalContent;
        bestStage = "reviewed";
        if (isAborted()) { controller.close(); return; }

        // ── Humanizer (clerical post-processing — em dashes, thesis repeat, titles) ──
        await paceTransition(tier, "reviewing->humanizing", "humanizing", send, isAborted);
        if (isAborted()) { controller.close(); return; }

        await setStep("humanizing", "Cleaning up AI tells…");
        try {
          const humanized = await humanize(finalContent, interview.contentType);
          if (humanized && humanized.trim()) {
            finalContent = humanized;
          }
        } catch { /* humanizer failed — keep reviewed draft as-is */ }
        bestContent = finalContent;
        bestStage = "humanized";
        if (isAborted()) { controller.close(); return; }

        // Send the final content to the client
        send({ type: "chunk", text: finalContent });

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
        // Use the actual error message for known pipeline failures (empty draft,
        // overloaded model) so the user understands what happened. Fall back to
        // generic message only for truly unknown errors.
        const isKnownPipelineError = msg.includes("produced no output")
          || msg.includes("empty draft")
          || msg.includes("failed silently")
          || msg.includes("timed out");
        const userMsg = isKnownPipelineError
          ? msg
          : "Ghostwriting failed. Please try again.";
        await prisma.ghostwriterJob
          .update({ where: { id: jobId }, data: { status: "error", errorMsg: msg } })
          .catch(console.error);
        send({ type: "error", message: userMsg });
      } finally {
        stopHeartbeat();
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
