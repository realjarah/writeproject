"use client";

import { useState, useRef, useEffect, KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

// ── Types ─────────────────────────────────────────────────────────────────────

type AccountType = "individual" | "brand";
type Step = "type" | "questions" | "samples" | "analyzing" | "done";

interface Question {
  id: string;
  prompt: string;
  placeholder: string;
  multiline?: boolean;
}

interface AddedSample {
  title: string;
  content: string;
  wordCount: number;
  category: string;
}

// ── Question banks ─────────────────────────────────────────────────────────────

const INDIVIDUAL_QUESTIONS: Question[] = [
  {
    id: "personality",
    prompt: "My friends would describe me as…",
    placeholder: "e.g. blunt, warm, always with a story, obsessively detail-oriented…",
  },
  {
    id: "proud",
    prompt: "The piece of writing I'm most proud of is the one where I…",
    placeholder: "e.g. finally admitted I had no idea what I was doing — and it resonated more than anything polished I'd written",
  },
  {
    id: "audience",
    prompt: "When I write, I'm really talking to…",
    placeholder: "e.g. my 28-year-old self, founders who are scared to share their opinions, anyone who's ever felt like a fraud",
  },
  {
    id: "fear",
    prompt: "My biggest fear when I put my writing out into the world is…",
    placeholder: "e.g. sounding preachy, coming across as trying too hard, being misunderstood",
  },
  {
    id: "influences",
    prompt: "The writers or thinkers who've shaped how I communicate most are…",
    placeholder: "e.g. Paul Graham, Anne Lamott, my old philosophy professor — just anyone who's influenced your voice",
  },
  {
    id: "avoid",
    prompt: "One thing I never, ever want my writing to sound like is…",
    placeholder: "e.g. a LinkedIn influencer post, a corporate memo, a TED talk script",
  },
  {
    id: "editing",
    prompt: "When you re-read your own writing, what do you usually change?",
    placeholder: "e.g. I always cut my first paragraph, I add more concrete examples, I soften my conclusions, I tighten wordy sentences…",
  },
  {
    id: "extra",
    prompt: "Anything else you want your ghostwriter to know about you?",
    placeholder: "e.g. I swear a lot in private but keep it clean in writing, I hate small talk but love tangents, I always write like I'm explaining things to a 12-year-old…",
  },
];

const BRAND_QUESTIONS: Question[] = [
  {
    id: "personality",
    prompt: "Our brand could be described as…",
    placeholder: "e.g. the no-BS alternative to enterprise software, a calm voice in a chaotic industry, your most knowledgeable friend in finance",
  },
  {
    id: "feeling",
    prompt: "Our audience would say we make them feel…",
    placeholder: "e.g. finally understood, like they found the cheat code, less alone in what they're going through",
  },
  {
    id: "admire",
    prompt: "The brands we secretly admire (not competitors) for how they communicate are…",
    placeholder: "e.g. Basecamp — direct and opinionated. Patagonia — mission-first. Notion — clever without trying",
  },
  {
    id: "avoid",
    prompt: "We never want to sound like…",
    placeholder: "e.g. a startup that puts 'revolutionize' in every sentence, a bank trying to sound hip, a brand that talks to its audience like they're children",
  },
  {
    id: "audience",
    prompt: "Our typical reader/customer is…",
    placeholder: "e.g. a growth-stage SaaS founder who's read every playbook and is tired of the same advice, a time-strapped parent trying to make better decisions",
  },
  {
    id: "philosophy",
    prompt: "When it comes to content, we firmly believe…",
    placeholder: "e.g. most brand writing is cowardly — we'd rather be wrong and specific than safe and vague",
  },
  {
    id: "editing",
    prompt: "When your team reviews a draft, what feedback comes up most often?",
    placeholder: "e.g. too formal, needs more examples, cut the fluff, make the CTA clearer, always too long…",
  },
  {
    id: "pov",
    prompt: "Our brand's unique point of view in one sentence is…",
    placeholder: "e.g. We believe [X] — and everything we write proves it",
  },
];

// ── Sample categories ──────────────────────────────────────────────────────────

const SAMPLE_CATEGORIES = [
  { value: "blog",       label: "Blog / Article" },
  { value: "essay",      label: "Essay / Opinion" },
  { value: "newsletter", label: "Newsletter" },
  { value: "social",     label: "Social post" },
  { value: "email",      label: "Email" },
  { value: "technical",  label: "Technical / Docs" },
  { value: "other",      label: "Other" },
];

function wordCount(text: string) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

// ── Progress dots ──────────────────────────────────────────────────────────────

function ProgressDots({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center gap-1.5">
      {Array.from({ length: total }).map((_, i) => (
        <span
          key={i}
          className={`inline-block rounded-full transition-all duration-300 ${
            i < current
              ? "w-2 h-2 bg-black/40 dark:bg-white/35"
              : i === current
              ? "w-2.5 h-2.5 bg-black/70 dark:bg-white/70"
              : "w-1.5 h-1.5 bg-black/15 dark:bg-white/12"
          }`}
        />
      ))}
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("type");
  const [accountType, setAccountType] = useState<AccountType>("individual");

  // Questions flow
  const [questionIndex, setQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [currentAnswer, setCurrentAnswer] = useState("");
  const [questionVisible, setQuestionVisible] = useState(true);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Samples
  const [pasteText, setPasteText] = useState("");
  const [sampleCategory, setSampleCategory] = useState("other");
  const [addError, setAddError] = useState("");
  const [adding, setAdding] = useState(false);
  const [samples, setSamples] = useState<AddedSample[]>([]);

  // Analysis
  const [analyzeError, setAnalyzeError] = useState("");

  const questions = accountType === "brand" ? BRAND_QUESTIONS : INDIVIDUAL_QUESTIONS;

  // Auto-focus textarea when question changes
  useEffect(() => {
    if (step === "questions" && questionVisible) {
      textareaRef.current?.focus();
    }
  }, [step, questionIndex, questionVisible]);

  // Restore saved answer when navigating back to a question
  useEffect(() => {
    if (step === "questions") {
      const q = questions[questionIndex];
      setCurrentAnswer(answers[q.id] ?? "");
    }
  }, [questionIndex, step]); // eslint-disable-line react-hooks/exhaustive-deps

  function advanceQuestion() {
    const q = questions[questionIndex];
    const trimmed = currentAnswer.trim();

    // Save answer (even if blank — we don't enforce it)
    setAnswers((prev) => ({ ...prev, [q.id]: trimmed }));

    if (questionIndex < questions.length - 1) {
      setQuestionVisible(false);
      setTimeout(() => {
        setQuestionIndex((i) => i + 1);
        setCurrentAnswer("");
        setQuestionVisible(true);
      }, 250);
    } else {
      // All questions answered → go to samples
      setStep("samples");
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    // Cmd/Ctrl + Enter → advance
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      advanceQuestion();
    }
  }

  // ── Samples ────────────────────────────────────────────────────────────────

  async function addSample() {
    if (!pasteText.trim()) return;
    const wc = wordCount(pasteText);
    if (wc < 50) {
      setAddError("Sample too short — paste something with at least 50 words.");
      return;
    }
    setAddError("");
    setAdding(true);
    const res = await fetch("/api/voice", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: pasteText.trim(),
        category: sampleCategory,
        title: `Sample ${samples.length + 1}`,
      }),
    });
    setAdding(false);
    if (!res.ok) {
      setAddError("Failed to save sample. Please try again.");
      return;
    }
    setSamples((prev) => [
      ...prev,
      { title: `Sample ${prev.length + 1}`, content: pasteText.trim(), wordCount: wc, category: sampleCategory },
    ]);
    setPasteText("");
    setSampleCategory("other");
  }

  async function analyzeAndFinish() {
    setStep("analyzing");
    setAnalyzeError("");

    // Build ordered answer list for storage
    const answersArray = questions
      .map((q) => ({ question: q.prompt, answer: answers[q.id] ?? "" }))
      .filter((a) => a.answer.length > 0);

    const [analyzeRes] = await Promise.allSettled([
      fetch("/api/voice/analyze", { method: "POST" }),
    ]);
    if (analyzeRes.status === "rejected" || (analyzeRes.status === "fulfilled" && !analyzeRes.value.ok)) {
      setAnalyzeError("Analysis failed — you can retry from your Profile later.");
    }

    await fetch("/api/auth/complete-onboarding", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accountType, answers: answersArray }),
    }).catch(() => {});

    setStep("done");
  }

  async function skipToFinish() {
    await fetch("/api/auth/complete-onboarding", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accountType, answers: [] }),
    }).catch(() => {});
    router.push("/");
  }

  // ── Render: Account type ───────────────────────────────────────────────────

  if (step === "type") {
    return (
      <div className="max-w-2xl mx-auto space-y-10 pt-8 px-4">
        <div className="space-y-2">
          <p className="text-[11px] tracking-[0.14em] uppercase text-black/30 dark:text-white/20 font-medium">
            Let&apos;s get started
          </p>
          <h1 className="text-[26px] font-semibold text-black/90 dark:text-white tracking-tight leading-snug">
            Who are we writing for?
          </h1>
          <p className="text-[14px] text-black/45 dark:text-white/35 leading-relaxed">
            This shapes how we learn your voice and tailor the ghostwriter to you.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Individual card */}
          <button
            type="button"
            onClick={() => { setAccountType("individual"); setStep("questions"); }}
            className="group relative text-left border rounded-2xl px-6 py-6 transition-all duration-200 hover:border-black/25 dark:hover:border-white/20 hover:shadow-sm bg-black/[0.02] dark:bg-white/[0.02] border-black/[0.09] dark:border-white/[0.08] focus:outline-none focus-visible:ring-2 focus-visible:ring-black/20 dark:focus-visible:ring-white/20"
          >
            <div className="space-y-3">
              <div className="w-9 h-9 rounded-xl bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center">
                <svg className="w-5 h-5 text-violet-500 dark:text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                </svg>
              </div>
              <div>
                <p className="text-[15px] font-semibold text-black/85 dark:text-white/90">I&apos;m an individual</p>
                <p className="text-[13px] text-black/45 dark:text-white/35 mt-1 leading-snug">
                  Build a ghostwriter that captures your personal voice — essays, posts, emails, anything you write.
                </p>
              </div>
              <p className="text-[11px] text-black/30 dark:text-white/20 group-hover:text-black/50 dark:group-hover:text-white/40 transition-colors">
                Choose this →
              </p>
            </div>
          </button>

          {/* Brand card */}
          <button
            type="button"
            onClick={() => { setAccountType("brand"); setStep("questions"); }}
            className="group relative text-left border rounded-2xl px-6 py-6 transition-all duration-200 hover:border-black/25 dark:hover:border-white/20 hover:shadow-sm bg-black/[0.02] dark:bg-white/[0.02] border-black/[0.09] dark:border-white/[0.08] focus:outline-none focus-visible:ring-2 focus-visible:ring-black/20 dark:focus-visible:ring-white/20"
          >
            <div className="space-y-3">
              <div className="w-9 h-9 rounded-xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                <svg className="w-5 h-5 text-amber-500 dark:text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" />
                </svg>
              </div>
              <div>
                <p className="text-[15px] font-semibold text-black/85 dark:text-white/90">We&apos;re a brand / company</p>
                <p className="text-[13px] text-black/45 dark:text-white/35 mt-1 leading-snug">
                  Build a consistent brand voice across your team — content, campaigns, and communications.
                </p>
              </div>
              <p className="text-[11px] text-black/30 dark:text-white/20 group-hover:text-black/50 dark:group-hover:text-white/40 transition-colors">
                Choose this →
              </p>
            </div>
          </button>
        </div>

        <div className="pt-2">
          <button
            type="button"
            onClick={skipToFinish}
            className="text-[12px] text-black/30 dark:text-white/20 hover:text-black/55 dark:hover:text-white/45 transition-colors"
          >
            Skip setup — I&apos;ll do this later
          </button>
        </div>
      </div>
    );
  }

  // ── Render: Questions ──────────────────────────────────────────────────────

  if (step === "questions") {
    const q = questions[questionIndex];
    const isLast = questionIndex === questions.length - 1;
    const progress = questionIndex + 1;
    const total = questions.length;

    return (
      <div className="max-w-xl mx-auto pt-12 px-4 min-h-[70vh] flex flex-col">
        {/* Top bar */}
        <div className="flex items-center justify-between mb-12">
          <button
            type="button"
            onClick={() => {
              if (questionIndex === 0) setStep("type");
              else {
                const q = questions[questionIndex];
                setAnswers((prev) => ({ ...prev, [q.id]: currentAnswer.trim() }));
                setQuestionIndex((i) => i - 1);
              }
            }}
            className="text-[12px] text-black/30 dark:text-white/20 hover:text-black/55 dark:hover:text-white/45 transition-colors"
          >
            ← Back
          </button>
          <ProgressDots current={questionIndex} total={total} />
          <span className="text-[11px] text-black/25 dark:text-white/20 tabular-nums">
            {progress} / {total}
          </span>
        </div>

        {/* Question + answer */}
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
            <Button
              type="button"
              onClick={advanceQuestion}
              className="px-6"
            >
              {isLast ? "Finish" : "Next"}
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
              {(typeof window !== "undefined" && navigator.userAgent.includes("Mac")) ? "⌘" : "Ctrl"}↵ to continue
            </span>
          </div>
        </div>
      </div>
    );
  }

  // ── Render: Samples ────────────────────────────────────────────────────────

  if (step === "samples") {
    const wc = wordCount(pasteText);
    const sampleStepNum = questions.length + 1;
    const sampleStepOf  = questions.length + 1;

    return (
      <div className="max-w-2xl mx-auto space-y-8 pt-4 px-4">
        {/* Header */}
        <div className="space-y-2">
          <p className="text-[11px] tracking-[0.14em] uppercase text-black/35 dark:text-white/25 font-medium">
            Step {sampleStepNum} of {sampleStepOf}
          </p>
          <h1 className="text-[22px] font-semibold text-black/90 dark:text-white tracking-tight">
            {accountType === "brand"
              ? "Share some of your brand's writing"
              : "Share some of your writing"}
          </h1>
          <p className="text-[14px] text-black/45 dark:text-white/35 leading-relaxed">
            {accountType === "brand"
              ? "Paste 2–3 pieces your brand has published — blog posts, emails, social content, anything on-brand. The more variety, the better we'll capture your voice."
              : "Paste 2–3 pieces you've written — blog posts, emails, LinkedIn updates, anything. The more variety, the better your ghostwriter will know your voice."}
          </p>
        </div>

        {/* Added samples */}
        {samples.length > 0 && (
          <div className="space-y-2">
            <p className="text-[11px] text-black/30 dark:text-white/20 uppercase tracking-[0.12em] font-semibold">
              Added ({samples.length})
            </p>
            {samples.map((s, i) => (
              <div
                key={i}
                className="flex items-center gap-3 bg-black/[0.03] dark:bg-white/[0.03] border border-black/[0.08] dark:border-white/[0.07] rounded-xl px-4 py-3"
              >
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400/80 shrink-0" />
                <span className="text-[13px] text-black/60 dark:text-white/50 truncate flex-1">
                  {s.content.slice(0, 60)}…
                </span>
                <span className="text-[11px] text-black/35 dark:text-white/25 shrink-0">
                  {s.wordCount.toLocaleString()} words
                </span>
                <span className="text-[10px] text-black/40 dark:text-white/30 bg-black/[0.05] dark:bg-white/[0.05] border border-black/[0.09] dark:border-white/[0.08] rounded-md px-2 py-0.5 shrink-0">
                  {SAMPLE_CATEGORIES.find((c) => c.value === s.category)?.label ?? s.category}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Paste form */}
        <div className="space-y-3">
          <textarea
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            placeholder={
              samples.length === 0
                ? "Paste a blog post, email, LinkedIn update, or anything you've written…"
                : "Add another sample (different format recommended)…"
            }
            rows={10}
            className="w-full bg-black/[0.03] dark:bg-white/[0.03] border border-black/[0.08] dark:border-white/[0.07] rounded-2xl px-4 py-3.5 text-[14px] text-black/85 dark:text-white/80 placeholder-black/30 dark:placeholder-white/20 focus:outline-none focus:border-black/[0.18] dark:focus:border-white/[0.18] resize-none transition-colors"
          />

          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <label className="text-[12px] text-black/40 dark:text-white/30">Format:</label>
              <select
                value={sampleCategory}
                onChange={(e) => setSampleCategory(e.target.value)}
                className="bg-black/[0.04] dark:bg-white/[0.04] border border-black/[0.09] dark:border-white/[0.08] rounded-lg text-[12px] text-black/75 dark:text-white/70 px-2.5 py-1.5 focus:outline-none focus:border-black/[0.18] dark:focus:border-white/[0.18] transition-colors appearance-none"
              >
                {SAMPLE_CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value} className="bg-[#111]">{c.label}</option>
                ))}
              </select>
            </div>
            {pasteText.trim() && (
              <span className="text-[11px] text-black/35 dark:text-white/25">{wc.toLocaleString()} words</span>
            )}
          </div>

          {addError && <p className="text-[12px] text-red-400/80 pl-0.5">{addError}</p>}

          <Button
            type="button"
            variant="ghost"
            onClick={addSample}
            disabled={!pasteText.trim() || adding}
          >
            {adding ? "Saving…" : "+ Add sample"}
          </Button>
        </div>

        {/* Continue */}
        <div className="flex items-center justify-between pt-4 border-t border-black/[0.07] dark:border-white/[0.06]">
          <button
            type="button"
            onClick={() => { setQuestionIndex(questions.length - 1); setStep("questions"); }}
            className="text-[12px] text-black/35 dark:text-white/25 hover:text-black/60 dark:hover:text-white/50 transition-colors"
          >
            ← Back
          </button>
          <div className="flex items-center gap-3">
            {samples.length === 0 && (
              <button
                type="button"
                onClick={skipToFinish}
                className="text-[12px] text-black/35 dark:text-white/25 hover:text-black/55 dark:hover:text-white/45 transition-colors"
              >
                Skip for now
              </button>
            )}
            <Button
              type="button"
              onClick={analyzeAndFinish}
              disabled={samples.length === 0}
            >
              Build my voice profile
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ── Render: Analyzing ──────────────────────────────────────────────────────

  if (step === "analyzing") {
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
            Analyzing your writing style…
          </p>
          {analyzeError && (
            <p className="text-[12px] text-amber-400/70 mt-2">{analyzeError}</p>
          )}
        </div>
      </div>
    );
  }

  // ── Render: Done ───────────────────────────────────────────────────────────

  return (
    <div className="max-w-2xl mx-auto flex items-center justify-center min-h-[50vh] px-4">
      <div className="text-center space-y-7">
        <div className="space-y-3">
          <div className="w-10 h-10 rounded-full bg-emerald-400/10 border border-emerald-400/20 flex items-center justify-center mx-auto">
            <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-[22px] font-semibold text-black/90 dark:text-white tracking-tight">
            {accountType === "brand" ? "Brand voice profile ready" : "Voice profile ready"}
          </h1>
          <p className="text-[14px] text-black/45 dark:text-white/35 leading-relaxed max-w-sm mx-auto">
            {samples.length > 0 ? (
              <>
                The ghostwriter has learned {accountType === "brand" ? "your brand's" : "your"} style from{" "}
                <span className="text-black/75 dark:text-white/70">{samples.length} sample{samples.length !== 1 ? "s" : ""}</span>.
                Add more any time from your Profile.
              </>
            ) : (
              <>
                Your profile is set up. Add writing samples from your Profile any time to improve voice fidelity.
              </>
            )}
          </p>
        </div>

        <div className="flex items-center justify-center gap-2.5">
          <Button onClick={() => router.push("/create")}>
            Write something
          </Button>
          <Button variant="outline" onClick={() => router.push("/")}>
            Go to dashboard
          </Button>
        </div>
      </div>
    </div>
  );
}
