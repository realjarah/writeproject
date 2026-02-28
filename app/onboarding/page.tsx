"use client";

import { useState, useRef, useEffect, KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { CONTENT_TYPE_GROUPS, CONTENT_TYPE_LABELS } from "@/lib/content-types";
import { detectCategory } from "@/lib/detectCategory";

// ── Types ─────────────────────────────────────────────────────────────────────

type AccountType = "individual" | "brand";
type Step = "type" | "writing_types" | "questions" | "samples" | "words" | "review" | "submitting";

interface Question {
  id: string;
  prompt: string;
  placeholder: string;
}

interface AddedSample {
  title: string;
  content: string;
  wordCount: number;
  category: string;
  notes: string; // what they liked about it / why it's a good sample
  inputMethod: "paste" | "url" | "file";
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

// ── Helpers ────────────────────────────────────────────────────────────────────

function wordCount(text: string) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

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

// Step indicator for the overall onboarding flow
function StepIndicator({ current, steps }: { current: number; steps: string[] }) {
  return (
    <div className="flex items-center gap-2">
      {steps.map((label, i) => (
        <div key={label} className="flex items-center gap-2">
          <div className={`flex items-center gap-1.5 transition-all duration-300 ${
            i < current ? "opacity-40" : i === current ? "opacity-100" : "opacity-25"
          }`}>
            <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-semibold transition-all ${
              i < current
                ? "bg-emerald-400/20 text-emerald-500"
                : i === current
                ? "bg-black/10 dark:bg-white/10 text-black/80 dark:text-white/80"
                : "bg-black/[0.04] dark:bg-white/[0.04] text-black/30 dark:text-white/20"
            }`}>
              {i < current ? (
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                i + 1
              )}
            </div>
            <span className={`text-[11px] font-medium hidden sm:inline ${
              i === current ? "text-black/70 dark:text-white/60" : "text-black/30 dark:text-white/20"
            }`}>{label}</span>
          </div>
          {i < steps.length - 1 && (
            <div className={`w-4 h-px ${i < current ? "bg-emerald-400/30" : "bg-black/10 dark:bg-white/[0.06]"}`} />
          )}
        </div>
      ))}
    </div>
  );
}

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
  const [currentAnswer, setCurrentAnswer] = useState("");
  const [questionVisible, setQuestionVisible] = useState(true);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Samples
  const [samples, setSamples] = useState<AddedSample[]>([]);
  const [sampleInputMode, setSampleInputMode] = useState<"paste" | "url" | "file">("paste");
  const [pasteText, setPasteText] = useState("");
  const [sampleCategory, setSampleCategory] = useState("");
  const [sampleNotes, setSampleNotes] = useState("");
  const [sampleTitle, setSampleTitle] = useState("");
  const [urlInput, setUrlInput] = useState("");
  const [fetching, setFetching] = useState(false);
  const [sampleError, setSampleError] = useState("");

  // Favorite words
  const [wordInput, setWordInput] = useState("");
  const [favoriteWords, setFavoriteWords] = useState<string[]>([]);

  // Review editing
  const [editingSection, setEditingSection] = useState<string | null>(null);
  const [editingTypeSearch, setEditingTypeSearch] = useState("");

  // Submitting
  const [submitError, setSubmitError] = useState("");

  const questions = accountType === "brand" ? BRAND_QUESTIONS : INDIVIDUAL_QUESTIONS;
  const OVERALL_STEPS = ["You", "What you write", "About you", "Samples", "Words", "Review"];

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

  // Set first selected type as default sample category
  useEffect(() => {
    if (step === "samples" && !sampleCategory && selectedTypes.length > 0) {
      setSampleCategory(selectedTypes[0]);
    }
  }, [step, sampleCategory, selectedTypes]);

  function toggleType(type: string) {
    setSelectedTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    );
  }

  function advanceQuestion() {
    const q = questions[questionIndex];
    const trimmed = currentAnswer.trim();
    setAnswers((prev) => ({ ...prev, [q.id]: trimmed }));

    if (questionIndex < questions.length - 1) {
      setQuestionVisible(false);
      setTimeout(() => {
        setQuestionIndex((i) => i + 1);
        setCurrentAnswer("");
        setQuestionVisible(true);
      }, 250);
    } else {
      setStep("samples");
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      advanceQuestion();
    }
  }

  // ── Sample helpers ─────────────────────────────────────────────────────────

  function resetSampleForm() {
    setPasteText("");
    setSampleNotes("");
    setSampleTitle("");
    setUrlInput("");
    setSampleError("");
    setFetching(false);
  }

  async function addSampleFromText(text: string, title: string) {
    const wc = wordCount(text);
    if (wc < 50) {
      setSampleError("Too short — paste something with at least 50 words.");
      return;
    }
    setSampleError("");

    const cat = sampleCategory || detectCategory(text);

    const res = await fetch("/api/voice", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: text.trim(),
        category: cat,
        title: title || `Sample ${samples.length + 1}`,
        notes: sampleNotes.trim(),
      }),
    });

    if (!res.ok) {
      setSampleError("Failed to save sample. Please try again.");
      return;
    }

    setSamples((prev) => [
      ...prev,
      {
        title: title || `Sample ${prev.length + 1}`,
        content: text.trim(),
        wordCount: wc,
        category: cat,
        notes: sampleNotes.trim(),
        inputMethod: sampleInputMode,
      },
    ]);
    resetSampleForm();
  }

  async function handlePasteAdd() {
    if (!pasteText.trim()) return;
    setFetching(true);
    await addSampleFromText(pasteText.trim(), sampleTitle);
    setFetching(false);
  }

  async function handleUrlImport() {
    if (!urlInput.trim()) return;
    setFetching(true);
    setSampleError("");
    try {
      const res = await fetch("/api/voice/import-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: urlInput.trim() }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setSampleError(data.error || "Could not fetch URL.");
        setFetching(false);
        return;
      }
      await addSampleFromText(data.text, data.title || urlInput.trim());
    } catch {
      setSampleError("Fetch failed. Check the URL and try again.");
    }
    setFetching(false);
  }

  function handleFileUpload(file: File) {
    setSampleError("");
    const inferredTitle = file.name.replace(/\.[^.]+$/, "").replace(/[-_]/g, " ");

    if (file.type === "application/pdf") {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const dataUrl = e.target?.result as string;
        const [, base64] = dataUrl.split(",");
        setFetching(true);
        try {
          const res = await fetch("/api/voice/import-pdf", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ data: base64, fileName: file.name }),
          });
          const data = await res.json();
          if (!res.ok || data.error) {
            setSampleError(data.error || "PDF extraction failed.");
          } else {
            await addSampleFromText(data.text, inferredTitle);
          }
        } catch {
          setSampleError("PDF extraction failed. Try again.");
        }
        setFetching(false);
      };
      reader.readAsDataURL(file);
      return;
    }

    if (file.name.endsWith(".docx") || file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const dataUrl = e.target?.result as string;
        const [, base64] = dataUrl.split(",");
        setFetching(true);
        try {
          const res = await fetch("/api/voice/import-docx", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ data: base64 }),
          });
          const data = await res.json();
          if (!res.ok || data.error) {
            setSampleError(data.error || "DOCX extraction failed.");
          } else {
            await addSampleFromText(data.text, inferredTitle);
          }
        } catch {
          setSampleError("DOCX extraction failed. Try again.");
        }
        setFetching(false);
      };
      reader.readAsDataURL(file);
      return;
    }

    // Plain text / markdown
    const reader = new FileReader();
    reader.onload = async (e) => {
      const text = (e.target?.result as string) || "";
      if (!text.trim()) {
        setSampleError("File appears empty.");
        return;
      }
      setFetching(true);
      await addSampleFromText(text, inferredTitle);
      setFetching(false);
    };
    reader.readAsText(file);
  }

  // ── Favorite words ─────────────────────────────────────────────────────────

  function addWord() {
    const trimmed = wordInput.trim();
    if (!trimmed) return;
    if (favoriteWords.includes(trimmed.toLowerCase())) {
      setWordInput("");
      return;
    }
    setFavoriteWords((prev) => [...prev, trimmed.toLowerCase()]);
    setWordInput("");
  }

  function removeWord(word: string) {
    setFavoriteWords((prev) => prev.filter((w) => w !== word));
  }

  // ── Submit everything ──────────────────────────────────────────────────────

  async function submitOnboarding() {
    setStep("submitting");
    setSubmitError("");

    const answersArray = questions
      .map((q) => ({ question: q.prompt, answer: answers[q.id] ?? "" }))
      .filter((a) => a.answer.length > 0);

    // Save favorite words (fire and forget — they call Claude Haiku for definitions)
    for (const word of favoriteWords) {
      fetch("/api/favorite-words", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ word }),
      }).catch(() => {});
    }

    // Trigger voice analysis (non-blocking)
    if (samples.length > 0) {
      fetch("/api/voice/analyze", { method: "POST" }).catch(() => {});
    }

    // Complete onboarding
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
    } catch {
      setSubmitError("Failed to save. Please try again.");
      setStep("review");
      return;
    }

    // Redirect to home with calibrating flag
    router.push(samples.length > 0 ? "/?voiceCalibrating=1" : "/");
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
          <button
            type="button"
            onClick={() => { setAccountType("individual"); setStep("writing_types"); }}
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

          <button
            type="button"
            onClick={() => { setAccountType("brand"); setStep("writing_types"); }}
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

  // ── Render: What do you write? ─────────────────────────────────────────────

  if (step === "writing_types") {
    return (
      <div className="max-w-2xl mx-auto space-y-8 pt-6 px-4">
        <StepIndicator current={overallStepIndex()} steps={OVERALL_STEPS} />

        <div className="space-y-2">
          <h1 className="text-[24px] font-semibold text-black/90 dark:text-white tracking-tight leading-snug">
            What do you write?
          </h1>
          <p className="text-[14px] text-black/45 dark:text-white/35 leading-relaxed">
            Select everything that applies. This helps us understand what formats to optimize your voice for.
          </p>
        </div>

        <div className="space-y-6">
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
            ← Back
          </button>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setStep("questions")}
              className="text-[12px] text-black/35 dark:text-white/25 hover:text-black/55 dark:hover:text-white/45 transition-colors"
            >
              Skip
            </button>
            <Button
              type="button"
              onClick={() => setStep("questions")}
            >
              Continue
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ── Render: Questions ──────────────────────────────────────────────────────

  if (step === "questions") {
    const q = questions[questionIndex];
    const isLast = questionIndex === questions.length - 1;

    return (
      <div className="max-w-xl mx-auto pt-8 px-4 min-h-[70vh] flex flex-col">
        <div className="mb-8">
          <StepIndicator current={overallStepIndex()} steps={OVERALL_STEPS} />
        </div>

        {/* Top bar */}
        <div className="flex items-center justify-between mb-12">
          <button
            type="button"
            onClick={() => {
              if (questionIndex === 0) setStep("writing_types");
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

    // Build category options: selected types first, then all others
    const allTypes = CONTENT_TYPE_GROUPS.flatMap((g) => g.types);
    const priorityTypes = selectedTypes.length > 0 ? selectedTypes : allTypes;
    const otherTypes = allTypes.filter((t) => !selectedTypes.includes(t));

    return (
      <div className="max-w-2xl mx-auto space-y-8 pt-6 px-4">
        <StepIndicator current={overallStepIndex()} steps={OVERALL_STEPS} />

        <div className="space-y-2">
          <h1 className="text-[22px] font-semibold text-black/90 dark:text-white tracking-tight">
            {accountType === "brand" ? "Share some of your brand's writing" : "Share some of your writing"}
          </h1>
          <p className="text-[14px] text-black/45 dark:text-white/35 leading-relaxed">
            Upload 2–3 pieces you&apos;ve written. For each, tell us what you liked about it — that helps us
            understand not just how you write, but what you&apos;re going for.
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
                className="bg-black/[0.03] dark:bg-white/[0.03] border border-black/[0.08] dark:border-white/[0.07] rounded-xl px-4 py-3 space-y-1.5"
              >
                <div className="flex items-center gap-3">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-400/80 shrink-0" />
                  <span className="text-[13px] text-black/60 dark:text-white/50 truncate flex-1">
                    {s.title || s.content.slice(0, 60) + "…"}
                  </span>
                  <span className="text-[11px] text-black/35 dark:text-white/25 shrink-0">
                    {s.wordCount.toLocaleString()} words
                  </span>
                  <span className="text-[10px] text-black/40 dark:text-white/30 bg-black/[0.05] dark:bg-white/[0.05] border border-black/[0.09] dark:border-white/[0.08] rounded-md px-2 py-0.5 shrink-0">
                    {CONTENT_TYPE_LABELS[s.category] ?? s.category}
                  </span>
                </div>
                {s.notes && (
                  <p className="text-[11px] text-black/35 dark:text-white/25 pl-5 italic">
                    &ldquo;{s.notes}&rdquo;
                  </p>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Input mode tabs */}
        <div className="bg-black/[0.03] dark:bg-white/[0.03] border border-black/[0.09] dark:border-white/[0.08] rounded-xl p-5 space-y-4">
          <div className="flex gap-1 border-b border-black/[0.09] dark:border-white/[0.08] pb-1">
            {(["paste", "url", "file"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => { setSampleInputMode(mode); setSampleError(""); }}
                className={`text-[11px] px-3 py-1 rounded-t transition-colors ${
                  sampleInputMode === mode
                    ? "bg-black/[0.08] dark:bg-white/[0.09] text-black/90 dark:text-white"
                    : "text-black/40 dark:text-white/30 hover:text-black/60 dark:hover:text-white/50"
                }`}
              >
                {mode === "paste" ? "Paste text" : mode === "url" ? "Import from URL" : "Upload file"}
              </button>
            ))}
          </div>

          {/* Paste mode */}
          {sampleInputMode === "paste" && (
            <div className="space-y-3">
              <textarea
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                placeholder={
                  samples.length === 0
                    ? "Paste a blog post, email, essay, or anything you've written…"
                    : "Add another sample (different format recommended)…"
                }
                rows={8}
                className="w-full bg-black/[0.02] dark:bg-white/[0.02] border border-black/[0.08] dark:border-white/[0.07] rounded-xl px-4 py-3 text-[14px] text-black/85 dark:text-white/80 placeholder-black/30 dark:placeholder-white/20 focus:outline-none focus:border-black/[0.18] dark:focus:border-white/[0.18] resize-none transition-colors"
              />
              {pasteText.trim() && (
                <p className="text-[11px] text-black/35 dark:text-white/25">{wc.toLocaleString()} words</p>
              )}
            </div>
          )}

          {/* URL mode */}
          {sampleInputMode === "url" && (
            <div className="flex gap-2">
              <input
                type="url"
                placeholder="https://your-blog.com/post-title"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleUrlImport(); }}
                className="flex-1 bg-black/[0.02] dark:bg-white/[0.02] border border-black/[0.09] dark:border-white/[0.08] rounded-lg px-3 py-2 text-[13px] text-black/85 dark:text-white/80 placeholder-black/30 dark:placeholder-white/20 focus:outline-none focus:border-black/[0.22] dark:focus:border-white/[0.22] transition-colors"
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleUrlImport}
                disabled={!urlInput.trim() || fetching}
              >
                {fetching ? "Importing…" : "Import"}
              </Button>
            </div>
          )}

          {/* File mode */}
          {sampleInputMode === "file" && (
            <div className="space-y-2">
              <label className="flex flex-col items-center justify-center gap-2 py-8 border-2 border-dashed border-black/10 dark:border-white/[0.08] rounded-xl cursor-pointer hover:border-black/20 dark:hover:border-white/15 transition-colors">
                <svg className="w-6 h-6 text-black/30 dark:text-white/20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                </svg>
                <span className="text-[13px] text-black/40 dark:text-white/30">
                  Drop a file or click to browse
                </span>
                <span className="text-[11px] text-black/25 dark:text-white/15">
                  .txt, .md, .pdf, .docx
                </span>
                <input
                  type="file"
                  accept=".txt,.md,.pdf,.docx"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleFileUpload(f);
                    e.target.value = "";
                  }}
                />
              </label>
            </div>
          )}

          {/* Category + notes (shared across modes) */}
          <div className="space-y-3 pt-1">
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <label className="text-[12px] text-black/40 dark:text-white/30">Type:</label>
                <select
                  value={sampleCategory}
                  onChange={(e) => setSampleCategory(e.target.value)}
                  className="bg-black/[0.04] dark:bg-white/[0.04] border border-black/[0.09] dark:border-white/[0.08] rounded-lg text-[12px] text-black/75 dark:text-white/70 px-2.5 py-1.5 focus:outline-none focus:border-black/[0.18] dark:focus:border-white/[0.18] transition-colors appearance-none"
                >
                  {selectedTypes.length > 0 && (
                    <optgroup label="Your formats">
                      {priorityTypes.map((t) => (
                        <option key={t} value={t} className="bg-[#111]">{CONTENT_TYPE_LABELS[t]}</option>
                      ))}
                    </optgroup>
                  )}
                  {selectedTypes.length > 0 && otherTypes.length > 0 && (
                    <optgroup label="Other formats">
                      {otherTypes.map((t) => (
                        <option key={t} value={t} className="bg-[#111]">{CONTENT_TYPE_LABELS[t]}</option>
                      ))}
                    </optgroup>
                  )}
                  {selectedTypes.length === 0 && allTypes.map((t) => (
                    <option key={t} value={t} className="bg-[#111]">{CONTENT_TYPE_LABELS[t]}</option>
                  ))}
                  <option value="other" className="bg-[#111]">Other</option>
                </select>
              </div>
            </div>

            <div>
              <textarea
                value={sampleNotes}
                onChange={(e) => setSampleNotes(e.target.value)}
                placeholder="What did you like about this piece? Why is it a good sample of your voice? (optional but helpful)"
                rows={2}
                className="w-full bg-black/[0.02] dark:bg-white/[0.02] border border-black/[0.08] dark:border-white/[0.07] rounded-xl px-4 py-2.5 text-[13px] text-black/70 dark:text-white/60 placeholder-black/25 dark:placeholder-white/15 focus:outline-none focus:border-black/[0.15] dark:focus:border-white/[0.15] resize-none transition-colors"
              />
            </div>
          </div>

          {sampleError && <p className="text-[12px] text-red-400/80">{sampleError}</p>}

          {sampleInputMode === "paste" && (
            <Button
              type="button"
              variant="ghost"
              onClick={handlePasteAdd}
              disabled={!pasteText.trim() || fetching}
            >
              {fetching ? "Saving…" : "+ Add sample"}
            </Button>
          )}
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
            <button
              type="button"
              onClick={() => setStep("words")}
              className="text-[12px] text-black/35 dark:text-white/25 hover:text-black/55 dark:hover:text-white/45 transition-colors"
            >
              {samples.length === 0 ? "Skip" : ""}
            </button>
            <Button type="button" onClick={() => setStep("words")}>
              {samples.length === 0 ? "Skip to next" : "Continue"}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ── Render: Favorite Words ─────────────────────────────────────────────────

  if (step === "words") {
    return (
      <div className="max-w-2xl mx-auto space-y-8 pt-6 px-4">
        <StepIndicator current={overallStepIndex()} steps={OVERALL_STEPS} />

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
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addWord(); }}}
              placeholder='e.g. "luminous", "unravel", "the thing is"…'
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
              No pressure — you can always add these later from your profile.
            </p>
          )}
        </div>

        <div className="flex items-center justify-between pt-4 border-t border-black/[0.07] dark:border-white/[0.06]">
          <button
            type="button"
            onClick={() => setStep("samples")}
            className="text-[12px] text-black/35 dark:text-white/25 hover:text-black/60 dark:hover:text-white/50 transition-colors"
          >
            ← Back
          </button>
          <Button type="button" onClick={() => setStep("review")}>
            Review everything
          </Button>
        </div>
      </div>
    );
  }

  // ── Render: Review ─────────────────────────────────────────────────────────

  if (step === "review") {
    const answeredQuestions = questions
      .map((q) => ({ question: q.prompt, answer: answers[q.id] ?? "" }))
      .filter((a) => a.answer.length > 0);

    return (
      <div className="max-w-2xl mx-auto space-y-8 pt-6 px-4">
        <StepIndicator current={overallStepIndex()} steps={OVERALL_STEPS} />

        <div className="space-y-2">
          <h1 className="text-[22px] font-semibold text-black/90 dark:text-white tracking-tight">
            Here&apos;s what we&apos;ve learned about you
          </h1>
          <p className="text-[14px] text-black/45 dark:text-white/35 leading-relaxed">
            Review everything below. Click any section to edit before we build your voice profile.
          </p>
        </div>

        {/* Account type */}
        <ReviewSection
          title="Account type"
          onEdit={() => setStep("type")}
        >
          <p className="text-[14px] text-black/70 dark:text-white/60">
            {accountType === "brand" ? "Brand / Company" : "Individual"}
          </p>
        </ReviewSection>

        {/* Writing types */}
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

        {/* Answers */}
        <ReviewSection
          title="About you"
          onEdit={() => { setQuestionIndex(0); setStep("questions"); }}
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

        {/* Writing samples */}
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

        {/* Favorite words */}
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
            ← Back
          </button>
          <Button type="button" onClick={submitOnboarding}>
            Build my voice profile
          </Button>
        </div>
      </div>
    );
  }

  // ── Render: Submitting ─────────────────────────────────────────────────────

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
          Setting everything up…
        </p>
      </div>
    </div>
  );
}

// ── Review section component ─────────────────────────────────────────────────

function ReviewSection({
  title,
  onEdit,
  empty,
  emptyLabel,
  children,
}: {
  title: string;
  onEdit: () => void;
  empty?: boolean;
  emptyLabel?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-black/[0.02] dark:bg-white/[0.02] border border-black/[0.08] dark:border-white/[0.07] rounded-xl px-5 py-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-[13px] font-semibold text-black/70 dark:text-white/60">{title}</h3>
        <button
          type="button"
          onClick={onEdit}
          className="text-[11px] text-black/35 dark:text-white/25 hover:text-black/60 dark:hover:text-white/50 transition-colors"
        >
          Edit →
        </button>
      </div>
      {empty ? (
        <p className="text-[12px] text-black/25 dark:text-white/15 italic">{emptyLabel}</p>
      ) : (
        children
      )}
    </div>
  );
}
