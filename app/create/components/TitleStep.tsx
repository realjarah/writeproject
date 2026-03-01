"use client";

import { useState } from "react";
import type { IntakeResult, BriefUpdater, GradeResult } from "../types";
import GradeBadge from "./GradeBadge";

interface Props {
  intake: IntakeResult;
  overrideType: string | null;
  answers: Record<string, string>;
  description: string;
  titleInput: string;
  onUpdate: BriefUpdater;
  gradeResult: GradeResult;
  onContinue: () => void;
}

export default function TitleStep({
  intake,
  overrideType,
  answers,
  description,
  titleInput,
  onUpdate,
  gradeResult,
  onContinue,
}: Props) {
  const [suggestedTitles, setSuggestedTitles] = useState<string[]>([]);
  const [suggesting, setSuggesting] = useState(false);

  async function suggestTitles() {
    if (suggesting) return;
    setSuggesting(true);
    try {
      const res = await fetch("/api/intake/suggest-titles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contentType: overrideType ?? intake.contentType ?? "blog",
          topic: intake.topic ?? description,
          angle: intake.angle ?? "",
          keyPoints: intake.keyPoints ?? "",
        }),
      });
      const data = await res.json();
      if (Array.isArray(data.titles)) setSuggestedTitles(data.titles);
    } catch { /* ignore */ }
    finally { setSuggesting(false); }
  }

  return (
    <div className="space-y-6">
      {/* Grade badge */}
      <GradeBadge result={gradeResult} />

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-sm text-black/[0.68] dark:text-white/[0.68]">
            Title <span className="text-black/[0.28] dark:text-white/[0.28] font-normal">&mdash; optional</span>
          </label>
          <button
            type="button"
            onClick={suggestTitles}
            disabled={suggesting}
            className="text-xs text-black/[0.35] dark:text-white/[0.35] hover:text-black/90 dark:hover:text-white transition-colors disabled:opacity-40"
          >
            {suggesting ? "Suggesting\u2026" : "Suggest titles \u2192"}
          </button>
        </div>
        <input
          type="text"
          value={titleInput}
          onChange={(e) => onUpdate("titleInput", e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              onContinue();
            }
          }}
          placeholder="Leave blank to let the ghost choose"
          className="w-full bg-black/[0.04] dark:bg-[#111] border border-black/[0.09] dark:border-white/[0.07] rounded-xl px-4 py-3 text-sm text-black/90 dark:text-white placeholder-black/[0.25] dark:placeholder-white/[0.22] focus:outline-none focus:border-black/[0.22] dark:focus:border-white/[0.22]"
          autoFocus
        />
        {suggestedTitles.length > 0 && (
          <div className="flex flex-wrap gap-2 pt-1">
            {suggestedTitles.map((t, i) => (
              <button
                key={i}
                type="button"
                onClick={() => onUpdate("titleInput", t)}
                className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                  titleInput === t
                    ? "border-black dark:border-white text-black/90 dark:text-white bg-black/[0.07] dark:bg-[#1e1e1e]"
                    : "border-black/[0.09] dark:border-white/[0.07] text-black/[0.55] dark:text-white/[0.55] hover:border-black/[0.18] dark:hover:border-white/[0.18] hover:text-black/90 dark:hover:text-white"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={onContinue}
        className="px-5 py-2.5 bg-black/[0.88] text-white dark:bg-white dark:text-black text-sm font-medium rounded-xl hover:bg-black/75 dark:hover:bg-white/90 transition-colors"
      >
        Review brief &rarr;
      </button>
    </div>
  );
}
