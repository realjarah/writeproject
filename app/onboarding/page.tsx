"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

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
    // Mark user as onboarded
    await fetch("/api/auth/complete-onboarding", { method: "POST" }).catch(() => {});
    setStep("done");
  }

  // ── Step: Add samples ────────────────────────────────────────────────────

  if (step === "samples") {
    const wc = wordCount(pasteText);
    return (
      <div className="max-w-2xl mx-auto space-y-8 pt-4">
        {/* Header */}
        <div className="space-y-2">
          <p className="text-xs text-[#555] font-medium tracking-widest uppercase">Step 1 of 2</p>
          <h1 className="text-2xl font-bold text-white">Share some of your writing</h1>
          <p className="text-[#555] text-sm leading-relaxed">
            Paste 2–3 pieces you&apos;ve written — blog posts, emails, LinkedIn updates, anything.
            The more variety, the better your ghostwriter will know your voice.
          </p>
        </div>

        {/* Added samples list */}
        {samples.length > 0 && (
          <div className="space-y-2">
            <p className="text-[11px] text-[#444] uppercase tracking-widest font-semibold">
              Added ({samples.length})
            </p>
            {samples.map((s, i) => (
              <div key={i} className="flex items-center gap-3 bg-[#111] border border-[#1e1e1e] rounded-xl px-4 py-3">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                <span className="text-xs text-[#888] truncate flex-1">
                  {s.content.slice(0, 60)}…
                </span>
                <span className="text-[11px] text-[#444] shrink-0">
                  {s.wordCount.toLocaleString()} words
                </span>
                <span className="text-[10px] text-[#555] bg-[#1a1a1a] border border-[#222] rounded px-1.5 py-0.5 shrink-0">
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
            className="w-full bg-[#111] border border-[#222] rounded-xl px-4 py-3.5 text-sm text-white placeholder-[#333] focus:outline-none focus:border-[#444] resize-none"
          />

          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <label className="text-xs text-[#555]">Format:</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="bg-[#1a1a1a] border border-[#222] rounded-lg text-xs text-white px-2 py-1.5 focus:outline-none focus:border-[#444]"
              >
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>
            {pasteText.trim() && (
              <span className="text-[11px] text-[#444]">{wc.toLocaleString()} words</span>
            )}
          </div>

          {addError && <p className="text-xs text-red-400">{addError}</p>}

          <button
            type="button"
            onClick={addSample}
            disabled={!pasteText.trim() || adding}
            className="px-5 py-2.5 bg-white text-black text-sm font-medium rounded-xl hover:bg-[#e8e8e8] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            {adding ? "Saving…" : "+ Add sample"}
          </button>
        </div>

        {/* Continue */}
        <div className="flex items-center justify-between pt-2 border-t border-[#1a1a1a]">
          <button
            type="button"
            onClick={() => router.push("/")}
            className="text-xs text-[#444] hover:text-[#666] transition-colors"
          >
            Skip for now
          </button>
          <button
            type="button"
            onClick={analyzeAndFinish}
            disabled={samples.length === 0}
            className="px-6 py-2.5 bg-white text-black text-sm font-medium rounded-xl hover:bg-[#e8e8e8] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            Build my voice profile →
          </button>
        </div>
      </div>
    );
  }

  // ── Step: Analyzing ──────────────────────────────────────────────────────

  if (step === "analyzing") {
    return (
      <div className="max-w-2xl mx-auto flex items-center justify-center min-h-[50vh]">
        <div className="text-center space-y-4">
          <div className="flex items-center justify-center gap-2">
            <span className="inline-block w-2 h-2 bg-[#555] rounded-full animate-pulse" />
            <span className="inline-block w-2 h-2 bg-[#555] rounded-full animate-pulse [animation-delay:150ms]" />
            <span className="inline-block w-2 h-2 bg-[#555] rounded-full animate-pulse [animation-delay:300ms]" />
          </div>
          <p className="text-sm text-[#555]">Analyzing your writing style…</p>
          {analyzeError && (
            <p className="text-xs text-amber-400 mt-2">{analyzeError}</p>
          )}
        </div>
      </div>
    );
  }

  // ── Step: Done ───────────────────────────────────────────────────────────

  return (
    <div className="max-w-2xl mx-auto flex items-center justify-center min-h-[50vh]">
      <div className="text-center space-y-6">
        <div className="space-y-2">
          <div className="text-3xl">✓</div>
          <h1 className="text-xl font-bold text-white">Your voice profile is ready</h1>
          <p className="text-sm text-[#555]">
            The ghostwriter has learned your style from{" "}
            <span className="text-white">{samples.length} sample{samples.length !== 1 ? "s" : ""}</span>.
            You can add more any time from your Profile.
          </p>
        </div>

        <div className="flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => router.push("/create")}
            className="px-6 py-3 bg-white text-black text-sm font-medium rounded-xl hover:bg-[#e8e8e8] transition-colors"
          >
            Write something →
          </button>
          <button
            type="button"
            onClick={() => router.push("/")}
            className="px-6 py-3 text-[#555] text-sm border border-[#222] rounded-xl hover:border-[#444] hover:text-white transition-colors"
          >
            Go to dashboard
          </button>
        </div>
      </div>
    </div>
  );
}
