import { Button } from "@/components/ui/button";
import { CONTENT_TYPE_GROUPS, CONTENT_TYPE_LABELS } from "@/lib/content-types";
import StepIndicator from "./StepIndicator";
import type { Step } from "../types";

const ALL_TYPES = CONTENT_TYPE_GROUPS.flatMap((g) => g.types);

export default function WritingTypesStep({
  selectedTypes,
  setSelectedTypes,
  setStep,
  stepIndex,
  steps,
}: {
  selectedTypes: string[];
  setSelectedTypes: (fn: (prev: string[]) => string[]) => void;
  setStep: (s: Step) => void;
  stepIndex: number;
  steps: string[];
}) {
  function toggleType(type: string) {
    setSelectedTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    );
  }

  function toggleAll() {
    setSelectedTypes((prev) =>
      prev.length === ALL_TYPES.length ? [] : [...ALL_TYPES]
    );
  }

  const allSelected = selectedTypes.length === ALL_TYPES.length;

  return (
    <div className="max-w-2xl mx-auto space-y-8 pt-6 px-4">
      <StepIndicator current={stepIndex} steps={steps} />

      <div className="space-y-2">
        <h1 className="text-[24px] font-semibold text-black/90 dark:text-white tracking-tight leading-snug">
          What do you want your ghostwriter to write?
        </h1>
        <p className="text-[14px] text-black/45 dark:text-white/35 leading-relaxed">
          Select everything that applies. We&apos;ll train your ghostwriter on each format you pick.
        </p>
      </div>

      <div className="space-y-6">
        {/* All toggle */}
        <button
          type="button"
          onClick={toggleAll}
          className={`px-4 py-2 rounded-xl text-[13px] font-semibold border transition-all duration-150 ${
            allSelected
              ? "bg-black/[0.08] dark:bg-white/[0.10] border-black/20 dark:border-white/20 text-black/85 dark:text-white/90"
              : "bg-black/[0.02] dark:bg-white/[0.02] border-black/[0.08] dark:border-white/[0.07] text-black/50 dark:text-white/40 hover:border-black/15 dark:hover:border-white/15 hover:text-black/70 dark:hover:text-white/60"
          }`}
        >
          {allSelected ? (
            <svg className="w-3.5 h-3.5 inline mr-1.5 -mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          ) : null}
          All formats
        </button>

        {CONTENT_TYPE_GROUPS.map((group) => (
          <div key={group.label} className="space-y-2.5">
            <p className="text-[11px] tracking-[0.12em] uppercase text-black/35 dark:text-white/25 font-semibold">
              {group.label}
            </p>
            <div className="flex flex-wrap gap-2">
              {group.types.map((type) => {
                const selected = selectedTypes.includes(type);
                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() => toggleType(type)}
                    className={`px-3.5 py-2 rounded-xl text-[13px] font-medium border transition-all duration-150 ${
                      selected
                        ? "bg-black/[0.08] dark:bg-white/[0.10] border-black/20 dark:border-white/20 text-black/85 dark:text-white/90"
                        : "bg-black/[0.02] dark:bg-white/[0.02] border-black/[0.08] dark:border-white/[0.07] text-black/50 dark:text-white/40 hover:border-black/15 dark:hover:border-white/15 hover:text-black/70 dark:hover:text-white/60"
                    }`}
                  >
                    {selected && (
                      <svg className="w-3.5 h-3.5 inline mr-1.5 -mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                    {CONTENT_TYPE_LABELS[type]}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {selectedTypes.length > 0 && (
        <p className="text-[12px] text-black/40 dark:text-white/30">
          {selectedTypes.length} format{selectedTypes.length !== 1 ? "s" : ""} selected
        </p>
      )}

      <div className="flex items-center justify-between pt-4 border-t border-black/[0.07] dark:border-white/[0.06]">
        <button
          type="button"
          onClick={() => setStep("type")}
          className="text-[12px] text-black/35 dark:text-white/25 hover:text-black/60 dark:hover:text-white/50 transition-colors"
        >
          &larr; Back
        </button>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setStep("questions")}
            className="text-[12px] text-black/35 dark:text-white/25 hover:text-black/55 dark:hover:text-white/45 transition-colors"
          >
            Skip
          </button>
          <Button type="button" onClick={() => setStep("questions")}>
            Continue
          </Button>
        </div>
      </div>
    </div>
  );
}
