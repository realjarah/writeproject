"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { type ContextItem, CONTENT_TYPE_LABELS, CONTENT_TYPE_GROUPS } from "@/lib/content-types";
import { extractTemplateBrief, defaultTemplateName, type TemplateBrief } from "@/lib/template-utils";
import type {
  Step, BriefState, BriefUpdater, IntakeResult, Signature,
  QueuedJob, SavedBrief, Template, CustomType, SubVoiceStatus,
} from "./types";
import { INITIAL_BRIEF_STATE } from "./types";
import { calculateGrade } from "./grading";

// Step components
import DescribeStep from "./components/DescribeStep";
import CategoryStep from "./components/CategoryStep";
import DetailsStep from "./components/DetailsStep";
import ContextStep from "./components/ContextStep";
import TitleStep from "./components/TitleStep";
import BriefReview from "./components/BriefReview";

// ── Step indicator ──────────────────────────────────────────────────────────

const VISIBLE_STEPS: { key: Step; label: string }[] = [
  { key: "category", label: "Type" },
  { key: "details", label: "Details" },
  { key: "context", label: "Context" },
  { key: "title", label: "Title" },
  { key: "review", label: "Review" },
];

function StepIndicator({
  current,
  onNavigate,
}: {
  current: Step;
  onNavigate: (step: Step) => void;
}) {
  const currentIdx = VISIBLE_STEPS.findIndex((s) => s.key === current);
  if (currentIdx < 0) return null;

  return (
    <div className="flex items-center gap-1 mb-6">
      {VISIBLE_STEPS.map((s, i) => {
        const isActive = i === currentIdx;
        const isPast = i < currentIdx;
        return (
          <button
            key={s.key}
            type="button"
            onClick={() => isPast && onNavigate(s.key)}
            disabled={!isPast}
            className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] transition-colors ${
              isActive
                ? "text-black/90 dark:text-white font-semibold"
                : isPast
                ? "text-black/[0.35] dark:text-white/[0.35] hover:text-black/55 dark:hover:text-white/55 cursor-pointer"
                : "text-black/[0.18] dark:text-white/[0.18]"
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                isActive
                  ? "bg-black/80 dark:bg-white/80"
                  : isPast
                  ? "bg-black/[0.25] dark:bg-white/[0.25]"
                  : "bg-black/[0.10] dark:bg-white/[0.10]"
              }`}
            />
            {s.label}
          </button>
        );
      })}
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function CreatePage() {
  const router = useRouter();

  // Core state
  const [step, setStep] = useState<Step>("describe");
  const [briefState, setBriefState] = useState<BriefState>(INITIAL_BRIEF_STATE);
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);

  // Editing state
  const [editingBriefId, setEditingBriefId] = useState<number | null>(null);

  // External data
  const [signatures, setSignatures] = useState<Signature[]>([]);
  const [customTypes, setCustomTypes] = useState<CustomType[]>([]);
  const [queuedJobs, setQueuedJobs] = useState<QueuedJob[]>([]);
  const [savedBriefs, setSavedBriefs] = useState<SavedBrief[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);

  // Sub-voice status
  const [subVoiceStatus, setSubVoiceStatus] = useState<SubVoiceStatus>({
    hasProfile: false,
    subVoiceAvailable: false,
    trainedCategories: [],
  });
  const voiceAnalysisRef = useRef<Record<string, any> | null>(null);

  // ── Grade ──────────────────────────────────────────────────────────────

  const gradeResult = useMemo(() => calculateGrade(briefState), [briefState]);

  // ── BriefUpdater ────────────────────────────────────────────────────────

  const updateBrief: BriefUpdater = useCallback(<K extends keyof BriefState>(key: K, value: BriefState[K]) => {
    setBriefState((prev) => ({ ...prev, [key]: value }));
  }, []);

  // ── Load data on mount ────────────────────────────────────────────────

  function loadQueuedJobs() {
    fetch("/api/ghostwriter")
      .then((r) => r.json())
      .then((jobs: QueuedJob[]) => setQueuedJobs(jobs.filter((j) => j.status === "queued")))
      .catch(() => {});
  }

  function loadSavedBriefs() {
    fetch("/api/ghostwriter?status=draft")
      .then((r) => r.json())
      .then((briefs: SavedBrief[]) => setSavedBriefs(briefs))
      .catch(() => {});
  }

  useEffect(() => {
    loadQueuedJobs();
    loadSavedBriefs();
    fetch("/api/signatures")
      .then((r) => r.json())
      .then((sigs: Signature[]) => {
        setSignatures(sigs);
        const def = sigs.find((s) => s.isDefault);
        if (def) updateBrief("selectedSigId", def.id);
      });
    fetch("/api/custom-types")
      .then((r) => r.json())
      .then(setCustomTypes)
      .catch(() => {});
    fetch("/api/templates")
      .then((r) => r.json())
      .then((t: Template[]) => setTemplates(t))
      .catch(() => {});
    // Fetch voice profile for sub-voice status
    fetch("/api/voice/profile")
      .then((r) => r.json())
      .then((data) => {
        if (data?.analysis) {
          voiceAnalysisRef.current = data.analysis;
          const subVoices = data.analysis.subVoices ?? {};
          setSubVoiceStatus({
            hasProfile: true,
            subVoiceAvailable: false,
            trainedCategories: Object.keys(subVoices),
          });
        }
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Sub-voice recomputation ─────────────────────────────────────────

  function updateSubVoiceForType(contentType: string) {
    const analysis = voiceAnalysisRef.current;
    if (!analysis) {
      setSubVoiceStatus((prev) => ({ ...prev, subVoiceAvailable: false, subVoiceSummary: undefined }));
      return;
    }
    const subVoices = analysis.subVoices ?? {};
    const subVoice = subVoices[contentType];
    const guidelines = analysis.contentGuidelines?.[contentType];
    // Voice is available if we have a dedicated sub-voice OR format-specific guidelines
    const hasFormatVoice = !!subVoice || (Array.isArray(guidelines) && guidelines.length > 0);
    setSubVoiceStatus({
      hasProfile: true,
      subVoiceAvailable: hasFormatVoice,
      subVoiceSummary: subVoice?.summary,
      trainedCategories: Object.keys(subVoices),
    });
  }

  // ── Intake analysis ────────────────────────────────────────────────────

  async function analyze() {
    if (briefState.description.trim().length < 5) return;
    setAnalyzing(true);
    setStep("analyzing");
    setError("");

    try {
      const res = await fetch("/api/intake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: briefState.description }),
      });
      const data: IntakeResult = await res.json();
      updateBrief("intake", data);
      updateBrief("answers", {});
      updateSubVoiceForType(data.contentType);
      setStep("category");
    } catch {
      setError("Analysis failed. Please try again.");
      setStep("describe");
    } finally {
      setAnalyzing(false);
    }
  }

  // ── Start over ─────────────────────────────────────────────────────────

  function startOver() {
    setStep("describe");
    setBriefState(INITIAL_BRIEF_STATE);
    setError("");
  }

  // ── Build brief ─────────────────────────────────────────────────────────

  function buildBrief() {
    const { intake, overrideType, answers, description, titleInput,
      wordCountTarget, contextItems, draftText, draftData, draftFileName,
      draftMediaType, selectedSigId } = briefState;
    if (!intake) return null;

    const resolvedType = overrideType ?? intake.contentType ?? "blog";
    const customType = resolvedType.startsWith("custom_")
      ? customTypes.find((ct) => ct.slug === resolvedType)
      : undefined;

    const interview = {
      contentType: resolvedType,
      contentTypeLabel: customType?.name || undefined,
      topic: intake.topic ?? answers.topic ?? "",
      angle: intake.angle ?? answers.angle ?? "",
      keyPoints: intake.keyPoints ?? answers.keyPoints ?? "",
      targetAudience: intake.targetAudience ?? answers.targetAudience ?? undefined,
      toneNotes: intake.toneNotes ?? answers.toneNotes ?? undefined,
      title: titleInput.trim() || undefined,
      wordCountTarget: wordCountTarget.trim() || undefined,
    };

    const allItems: ContextItem[] = [];
    if (description.trim()) {
      allItems.push({
        tag: "note",
        text: description.trim(),
        instructions: "Author's original brief — use any specific details, examples, or context from it.",
      });
    }
    allItems.push(...contextItems);

    if (draftText.trim() || draftData) {
      const draftInstructions =
        "User provided existing material. Assess it — full draft, outline, or rough notes — and write the piece in the author's voice accordingly.";
      if (draftData && draftMediaType) {
        allItems.push({ tag: "note", fileName: draftFileName || "draft.pdf", data: draftData, mediaType: draftMediaType, instructions: draftInstructions });
      } else {
        allItems.push({ tag: "note", text: draftText.trim(), instructions: draftInstructions });
      }
    }

    const selectedSig = signatures.find((s) => s.id === selectedSigId) ?? null;

    return {
      interview,
      context: allItems.length > 0 ? { items: allItems } : undefined,
      signatureContent: selectedSig?.content ?? undefined,
      briefGrade: gradeResult.grade,
      briefScore: gradeResult.score,
    };
  }

  // ── Send / Save ─────────────────────────────────────────────────────────

  async function sendToGhostwriter() {
    setError("");
    setSending(true);
    try {
      const brief = buildBrief();
      if (!brief) { setSending(false); return; }
      const { intake } = briefState;
      await fetch("/api/ghostwriter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contentType: brief.interview.contentType,
          topic: brief.interview.topic,
          title: briefState.titleInput.trim(),
          summaryText: intake?.summary ?? "",
          brief: JSON.stringify(brief),
          briefGrade: gradeResult.grade,
        }),
      });
      router.push("/ghostwriter");
    } catch {
      setError("Failed to send to ghostwriter. Please try again.");
      setSending(false);
    }
  }

  async function saveForLater() {
    setError("");
    setSending(true);
    try {
      const brief = buildBrief();
      if (!brief) { setSending(false); return; }
      const { intake } = briefState;
      const isEditing = editingBriefId !== null;
      const body = {
        contentType: brief.interview.contentType,
        topic: brief.interview.topic,
        title: briefState.titleInput.trim(),
        summaryText: intake?.summary ?? "",
        brief: JSON.stringify(brief),
        briefGrade: gradeResult.grade,
        ...(isEditing ? {} : { status: "draft" }),
      };

      if (isEditing) {
        await fetch(`/api/ghostwriter/${editingBriefId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      } else {
        await fetch("/api/ghostwriter", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      }
      setEditingBriefId(null);
      loadSavedBriefs();
      startOver();
    } catch {
      setError("Failed to save. Please try again.");
    } finally {
      setSending(false);
    }
  }

  async function saveTemplate(name: string) {
    const brief = buildBrief();
    if (!brief) return;
    const tBrief = extractTemplateBrief(JSON.stringify(brief), briefState.selectedSigId);
    const finalName = name.trim() || defaultTemplateName(tBrief);
    const res = await fetch("/api/templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: finalName,
        contentType: tBrief.interview.contentType,
        brief: JSON.stringify(tBrief),
      }),
    });
    if (res.ok) {
      const created = await res.json();
      setTemplates((prev) => [created, ...prev]);
    }
  }

  // ── Job / brief management ──────────────────────────────────────────────

  async function deleteQueuedJob(id: number) {
    await fetch(`/api/ghostwriter/${id}`, { method: "DELETE" });
    setQueuedJobs((prev) => prev.filter((j) => j.id !== id));
  }

  async function deleteSavedBrief(id: number) {
    await fetch(`/api/ghostwriter/${id}`, { method: "DELETE" });
    setSavedBriefs((prev) => prev.filter((b) => b.id !== id));
  }

  async function sendSavedBrief(id: number) {
    await fetch(`/api/ghostwriter/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "queued" }),
    });
    setSavedBriefs((prev) => prev.filter((b) => b.id !== id));
    router.push("/ghostwriter");
  }

  function editSavedBrief(brief: SavedBrief) {
    try {
      const parsed = JSON.parse(brief.brief) as {
        interview: Record<string, string | undefined>;
        context?: { items: ContextItem[] };
        signatureContent?: string;
      };
      const iv = parsed.interview;

      const syntheticIntake: IntakeResult = {
        contentType: iv.contentType ?? "blog",
        topic: iv.topic ?? null,
        angle: iv.angle ?? null,
        keyPoints: iv.keyPoints ?? null,
        targetAudience: iv.targetAudience ?? null,
        toneNotes: iv.toneNotes ?? null,
        summary: brief.summaryText,
        questions: [],
      };

      // Restore context items (skip auto-added brief note)
      const items = parsed.context?.items ?? [];
      const contextOnly = items.filter(
        (it) => !(it.tag === "note" && it.instructions?.includes("Author's original brief"))
      );

      // Restore signature
      let sigId: number | null = null;
      if (parsed.signatureContent) {
        const matchingSig = signatures.find((s) => s.content === parsed.signatureContent);
        if (matchingSig) sigId = matchingSig.id;
      }

      setBriefState({
        description: brief.summaryText || iv.topic || "",
        intake: syntheticIntake,
        answers: {},
        overrideType: iv.contentType ?? null,
        titleInput: iv.title ?? brief.title ?? "",
        wordCountTarget: iv.wordCountTarget ?? "",
        contextItems: contextOnly,
        draftText: "",
        draftFileName: "",
        draftData: "",
        draftMediaType: "",
        selectedSigId: sigId,
      });

      setEditingBriefId(brief.id);
      updateSubVoiceForType(iv.contentType ?? "blog");
      setStep("category");
    } catch {
      setError("Failed to load saved brief.");
    }
  }

  function applyTemplate(template: Template) {
    const tBrief: TemplateBrief = JSON.parse(template.brief);
    const interview = tBrief.interview;

    const questions = [
      { id: "topic", label: "What's the topic?", placeholder: "The specific subject for this piece" },
    ] as { id: string; label: string; placeholder: string }[];
    if (!interview.angle) {
      questions.push({ id: "angle", label: "Angle or perspective", placeholder: "What's your unique take?" });
    }
    if (!interview.keyPoints) {
      questions.push({ id: "keyPoints", label: "Key points to cover", placeholder: "Main ideas, arguments, or sections" });
    }

    const syntheticIntake: IntakeResult = {
      contentType: interview.contentType,
      topic: null,
      angle: interview.angle ?? null,
      keyPoints: interview.keyPoints ?? null,
      targetAudience: interview.targetAudience ?? null,
      toneNotes: interview.toneNotes ?? null,
      summary: `Template: ${template.name}`,
      questions,
    };

    setBriefState({
      ...INITIAL_BRIEF_STATE,
      intake: syntheticIntake,
      overrideType: interview.contentType,
      wordCountTarget: interview.wordCountTarget ?? "",
      contextItems: tBrief.context?.items ?? [],
      selectedSigId: tBrief.signatureId ?? null,
    });

    updateSubVoiceForType(interview.contentType);
    setError("");
    setStep("details");
  }

  // ── Type override handler ────────────────────────────────────────────

  function handleOverrideType(type: string) {
    updateBrief("overrideType", type);
    updateSubVoiceForType(type);
  }

  // ── Render ─────────────────────────────────────────────────────────────

  const showStepIndicator = ["category", "details", "context", "title", "review"].includes(step);

  return (
    <div className="space-y-4">
      {/* Step indicator bar */}
      {showStepIndicator && (
        <div className="flex items-center justify-between">
          <StepIndicator current={step} onNavigate={setStep} />
          <button
            type="button"
            onClick={startOver}
            className="text-xs text-black/[0.28] dark:text-white/[0.28] hover:text-black/55 dark:hover:text-white/55 transition-colors"
          >
            &larr; Start over
          </button>
        </div>
      )}

      {/* Describe */}
      {step === "describe" && (
        <DescribeStep
          description={briefState.description}
          onDescriptionChange={(v) => updateBrief("description", v)}
          onAnalyze={analyze}
          templates={templates}
          onApplyTemplate={applyTemplate}
          savedBriefs={savedBriefs}
          onEditSavedBrief={editSavedBrief}
          onDeleteSavedBrief={deleteSavedBrief}
          onSendSavedBrief={sendSavedBrief}
          queuedJobs={queuedJobs}
          onDeleteQueuedJob={deleteQueuedJob}
          onOpenGhostwriter={() => router.push("/ghostwriter")}
        />
      )}

      {/* Analyzing */}
      {step === "analyzing" && (
        <div className="flex items-center gap-3 py-12">
          <span className="inline-block w-1.5 h-1.5 bg-black/[0.35] dark:bg-white/[0.35] rounded-full animate-pulse" />
          <span className="text-sm text-black/[0.35] dark:text-white/[0.35]">Analyzing your brief...</span>
        </div>
      )}

      {/* Category */}
      {step === "category" && briefState.intake && (
        <CategoryStep
          intake={briefState.intake}
          overrideType={briefState.overrideType}
          onOverrideType={handleOverrideType}
          customTypes={customTypes}
          subVoiceStatus={subVoiceStatus}
          gradeResult={gradeResult}
          onContinue={() => setStep("details")}
        />
      )}

      {/* Details */}
      {step === "details" && briefState.intake && (
        <DetailsStep
          intake={briefState.intake}
          answers={briefState.answers}
          wordCountTarget={briefState.wordCountTarget}
          onUpdate={updateBrief}
          gradeResult={gradeResult}
          onContinue={() => setStep("context")}
        />
      )}

      {/* Context */}
      {step === "context" && briefState.intake && (
        <ContextStep
          intake={briefState.intake}
          overrideType={briefState.overrideType}
          contextItems={briefState.contextItems}
          draftText={briefState.draftText}
          draftFileName={briefState.draftFileName}
          draftData={briefState.draftData}
          draftMediaType={briefState.draftMediaType}
          signatures={signatures}
          selectedSigId={briefState.selectedSigId}
          onUpdate={updateBrief}
          gradeResult={gradeResult}
          onContinue={() => setStep("title")}
        />
      )}

      {/* Title */}
      {step === "title" && briefState.intake && (
        <TitleStep
          intake={briefState.intake}
          overrideType={briefState.overrideType}
          answers={briefState.answers}
          description={briefState.description}
          titleInput={briefState.titleInput}
          onUpdate={updateBrief}
          gradeResult={gradeResult}
          onContinue={() => setStep("review")}
        />
      )}

      {/* Review */}
      {step === "review" && briefState.intake && (
        <BriefReview
          briefState={briefState}
          intake={briefState.intake}
          overrideType={briefState.overrideType}
          signatures={signatures}
          subVoiceStatus={subVoiceStatus}
          gradeResult={gradeResult}
          sending={sending}
          error={error}
          onJumpToStep={setStep}
          onSendToGhostwriter={sendToGhostwriter}
          onSaveForLater={saveForLater}
          onSaveTemplate={saveTemplate}
        />
      )}

      {/* Saved confirmation (after redirect — generally not shown since we redirect) */}
      {step === "saved" && (
        <div className="bg-black/[0.04] dark:bg-[#161616] border border-black/[0.10] dark:border-[#2a2a2a] rounded-xl p-8 text-center space-y-4">
          <div className="flex items-center justify-center gap-2 text-emerald-400">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            <span className="text-sm font-medium">Saved to Ghostwriter</span>
          </div>
          <p className="text-black/[0.35] dark:text-white/[0.35] text-sm">Your brief is queued. Head to the Ghostwriter tab when you&apos;re ready to run it.</p>
          <div className="flex items-center justify-center gap-4">
            <button type="button" onClick={() => router.push("/ghostwriter")} className="bg-black/[0.88] text-white dark:bg-white dark:text-black text-sm font-medium px-4 py-2 rounded-lg hover:bg-black/75 dark:hover:bg-white/90 transition-colors">
              Go to Ghostwriter
            </button>
            <button type="button" onClick={startOver} className="text-black/[0.35] dark:text-white/[0.35] text-sm hover:text-black/55 dark:hover:text-white/55 transition-colors">
              Write another
            </button>
          </div>
        </div>
      )}

      {/* Error display for non-review steps */}
      {error && step !== "review" && (
        <p className="text-xs text-red-400">{error}</p>
      )}
    </div>
  );
}
