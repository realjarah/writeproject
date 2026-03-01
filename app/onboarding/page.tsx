"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { VoiceAnalysis } from "@/lib/content-types";
import type { AccountType, Step, Question, AddedSample, AnalyzeStats } from "./types";

import TypeStep from "./components/TypeStep";
import WritingTypesStep from "./components/WritingTypesStep";
import QuestionsStep from "./components/QuestionsStep";
import SamplesStep from "./components/SamplesStep";
import WordsStep from "./components/WordsStep";
import ReviewStep from "./components/ReviewStep";
import AnalyzingStep from "./components/AnalyzingStep";
import VoiceReportStep from "./components/VoiceReportStep";

// ── Question banks ─────────────────────────────────────────────────────────────

const INDIVIDUAL_QUESTIONS: Question[] = [
  {
    id: "personality",
    prompt: "My friends would describe me as\u2026",
    placeholder: "e.g. blunt, warm, always with a story, obsessively detail-oriented\u2026",
  },
  {
    id: "proud",
    prompt: "The piece of writing I\u2019m most proud of is the one where I\u2026",
    placeholder: "e.g. finally admitted I had no idea what I was doing \u2014 and it resonated more than anything polished I\u2019d written",
  },
  {
    id: "audience",
    prompt: "When I write, I\u2019m really talking to\u2026",
    placeholder: "e.g. my 28-year-old self, founders who are scared to share their opinions, anyone who\u2019s ever felt like a fraud",
  },
  {
    id: "fear",
    prompt: "My biggest fear when I put my writing out into the world is\u2026",
    placeholder: "e.g. sounding preachy, coming across as trying too hard, being misunderstood",
  },
  {
    id: "influences",
    prompt: "The writers or thinkers who\u2019ve shaped how I communicate most are\u2026",
    placeholder: "e.g. Paul Graham, Anne Lamott, my old philosophy professor \u2014 just anyone who\u2019s influenced your voice",
  },
  {
    id: "avoid",
    prompt: "One thing I never, ever want my writing to sound like is\u2026",
    placeholder: "e.g. a LinkedIn influencer post, a corporate memo, a TED talk script",
  },
  {
    id: "editing",
    prompt: "When you re-read your own writing, what do you usually change?",
    placeholder: "e.g. I always cut my first paragraph, I add more concrete examples, I soften my conclusions, I tighten wordy sentences\u2026",
  },
  {
    id: "extra",
    prompt: "Anything else you want your ghostwriter to know about you?",
    placeholder: "e.g. I swear a lot in private but keep it clean in writing, I hate small talk but love tangents, I always write like I\u2019m explaining things to a 12-year-old\u2026",
  },
];

const BRAND_QUESTIONS: Question[] = [
  {
    id: "personality",
    prompt: "Our brand could be described as\u2026",
    placeholder: "e.g. the no-BS alternative to enterprise software, a calm voice in a chaotic industry, your most knowledgeable friend in finance",
  },
  {
    id: "feeling",
    prompt: "Our audience would say we make them feel\u2026",
    placeholder: "e.g. finally understood, like they found the cheat code, less alone in what they\u2019re going through",
  },
  {
    id: "admire",
    prompt: "The brands we secretly admire (not competitors) for how they communicate are\u2026",
    placeholder: "e.g. Basecamp \u2014 direct and opinionated. Patagonia \u2014 mission-first. Notion \u2014 clever without trying",
  },
  {
    id: "avoid",
    prompt: "We never want to sound like\u2026",
    placeholder: "e.g. a startup that puts \u2018revolutionize\u2019 in every sentence, a bank trying to sound hip, a brand that talks to its audience like they\u2019re children",
  },
  {
    id: "audience",
    prompt: "Our typical reader/customer is\u2026",
    placeholder: "e.g. a growth-stage SaaS founder who\u2019s read every playbook and is tired of the same advice, a time-strapped parent trying to make better decisions",
  },
  {
    id: "philosophy",
    prompt: "When it comes to content, we firmly believe\u2026",
    placeholder: "e.g. most brand writing is cowardly \u2014 we\u2019d rather be wrong and specific than safe and vague",
  },
  {
    id: "editing",
    prompt: "When your team reviews a draft, what feedback comes up most often?",
    placeholder: "e.g. too formal, needs more examples, cut the fluff, make the CTA clearer, always too long\u2026",
  },
  {
    id: "pov",
    prompt: "Our brand\u2019s unique point of view in one sentence is\u2026",
    placeholder: "e.g. We believe [X] \u2014 and everything we write proves it",
  },
];

// ── Main page ──────────────────────────────────────────────────────────────────

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("type");
  const [accountType, setAccountType] = useState<AccountType>("individual");

  // Writing types
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);

  // Questions flow
  const [questionIndex, setQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});

  // Samples
  const [samples, setSamples] = useState<AddedSample[]>([]);

  // Favorite words
  const [favoriteWords, setFavoriteWords] = useState<string[]>([]);

  // Review
  const [submitError, setSubmitError] = useState("");

  // Voice report
  const [voiceAnalysis, setVoiceAnalysis] = useState<VoiceAnalysis | null>(null);
  const [analyzeStats, setAnalyzeStats] = useState<AnalyzeStats | null>(null);

  const questions = accountType === "brand" ? BRAND_QUESTIONS : INDIVIDUAL_QUESTIONS;
  const OVERALL_STEPS = ["You", "Formats", "About you", "Samples", "Words", "Review"];

  function overallStepIndex(): number {
    switch (step) {
      case "type": return 0;
      case "writing_types": return 1;
      case "questions": return 2;
      case "samples": return 3;
      case "words": return 4;
      case "review": return 5;
      default: return 5;
    }
  }

  async function skipToFinish() {
    await fetch("/api/auth/complete-onboarding", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accountType, answers: [] }),
    }).catch(() => {});
    router.push("/");
  }

  function handleReviewSubmit() {
    setSubmitError("");

    if (samples.length > 0) {
      // Go to analyzing step — voice will be built there
      setStep("analyzing");
    } else {
      // No samples — skip analysis, complete onboarding directly
      completeWithoutAnalysis();
    }
  }

  async function completeWithoutAnalysis() {
    const answersArray = questions
      .map((q) => ({ question: q.prompt, answer: answers[q.id] ?? "" }))
      .filter((a) => a.answer.length > 0);

    for (const word of favoriteWords) {
      fetch("/api/favorite-words", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ word }),
      }).catch(() => {});
    }

    try {
      await fetch("/api/auth/complete-onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountType,
          answers: answersArray,
          writingTypes: selectedTypes,
          favoriteWords,
        }),
      });
      router.push("/");
    } catch {
      setSubmitError("Failed to save. Please try again.");
    }
  }

  function handleAnalysisComplete(analysis: VoiceAnalysis) {
    setVoiceAnalysis(analysis);
    setStep("report");
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  if (step === "type") {
    return (
      <TypeStep
        setAccountType={setAccountType}
        setStep={setStep}
        onSkip={skipToFinish}
      />
    );
  }

  if (step === "writing_types") {
    return (
      <WritingTypesStep
        selectedTypes={selectedTypes}
        setSelectedTypes={setSelectedTypes}
        setStep={setStep}
        stepIndex={overallStepIndex()}
        steps={OVERALL_STEPS}
      />
    );
  }

  if (step === "questions") {
    return (
      <QuestionsStep
        questions={questions}
        questionIndex={questionIndex}
        setQuestionIndex={setQuestionIndex}
        answers={answers}
        setAnswers={setAnswers}
        setStep={setStep}
        accountType={accountType}
        stepIndex={overallStepIndex()}
        steps={OVERALL_STEPS}
      />
    );
  }

  if (step === "samples") {
    return (
      <SamplesStep
        selectedTypes={selectedTypes}
        samples={samples}
        setSamples={setSamples}
        accountType={accountType}
        setStep={setStep}
        stepIndex={overallStepIndex()}
        steps={OVERALL_STEPS}
        questionCount={questions.length}
      />
    );
  }

  if (step === "words") {
    return (
      <WordsStep
        favoriteWords={favoriteWords}
        setFavoriteWords={setFavoriteWords}
        setStep={setStep}
        stepIndex={overallStepIndex()}
        steps={OVERALL_STEPS}
      />
    );
  }

  if (step === "review") {
    return (
      <ReviewStep
        accountType={accountType}
        selectedTypes={selectedTypes}
        questions={questions}
        answers={answers}
        samples={samples}
        favoriteWords={favoriteWords}
        setStep={setStep}
        setQuestionIndex={setQuestionIndex}
        onSubmit={handleReviewSubmit}
        submitError={submitError}
        stepIndex={overallStepIndex()}
        steps={OVERALL_STEPS}
      />
    );
  }

  if (step === "analyzing") {
    return (
      <AnalyzingStep
        selectedTypes={selectedTypes}
        onComplete={handleAnalysisComplete}
        setAnalyzeStats={setAnalyzeStats}
      />
    );
  }

  if (step === "report" && voiceAnalysis) {
    return (
      <VoiceReportStep
        analysis={voiceAnalysis}
        stats={analyzeStats}
        questions={questions}
        answers={answers}
        accountType={accountType}
        favoriteWords={favoriteWords}
      />
    );
  }

  // Fallback loading
  return (
    <div className="max-w-2xl mx-auto flex items-center justify-center min-h-[50vh]">
      <div className="text-center space-y-5">
        <div className="flex items-center justify-center gap-1.5">
          {[0, 150, 300].map((delay) => (
            <span
              key={delay}
              className="inline-block w-1.5 h-1.5 bg-black/35 dark:bg-white/25 rounded-full animate-pulse"
              style={{ animationDelay: `${delay}ms` }}
            />
          ))}
        </div>
        <p className="text-[14px] text-black/45 dark:text-white/35">
          Setting everything up&hellip;
        </p>
      </div>
    </div>
  );
}
