"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

type Step = "samples" | "analyzing" | "done";

interface AddedSample {
  title: string;
  content: string;
  wordCount: number;
  category: string;
}

const CATEGORIES = [
  { value: "blog",        label: "Blog / Article" },
  { value: "essay",       label: "Essay / Opinion" },
  { value: "newsletter",  label: "Newsletter" },
  { value: "social",      label: "Social post" },
  { value: "email",       label: "Email" },
  { value: "technical",   label: "Technical / Docs" },
  { value: "other",       label: "Other" },
];

function wordCount(text: string) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("samples");

  // Sample form
  const [pasteText, setPasteText] = useState("");
  const [category, setCategory] = useState("other");
  const [addError, setAddError] = useState("");
  const [adding, setAdding] = useState(false);
  const [samples, setSamples] = useState<AddedSample[]>([]);

  // Analysis
  const [analyzeError, setAnalyzeError] = useState("");

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
        category,
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
      { title: `Sample ${prev.length + 1}`, content: pasteText.trim(), wordCount: wc, category },
    ]);
    setPasteText("");
    setCategory("other");
  }

  async function analyzeAndFinish() {
    setStep("analyzing");
    setAnalyzeError("");
    const res = await fetch("/api/voice/analyze", { method: "POST" });
    if (!res.ok) {
      setAnalyzeError("Analysis failed — you can retry this from your Profile later.");
    }
    await fetch("/api/auth/complete-onboarding", { method: "POST" }).catch(() => {});
    setStep("done");
  }

  // ── Step: Add samples ─────────────────────────────────────────────────────

  if (step === "samples") {
    const wc = wordCount(pasteText);
    return (
      <div className="max-w-2xl mx-auto space-y-8 pt-4 px-4">

        {/* Header */}
        <div className="space-y-2">
          <p className="text-[11px] tracking-[0.14em] uppercase text-black/35 dark:text-white/25 font-medium">Step 1 of 2</p>
          <h1 className="text-[22px] font-semibold text-black/90 dark:text-white tracking-tight">Share some of your writing</h1>
          <p className="text-[14px] text-black/45 dark:text-white/35 leading-relaxed">
            Paste 2–3 pieces you&apos;ve written — blog posts, emails, LinkedIn updates, anything.
            The more variety, the better your ghostwriter will know your voice.
          </p>
        </div>

        {/* Added samples list */}
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
                  {CATEGORIES.find((c) => c.value === s.category)?.label ?? s.category}
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
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="bg-black/[0.04] dark:bg-white/[0.04] border border-black/[0.09] dark:border-white/[0.08] rounded-lg text-[12px] text-black/75 dark:text-white/70 px-2.5 py-1.5 focus:outline-none focus:border-black/[0.18] dark:focus:border-white/[0.18] transition-colors appearance-none"
              >
                {CATEGORIES.map((c) => (
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
            onClick={() => router.push("/")}
            className="text-[12px] text-black/35 dark:text-white/25 hover:text-black/60 dark:hover:text-white/50 transition-colors"
          >
            Skip for now
          </button>
          <Button
            type="button"
            onClick={analyzeAndFinish}
            disabled={samples.length === 0}
          >
            Build my voice profile
          </Button>
        </div>
      </div>
    );
  }

  // ── Step: Analyzing ───────────────────────────────────────────────────────

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
          <p className="text-[14px] text-black/45 dark:text-white/35">Analyzing your writing style…</p>
          {analyzeError && (
            <p className="text-[12px] text-amber-400/70 mt-2">{analyzeError}</p>
          )}
        </div>
      </div>
    );
  }

  // ── Step: Done ────────────────────────────────────────────────────────────

  return (
    <div className="max-w-2xl mx-auto flex items-center justify-center min-h-[50vh] px-4">
      <div className="text-center space-y-7">
        <div className="space-y-3">
          <div className="w-10 h-10 rounded-full bg-emerald-400/10 border border-emerald-400/20 flex items-center justify-center mx-auto">
            <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-[22px] font-semibold text-black/90 dark:text-white tracking-tight">Voice profile ready</h1>
          <p className="text-[14px] text-black/45 dark:text-white/35 leading-relaxed">
            The ghostwriter has learned your style from{" "}
            <span className="text-black/75 dark:text-white/70">{samples.length} sample{samples.length !== 1 ? "s" : ""}</span>.
            Add more any time from your Profile.
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
