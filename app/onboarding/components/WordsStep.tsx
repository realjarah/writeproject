import { useState } from "react";
import { Button } from "@/components/ui/button";
import StepIndicator from "./StepIndicator";
import type { Step } from "../types";

export default function WordsStep({
  favoriteWords,
  setFavoriteWords,
  setStep,
  stepIndex,
  steps,
}: {
  favoriteWords: string[];
  setFavoriteWords: (fn: (prev: string[]) => string[]) => void;
  setStep: (s: Step) => void;
  stepIndex: number;
  steps: string[];
}) {
  const [wordInput, setWordInput] = useState("");

  function addWord() {
    const trimmed = wordInput.trim();
    if (!trimmed) return;
    if (favoriteWords.includes(trimmed.toLowerCase())) { setWordInput(""); return; }
    setFavoriteWords((prev) => [...prev, trimmed.toLowerCase()]);
    setWordInput("");
  }

  function removeWord(word: string) {
    setFavoriteWords((prev) => prev.filter((w) => w !== word));
  }

  return (
    <div className="max-w-2xl mx-auto space-y-8 pt-6 px-4">
      <StepIndicator current={stepIndex} steps={steps} />

      <div className="space-y-2">
        <h1 className="text-[22px] font-semibold text-black/90 dark:text-white tracking-tight">
          Got any favorite words?
        </h1>
        <p className="text-[14px] text-black/45 dark:text-white/35 leading-relaxed">
          Words or phrases you love using, find yourself reaching for, or just think are beautiful.
          Your ghostwriter will naturally weave these in when they fit.
        </p>
      </div>

      <div className="space-y-4">
        <div className="flex gap-2">
          <input
            type="text"
            value={wordInput}
            onChange={(e) => setWordInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addWord(); } }}
            placeholder='e.g. "luminous", "unravel", "the thing is"\u2026'
            className="flex-1 bg-black/[0.03] dark:bg-white/[0.03] border border-black/[0.09] dark:border-white/[0.08] rounded-xl px-4 py-2.5 text-[14px] text-black/85 dark:text-white/80 placeholder-black/25 dark:placeholder-white/15 focus:outline-none focus:border-black/[0.18] dark:focus:border-white/[0.18] transition-colors"
          />
          <Button type="button" variant="ghost" onClick={addWord} disabled={!wordInput.trim()}>
            Add
          </Button>
        </div>

        {favoriteWords.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {favoriteWords.map((word) => (
              <span
                key={word}
                className="inline-flex items-center gap-1.5 bg-black/[0.05] dark:bg-white/[0.06] border border-black/[0.09] dark:border-white/[0.08] rounded-lg px-3 py-1.5 text-[13px] text-black/70 dark:text-white/60"
              >
                {word}
                <button
                  type="button"
                  onClick={() => removeWord(word)}
                  className="text-black/25 dark:text-white/20 hover:text-black/60 dark:hover:text-white/50 transition-colors"
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </span>
            ))}
          </div>
        )}

        {favoriteWords.length === 0 && (
          <p className="text-[12px] text-black/25 dark:text-white/15">
            No pressure &mdash; you can always add these later from your profile.
          </p>
        )}
      </div>

      <div className="flex items-center justify-between pt-4 border-t border-black/[0.07] dark:border-white/[0.06]">
        <button
          type="button"
          onClick={() => setStep("samples")}
          className="text-[12px] text-black/35 dark:text-white/25 hover:text-black/60 dark:hover:text-white/50 transition-colors"
        >
          &larr; Back
        </button>
        <Button type="button" onClick={() => setStep("review")}>
          Review everything
        </Button>
      </div>
    </div>
  );
}
