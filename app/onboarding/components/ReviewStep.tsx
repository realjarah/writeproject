import { Button } from "@/components/ui/button";
import { CONTENT_TYPE_LABELS } from "@/lib/content-types";
import StepIndicator from "./StepIndicator";
import ReviewSection from "./ReviewSection";
import type { Question, AddedSample, AccountType, Step } from "../types";

export default function ReviewStep({
  accountType,
  selectedTypes,
  questions,
  answers,
  samples,
  favoriteWords,
  setStep,
  setQuestionIndex,
  onSubmit,
  submitError,
  stepIndex,
  steps,
}: {
  accountType: AccountType;
  selectedTypes: string[];
  questions: Question[];
  answers: Record<string, string>;
  samples: AddedSample[];
  favoriteWords: string[];
  setStep: (s: Step) => void;
  setQuestionIndex: (fn: (i: number) => number) => void;
  onSubmit: () => void;
  submitError: string;
  stepIndex: number;
  steps: string[];
}) {
  const answeredQuestions = questions
    .map((q) => ({ question: q.prompt, answer: answers[q.id] ?? "" }))
    .filter((a) => a.answer.length > 0);

  return (
    <div className="max-w-2xl mx-auto space-y-8 pt-6 px-4">
      <StepIndicator current={stepIndex} steps={steps} />

      <div className="space-y-2">
        <h1 className="text-[22px] font-semibold text-black/90 dark:text-white tracking-tight">
          Here&apos;s what we&apos;ve learned about you
        </h1>
        <p className="text-[14px] text-black/45 dark:text-white/35 leading-relaxed">
          Review everything below. Click any section to edit before we build your voice profile.
        </p>
      </div>

      <ReviewSection title="Account type" onEdit={() => setStep("type")}>
        <p className="text-[14px] text-black/70 dark:text-white/60">
          {accountType === "brand" ? "Brand / Company" : "Individual"}
        </p>
      </ReviewSection>

      <ReviewSection
        title="What you write"
        onEdit={() => setStep("writing_types")}
        empty={selectedTypes.length === 0}
        emptyLabel="No formats selected"
      >
        <div className="flex flex-wrap gap-1.5">
          {selectedTypes.map((type) => (
            <span
              key={type}
              className="text-[12px] bg-black/[0.05] dark:bg-white/[0.06] border border-black/[0.08] dark:border-white/[0.07] rounded-md px-2.5 py-1 text-black/60 dark:text-white/50"
            >
              {CONTENT_TYPE_LABELS[type] ?? type}
            </span>
          ))}
        </div>
      </ReviewSection>

      <ReviewSection
        title="About you"
        onEdit={() => { setQuestionIndex(() => 0); setStep("questions"); }}
        empty={answeredQuestions.length === 0}
        emptyLabel="No questions answered"
      >
        <div className="space-y-3">
          {answeredQuestions.map((a, i) => (
            <div key={i} className="space-y-0.5">
              <p className="text-[11px] text-black/35 dark:text-white/25 font-medium">{a.question}</p>
              <p className="text-[13px] text-black/70 dark:text-white/60 leading-relaxed">{a.answer}</p>
            </div>
          ))}
        </div>
      </ReviewSection>

      <ReviewSection
        title="Writing samples"
        onEdit={() => setStep("samples")}
        empty={samples.length === 0}
        emptyLabel="No samples added"
      >
        <div className="space-y-2">
          {samples.map((s, i) => (
            <div key={i} className="space-y-1">
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400/80 shrink-0" />
                <span className="text-[13px] text-black/60 dark:text-white/50 truncate">{s.title}</span>
                <span className="text-[11px] text-black/30 dark:text-white/20">{s.wordCount.toLocaleString()} words</span>
                <span className="text-[10px] text-black/35 dark:text-white/25 bg-black/[0.04] dark:bg-white/[0.04] rounded px-1.5 py-0.5">
                  {CONTENT_TYPE_LABELS[s.category] ?? s.category}
                </span>
              </div>
              {s.notes && (
                <p className="text-[11px] text-black/35 dark:text-white/25 pl-4 italic">&ldquo;{s.notes}&rdquo;</p>
              )}
            </div>
          ))}
        </div>
      </ReviewSection>

      <ReviewSection
        title="Favorite words"
        onEdit={() => setStep("words")}
        empty={favoriteWords.length === 0}
        emptyLabel="None added"
      >
        <div className="flex flex-wrap gap-1.5">
          {favoriteWords.map((word) => (
            <span
              key={word}
              className="text-[12px] bg-black/[0.05] dark:bg-white/[0.06] border border-black/[0.08] dark:border-white/[0.07] rounded-md px-2.5 py-1 text-black/60 dark:text-white/50"
            >
              {word}
            </span>
          ))}
        </div>
      </ReviewSection>

      {submitError && <p className="text-[12px] text-red-400/80">{submitError}</p>}

      <div className="flex items-center justify-between pt-4 border-t border-black/[0.07] dark:border-white/[0.06]">
        <button
          type="button"
          onClick={() => setStep("words")}
          className="text-[12px] text-black/35 dark:text-white/25 hover:text-black/60 dark:hover:text-white/50 transition-colors"
        >
          &larr; Back
        </button>
        <Button type="button" onClick={onSubmit}>
          Build my voice profile
        </Button>
      </div>
    </div>
  );
}
