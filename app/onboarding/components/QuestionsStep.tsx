import { useState, useRef, useEffect, KeyboardEvent } from "react";
import { Button } from "@/components/ui/button";
import StepIndicator from "./StepIndicator";
import ProgressDots from "./ProgressDots";
import type { Question, Step, AccountType } from "../types";

export default function QuestionsStep({
  questions,
  questionIndex,
  setQuestionIndex,
  answers,
  setAnswers,
  setStep,
  accountType,
  stepIndex,
  steps,
}: {
  questions: Question[];
  questionIndex: number;
  setQuestionIndex: (fn: (i: number) => number) => void;
  answers: Record<string, string>;
  setAnswers: (fn: (prev: Record<string, string>) => Record<string, string>) => void;
  setStep: (s: Step) => void;
  accountType: AccountType;
  stepIndex: number;
  steps: string[];
}) {
  const [currentAnswer, setCurrentAnswer] = useState("");
  const [questionVisible, setQuestionVisible] = useState(true);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const q = questions[questionIndex];
  const isLast = questionIndex === questions.length - 1;

  useEffect(() => {
    if (questionVisible) textareaRef.current?.focus();
  }, [questionIndex, questionVisible]);

  useEffect(() => {
    setCurrentAnswer(answers[q.id] ?? "");
  }, [questionIndex]); // eslint-disable-line react-hooks/exhaustive-deps

  function advanceQuestion() {
    const trimmed = currentAnswer.trim();
    setAnswers((prev) => ({ ...prev, [q.id]: trimmed }));

    if (isLast) {
      setStep("samples");
    } else {
      setQuestionVisible(false);
      setTimeout(() => {
        setQuestionIndex((i) => i + 1);
        setCurrentAnswer("");
        setQuestionVisible(true);
      }, 250);
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      advanceQuestion();
    }
  }

  return (
    <div className="max-w-xl mx-auto pt-8 px-4 min-h-[70vh] flex flex-col">
      <div className="mb-8">
        <StepIndicator current={stepIndex} steps={steps} />
      </div>

      <div className="flex items-center justify-between mb-12">
        <button
          type="button"
          onClick={() => {
            if (questionIndex === 0) setStep("writing_types");
            else {
              setAnswers((prev) => ({ ...prev, [q.id]: currentAnswer.trim() }));
              setQuestionIndex((i) => i - 1);
            }
          }}
          className="text-[12px] text-black/30 dark:text-white/20 hover:text-black/55 dark:hover:text-white/45 transition-colors"
        >
          &larr; Back
        </button>
        <ProgressDots current={questionIndex} total={questions.length} />
        <span className="text-[11px] text-black/25 dark:text-white/20 tabular-nums">
          {questionIndex + 1} / {questions.length}
        </span>
      </div>

      <div
        className="flex-1 space-y-8 transition-all duration-250"
        style={{ opacity: questionVisible ? 1 : 0, transform: questionVisible ? "translateY(0)" : "translateY(8px)" }}
      >
        <div className="space-y-1.5">
          <p className="text-[11px] tracking-[0.13em] uppercase text-black/30 dark:text-white/20 font-medium">
            {accountType === "brand" ? "About your brand" : "About you"}
          </p>
          <h2 className="text-[22px] font-semibold text-black/88 dark:text-white/90 tracking-tight leading-snug">
            {q.prompt}
          </h2>
        </div>

        <div className="relative">
          <textarea
            ref={textareaRef}
            value={currentAnswer}
            onChange={(e) => setCurrentAnswer(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={q.placeholder}
            rows={4}
            className="w-full bg-transparent border-b-2 border-black/15 dark:border-white/12 focus:border-black/35 dark:focus:border-white/30 pt-1 pb-3 text-[16px] text-black/85 dark:text-white/80 placeholder-black/20 dark:placeholder-white/15 focus:outline-none resize-none transition-colors leading-relaxed"
          />
        </div>

        <div className="flex items-center gap-4">
          <Button type="button" onClick={advanceQuestion} className="px-6">
            {isLast ? "Next step" : "Next"}
          </Button>
          {!isLast && (
            <button
              type="button"
              onClick={() => {
                setCurrentAnswer("");
                setAnswers((prev) => ({ ...prev, [q.id]: "" }));
                advanceQuestion();
              }}
              className="text-[12px] text-black/30 dark:text-white/20 hover:text-black/55 dark:hover:text-white/45 transition-colors"
            >
              Skip this one
            </button>
          )}
          <span className="text-[11px] text-black/20 dark:text-white/15 ml-auto">
            {(typeof window !== "undefined" && navigator.userAgent.includes("Mac")) ? "\u2318" : "Ctrl"}\u21B5 to continue
          </span>
        </div>
      </div>
    </div>
  );
}
