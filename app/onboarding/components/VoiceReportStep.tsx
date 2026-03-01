"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { CONTENT_TYPE_LABELS } from "@/lib/content-types";
import type { VoiceAnalysis, SubVoiceAnalysis } from "@/lib/content-types";
import type { AnalyzeStats, Question, AccountType } from "../types";
import confetti from "canvas-confetti";

// ── Editable text field ──────────────────────────────────────────────────────

function EditableField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <div className="space-y-1.5">
        <p className="text-[10px] tracking-[0.12em] uppercase text-black/35 dark:text-white/25 font-semibold">{label}</p>
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={() => setEditing(false)}
          autoFocus
          rows={3}
          className="w-full bg-black/[0.03] dark:bg-white/[0.03] border border-black/[0.12] dark:border-white/[0.12] rounded-lg px-3 py-2 text-[13px] text-black/80 dark:text-white/75 focus:outline-none focus:border-violet-400/40 resize-none transition-colors"
        />
      </div>
    );
  }

  return (
    <div className="space-y-1.5 group cursor-pointer" onClick={() => setEditing(true)}>
      <div className="flex items-center justify-between">
        <p className="text-[10px] tracking-[0.12em] uppercase text-black/35 dark:text-white/25 font-semibold">{label}</p>
        <span className="text-[10px] text-black/20 dark:text-white/15 opacity-0 group-hover:opacity-100 transition-opacity">click to edit</span>
      </div>
      <p className="text-[13px] text-black/70 dark:text-white/60 leading-relaxed">{value}</p>
    </div>
  );
}

// ── Editable list ────────────────────────────────────────────────────────────

function EditableList({
  label,
  items,
  onChange,
}: {
  label: string;
  items: string[];
  onChange: (items: string[]) => void;
}) {
  const [newItem, setNewItem] = useState("");

  function addItem() {
    const trimmed = newItem.trim();
    if (!trimmed) return;
    onChange([...items, trimmed]);
    setNewItem("");
  }

  function removeItem(idx: number) {
    onChange(items.filter((_, i) => i !== idx));
  }

  function updateItem(idx: number, val: string) {
    const updated = [...items];
    updated[idx] = val;
    onChange(updated);
  }

  return (
    <div className="space-y-2">
      <p className="text-[10px] tracking-[0.12em] uppercase text-black/35 dark:text-white/25 font-semibold">{label}</p>
      <div className="space-y-1.5">
        {items.map((item, i) => (
          <div key={i} className="flex items-start gap-2 group">
            <span className="text-black/25 dark:text-white/20 mt-0.5 text-[12px]">&bull;</span>
            <input
              value={item}
              onChange={(e) => updateItem(i, e.target.value)}
              className="flex-1 bg-transparent text-[13px] text-black/70 dark:text-white/60 focus:outline-none border-b border-transparent focus:border-black/15 dark:focus:border-white/12 transition-colors"
            />
            <button
              type="button"
              onClick={() => removeItem(i)}
              className="opacity-0 group-hover:opacity-100 text-black/20 dark:text-white/15 hover:text-red-400 transition-all text-[11px] mt-0.5"
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          value={newItem}
          onChange={(e) => setNewItem(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addItem(); } }}
          placeholder="+ Add..."
          className="flex-1 bg-transparent text-[12px] text-black/50 dark:text-white/40 placeholder-black/25 dark:placeholder-white/15 focus:outline-none border-b border-dashed border-black/10 dark:border-white/[0.06] focus:border-black/20 dark:focus:border-white/15 transition-colors py-1"
        />
      </div>
    </div>
  );
}

// ── Sub-voice card ───────────────────────────────────────────────────────────

function SubVoiceCard({
  category,
  subVoice,
  onChange,
}: {
  category: string;
  subVoice: SubVoiceAnalysis;
  onChange: (sv: SubVoiceAnalysis) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="bg-black/[0.02] dark:bg-white/[0.02] border border-black/[0.08] dark:border-white/[0.07] rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full px-5 py-3.5 flex items-center justify-between text-left hover:bg-black/[0.02] dark:hover:bg-white/[0.02] transition-colors"
      >
        <span className="text-[13px] font-semibold text-black/75 dark:text-white/70">
          {CONTENT_TYPE_LABELS[category] ?? category}
        </span>
        <svg
          className={`w-4 h-4 text-black/30 dark:text-white/20 transition-transform ${expanded ? "rotate-180" : ""}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {expanded && (
        <div className="px-5 pb-4 space-y-4 border-t border-black/[0.06] dark:border-white/[0.05] pt-4">
          <EditableField label="Summary" value={subVoice.summary} onChange={(v) => onChange({ ...subVoice, summary: v })} />
          <EditableField label="Tone shift" value={subVoice.toneShift} onChange={(v) => onChange({ ...subVoice, toneShift: v })} />
          <EditableField label="Structural patterns" value={subVoice.structuralPatterns} onChange={(v) => onChange({ ...subVoice, structuralPatterns: v })} />
          <EditableField label="Vocabulary notes" value={subVoice.vocabularyNotes} onChange={(v) => onChange({ ...subVoice, vocabularyNotes: v })} />
          <EditableList
            label="Key guidelines"
            items={subVoice.keyGuidelines}
            onChange={(items) => onChange({ ...subVoice, keyGuidelines: items })}
          />
        </div>
      )}
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

export default function VoiceReportStep({
  analysis: initialAnalysis,
  stats,
  questions,
  answers,
  accountType,
  favoriteWords,
}: {
  analysis: VoiceAnalysis;
  stats: AnalyzeStats | null;
  questions: Question[];
  answers: Record<string, string>;
  accountType: AccountType;
  favoriteWords: string[];
}) {
  const router = useRouter();
  const [analysis, setAnalysis] = useState<VoiceAnalysis>(initialAnalysis);
  const [saving, setSaving] = useState(false);

  function updateField(key: keyof VoiceAnalysis, value: unknown) {
    setAnalysis((prev) => ({ ...prev, [key]: value }));
  }

  function updateSubVoice(category: string, sv: SubVoiceAnalysis) {
    setAnalysis((prev) => ({
      ...prev,
      subVoices: { ...prev.subVoices, [category]: sv },
    }));
  }

  async function handleSubmit() {
    setSaving(true);

    // Save edits to voice profile
    await fetch("/api/voice/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(analysis),
    }).catch(() => {});

    // Complete onboarding
    const answersArray = questions
      .map((q) => ({ question: q.prompt, answer: answers[q.id] ?? "" }))
      .filter((a) => a.answer.length > 0);

    await fetch("/api/auth/complete-onboarding", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accountType, answers: answersArray, favoriteWords }),
    }).catch(() => {});

    // Save favorite words
    for (const word of favoriteWords) {
      fetch("/api/favorite-words", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ word }),
      }).catch(() => {});
    }

    // Confetti!
    confetti({
      particleCount: 150,
      spread: 80,
      origin: { y: 0.7 },
      colors: ["#a78bfa", "#60a5fa", "#34d399", "#facc15", "#f472b6"],
    });

    setTimeout(() => {
      router.push("/");
    }, 2200);
  }

  const subVoiceEntries = analysis.subVoices ? Object.entries(analysis.subVoices) : [];

  return (
    <div className="max-w-2xl mx-auto space-y-8 pt-8 px-4 pb-16">
      {/* Header */}
      <div className="text-center space-y-3">
        <div className="flex items-center justify-center">
          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-violet-400/20 to-violet-500/10 flex items-center justify-center">
            <svg className="w-6 h-6 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z" />
            </svg>
          </div>
        </div>
        <h1 className="text-[28px] font-bold text-black/90 dark:text-white tracking-tight">
          Your voice, decoded.
        </h1>
        {stats && (
          <p className="text-[14px] text-black/45 dark:text-white/35">
            We analyzed <span className="font-semibold text-black/65 dark:text-white/55">{stats.totalWords.toLocaleString()} words</span> across{" "}
            <span className="font-semibold text-black/65 dark:text-white/55">{stats.sampleCount} sample{stats.sampleCount !== 1 ? "s" : ""}</span>.
            Here&apos;s what we found.
          </p>
        )}
        <p className="text-[12px] text-black/30 dark:text-white/20">
          Everything below is editable &mdash; tweak anything that doesn&apos;t feel right.
        </p>
      </div>

      {/* Voice summary */}
      <div className="bg-gradient-to-br from-violet-50/50 to-transparent dark:from-violet-950/20 dark:to-transparent border border-violet-200/30 dark:border-violet-800/20 rounded-2xl px-6 py-5 space-y-2">
        <EditableField label="Your voice in a nutshell" value={analysis.rawSummary} onChange={(v) => updateField("rawSummary", v)} />
      </div>

      {/* Core traits */}
      <div className="space-y-1">
        <p className="text-[11px] tracking-[0.14em] uppercase text-black/30 dark:text-white/20 font-semibold mb-3">Voice traits</p>
        <div className="grid gap-4">
          <div className="bg-black/[0.02] dark:bg-white/[0.02] border border-black/[0.08] dark:border-white/[0.07] rounded-xl px-5 py-4 space-y-4">
            <EditableField label="Tone" value={analysis.tone} onChange={(v) => updateField("tone", v)} />
            <EditableField label="Sentence structure" value={analysis.sentenceStructure} onChange={(v) => updateField("sentenceStructure", v)} />
            <EditableField label="Vocabulary style" value={analysis.vocabularyStyle} onChange={(v) => updateField("vocabularyStyle", v)} />
            <EditableField label="Punctuation habits" value={analysis.punctuationHabits} onChange={(v) => updateField("punctuationHabits", v)} />
            <EditableField label="Paragraph style" value={analysis.paragraphStyle} onChange={(v) => updateField("paragraphStyle", v)} />
            <EditableField label="Rhetorical devices" value={analysis.rhetoricalDevices} onChange={(v) => updateField("rhetoricalDevices", v)} />
          </div>
        </div>
      </div>

      {/* Patterns & avoids */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-black/[0.02] dark:bg-white/[0.02] border border-black/[0.08] dark:border-white/[0.07] rounded-xl px-5 py-4">
          <EditableList
            label="Common patterns"
            items={analysis.commonPatterns}
            onChange={(v) => updateField("commonPatterns", v)}
          />
        </div>
        <div className="bg-black/[0.02] dark:bg-white/[0.02] border border-black/[0.08] dark:border-white/[0.07] rounded-xl px-5 py-4">
          <EditableList
            label="Things to avoid"
            items={analysis.thingsToAvoid}
            onChange={(v) => updateField("thingsToAvoid", v)}
          />
        </div>
      </div>

      {/* Sub-voices */}
      {subVoiceEntries.length > 0 && (
        <div className="space-y-3">
          <p className="text-[11px] tracking-[0.14em] uppercase text-black/30 dark:text-white/20 font-semibold">
            Format-specific voice profiles
          </p>
          <div className="space-y-2">
            {subVoiceEntries.map(([cat, sv]) => (
              <SubVoiceCard
                key={cat}
                category={cat}
                subVoice={sv}
                onChange={(updated) => updateSubVoice(cat, updated)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Submit */}
      <div className="pt-6 flex justify-center">
        <Button
          type="button"
          onClick={handleSubmit}
          disabled={saving}
          className="px-8 py-3 text-[15px]"
        >
          {saving ? "Saving\u2026" : "Save & Start Writing"}
        </Button>
      </div>
    </div>
  );
}
