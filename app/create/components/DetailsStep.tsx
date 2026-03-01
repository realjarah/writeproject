"use client";

import { useState } from "react";
import type { IntakeResult, BriefUpdater, GradeResult } from "../types";
import GradeBadge from "./GradeBadge";

interface Props {
  intake: IntakeResult;
  answers: Record<string, string>;
  wordCountTarget: string;
  onUpdate: BriefUpdater;
  gradeResult: GradeResult;
  onContinue: () => void;
}

export default function DetailsStep({
  intake,
  answers,
  wordCountTarget,
  onUpdate,
  gradeResult,
  onContinue,
}: Props) {
  const questions = intake.questions ?? [];
  const [currentQ, setCurrentQ] = useState(0);
  const [showOptional, setShowOptional] = useState(false);

  const currentAnswer = questions[currentQ] ? (answers[questions[currentQ].id] ?? "") : "";
  const isLastQuestion = currentQ >= questions.length - 1;
  const allQuestionsAnswered = currentQ >= questions.length || showOptional;

  function setAnswer(id: string, value: string) {
    onUpdate("answers", { ...answers, [id]: value });
  }

  function nextQuestion() {
    if (isLastQuestion || currentQ >= questions.length - 1) {
      setShowOptional(true);
      setCurrentQ(questions.length);
    } else {
      setCurrentQ((i) => i + 1);
    }
  }

  // Intake-derived optional fields (may already be set from analysis)
  const targetAudience = intake.targetAudience ?? answers.targetAudience ?? "";
  const toneNotes = intake.toneNotes ?? answers.toneNotes ?? "";

  return (
    <div className="space-y-6">
      {/* Grade badge */}
      <GradeBadge result={gradeResult} />

      {/* One-at-a-time questions */}
      {!allQuestionsAnswered && questions.length > 0 && (
        <div className="space-y-4">
          {/* Progress dots */}
          <div className="flex items-center gap-1.5">
            {questions.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => { if (i <= currentQ) setCurrentQ(i); }}
                className={`w-2 h-2 rounded-full transition-all ${
                  i === currentQ
                    ? "bg-black/80 dark:bg-white/80 scale-125"
                    : i < currentQ
                    ? "bg-black/[0.25] dark:bg-white/[0.25] cursor-pointer hover:bg-black/40 dark:hover:bg-white/40"
                    : "bg-black/[0.10] dark:bg-white/[0.10]"
                }`}
              />
            ))}
            {/* Extra dot for optional fields */}
            <div className="w-2 h-2 rounded-full bg-black/[0.10] dark:bg-white/[0.10]" />
          </div>

          {/* Current question */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-black/[0.68] dark:text-white/[0.68]">
              {questions[currentQ].label}
            </label>
            {questions[currentQ].id === "angle" || questions[currentQ].id === "keyPoints" ? (
              <textarea
                value={currentAnswer}
                onChange={(e) => setAnswer(questions[currentQ].id, e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && currentAnswer.trim()) {
                    e.preventDefault();
                    nextQuestion();
                  }
                }}
                placeholder={questions[currentQ].placeholder}
                rows={4}
                className="w-full bg-black/[0.04] dark:bg-[#111] border border-black/[0.09] dark:border-white/[0.07] rounded-xl px-4 py-3 text-sm text-black/90 dark:text-white placeholder-black/[0.25] dark:placeholder-white/[0.22] focus:outline-none focus:border-black/[0.22] dark:focus:border-white/[0.22] resize-none"
                autoFocus
              />
            ) : (
              <input
                type="text"
                value={currentAnswer}
                onChange={(e) => setAnswer(questions[currentQ].id, e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && currentAnswer.trim()) {
                    e.preventDefault();
                    nextQuestion();
                  }
                }}
                placeholder={questions[currentQ].placeholder}
                className="w-full bg-black/[0.04] dark:bg-[#111] border border-black/[0.09] dark:border-white/[0.07] rounded-xl px-4 py-3 text-sm text-black/90 dark:text-white placeholder-black/[0.25] dark:placeholder-white/[0.22] focus:outline-none focus:border-black/[0.22] dark:focus:border-white/[0.22]"
                autoFocus
              />
            )}
            <div className="flex items-center justify-between pt-1">
              {currentQ > 0 ? (
                <button
                  type="button"
                  onClick={() => setCurrentQ((i) => i - 1)}
                  className="text-xs text-black/[0.35] dark:text-white/[0.35] hover:text-black/55 dark:hover:text-white/55 transition-colors"
                >
                  &larr; Back
                </button>
              ) : (
                <div />
              )}
              <button
                type="button"
                onClick={nextQuestion}
                disabled={!currentAnswer.trim()}
                className="px-4 py-1.5 bg-black/[0.88] text-white dark:bg-white dark:text-black text-xs font-medium rounded-lg hover:bg-black/75 dark:hover:bg-white/90 transition-colors disabled:opacity-20 disabled:cursor-not-allowed"
              >
                {isLastQuestion ? "Next" : "Next"} &rarr;
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Optional enrichment fields (all at once) */}
      {allQuestionsAnswered && (
        <div className="space-y-5">
          <p className="text-[11px] text-black/[0.35] dark:text-white/[0.35] uppercase tracking-wide font-medium">
            Optional — add more for a better brief
          </p>

          {/* Target audience */}
          <div className="space-y-1.5">
            <label className="text-sm text-black/[0.55] dark:text-white/[0.55]">Target audience</label>
            <input
              type="text"
              value={targetAudience}
              onChange={(e) => setAnswer("targetAudience", e.target.value)}
              placeholder="Who is this for?"
              className="w-full bg-black/[0.04] dark:bg-[#111] border border-black/[0.09] dark:border-white/[0.07] rounded-xl px-4 py-3 text-sm text-black/90 dark:text-white placeholder-black/[0.25] dark:placeholder-white/[0.22] focus:outline-none focus:border-black/[0.22] dark:focus:border-white/[0.22]"
            />
          </div>

          {/* Tone notes */}
          <div className="space-y-1.5">
            <label className="text-sm text-black/[0.55] dark:text-white/[0.55]">Tone notes</label>
            <input
              type="text"
              value={toneNotes}
              onChange={(e) => setAnswer("toneNotes", e.target.value)}
              placeholder="e.g. casual, formal, witty, authoritative"
              className="w-full bg-black/[0.04] dark:bg-[#111] border border-black/[0.09] dark:border-white/[0.07] rounded-xl px-4 py-3 text-sm text-black/90 dark:text-white placeholder-black/[0.25] dark:placeholder-white/[0.22] focus:outline-none focus:border-black/[0.22] dark:focus:border-white/[0.22]"
            />
          </div>

          {/* Word count target */}
          <div className="space-y-1.5">
            <label className="text-sm text-black/[0.55] dark:text-white/[0.55]">Target length</label>
            <input
              type="text"
              value={wordCountTarget}
              onChange={(e) => onUpdate("wordCountTarget", e.target.value)}
              placeholder="e.g. 800 words, 10,000 words, short"
              className="w-full bg-black/[0.04] dark:bg-[#111] border border-black/[0.09] dark:border-white/[0.07] rounded-xl px-4 py-3 text-sm text-black/90 dark:text-white placeholder-black/[0.25] dark:placeholder-white/[0.22] focus:outline-none focus:border-black/[0.22] dark:focus:border-white/[0.22]"
            />
          </div>

          <button
            type="button"
            onClick={onContinue}
            className="px-5 py-2.5 bg-black/[0.88] text-white dark:bg-white dark:text-black text-sm font-medium rounded-xl hover:bg-black/75 dark:hover:bg-white/90 transition-colors"
          >
            Continue &rarr;
          </button>
        </div>
      )}
    </div>
  );
}
