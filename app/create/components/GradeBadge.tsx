"use client";

import type { GradeResult, BriefGrade } from "../types";
import { gradeColor, gradeHint } from "../grading";

const GRADE_STEPS: BriefGrade[] = ["D", "C", "B", "A", "A+"];

function gradeIndex(g: BriefGrade) {
  return GRADE_STEPS.indexOf(g);
}

/** Compact pill — for saved-idea cards */
export function GradeBadgeCompact({ grade }: { grade: BriefGrade }) {
  const color = gradeColor(grade);
  return (
    <span
      className="inline-flex items-center justify-center text-[10px] font-bold px-1.5 py-0.5 rounded"
      style={{ color, backgroundColor: color + "22" }}
    >
      {grade}
    </span>
  );
}

/** Full badge — grade letter + segmented bar + hint */
export default function GradeBadge({ result }: { result: GradeResult }) {
  const color = gradeColor(result.grade);
  const idx = gradeIndex(result.grade);
  const hint = gradeHint(result.grade);

  return (
    <div className="flex items-center gap-3">
      {/* Grade letter */}
      <span
        className="text-lg font-bold leading-none transition-all duration-300"
        style={{ color }}
      >
        {result.grade}
      </span>

      {/* Segmented bar */}
      <div className="flex gap-0.5 flex-1 max-w-[120px]">
        {GRADE_STEPS.map((step, i) => (
          <div
            key={step}
            className="h-1.5 flex-1 rounded-full transition-all duration-300"
            style={{
              backgroundColor: i <= idx ? color : "rgba(128,128,128,0.15)",
            }}
          />
        ))}
      </div>

      {/* Hint */}
      <span className="text-[11px] text-black/[0.35] dark:text-white/[0.35] leading-tight">
        {hint}
      </span>
    </div>
  );
}
