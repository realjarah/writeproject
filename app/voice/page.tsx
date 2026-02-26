"use client";

import { useState, useEffect, useCallback } from "react";
import { detectCategory, type SampleCategory } from "@/lib/detectCategory";
import ReadinessBar from "@/components/ReadinessBar";

const CATEGORIES: { value: SampleCategory; label: string; color: string }[] = [
  { value: "blog",    label: "Blog / Article", color: "#60a5fa" },
  { value: "thread",  label: "Thread",         color: "#a78bfa" },
  { value: "caption", label: "Caption",        color: "#f472b6" },
  { value: "notes",   label: "Notes",          color: "#facc15" },
  { value: "email",   label: "Email",          color: "#34d399" },
  { value: "other",   label: "Other",          color: "#9ca3af" },
];

function categoryMeta(value: string) {
  return CATEGORIES.find((c) => c.value === value) ?? CATEGORIES[CATEGORIES.length - 1];
}

interface Sample {
  id: number;
  title: string;
  content: string;
  wordCount: number;
  category: string;
  createdAt: string;
}

interface VoiceProfile {
  analysis: {
    tone: string;
    sentenceStructure: string;
    vocabularyStyle: string;
    punctuationHabits: string;
    paragraphStyle: string;
    rhetoricalDevices: string;
    commonPatterns: string[];
    thingsToAvoid: string[];
    rawSummary: string;
    categoryInsights?: Record<string, string>;
  };
  updatedAt: string;
}

export default function VoicePage() {
  const [samples, setSamples] = useState<Sample[]>([]);
  const [profile, setProfile] = useState<VoiceProfile | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [category, setCategory] = useState<SampleCategory>("other");
  const [autoDetected, setAutoDetected] = useState(true);
  const [adding, setAdding] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [expandedProfile, setExpandedProfile] = useState(false);

  const load = useCallback(async () => {
    const [samplesRes, profileRes] = await Promise.all([
      fetch("/api/voice"),
      fetch("/api/voice/profile"),
    ]);
    setSamples(await samplesRes.json());
    const p = await profileRes.json();
    setProfile(p);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Auto-detect category when content changes
  useEffect(() => {
    if (autoDetected && content.trim().length > 20) {
      setCategory(detectCategory(content));
    }
  }, [content, autoDetected]);

  function handleCategoryChange(val: SampleCategory) {
    setCategory(val);
    setAutoDetected(false); // user override — stop auto-detecting
  }

  function resetForm() {
    setTitle("");
    setContent("");
    setCategory("other");
    setAutoDetected(true);
    setShowForm(false);
  }

  async function addSample() {
    if (!content.trim()) return;
    setAdding(true);
    await fetch("/api/voice", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, content, category }),
    });
    resetForm();
    setAdding(false);
    load();
  }

  async function deleteSample(id: number) {
    await fetch("/api/voice", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    load();
  }

  async function analyzeVoice() {
    setAnalyzing(true);
    setAnalyzeError("");
    const res = await fetch("/api/voice/analyze", { method: "POST" });
    if (!res.ok) {
      const data = await res.json();
      setAnalyzeError(data.error || "Analysis failed.");
    } else {
      await load();
    }
    setAnalyzing(false);
  }

  const totalWords = samples.reduce((s, x) => s + x.wordCount, 0);
  const categoryCount = new Set(samples.map((s) => s.category)).size;

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">My Voice</h1>
          <p className="text-[#666] text-sm mt-1">
            Add samples of your real writing. The more you add, the better the clone.
          </p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="bg-white text-black text-sm font-medium px-4 py-2 rounded-lg hover:bg-[#e8e8e8] transition-colors"
        >
          + Add sample
        </button>
      </div>

      {/* Readiness bar — always visible once at least 1 sample */}
      {samples.length > 0 && (
        <ReadinessBar
          totalWords={totalWords}
          sampleCount={samples.length}
          categoryCount={categoryCount}
        />
      )}

      {/* Add form */}
      {showForm && (
        <div className="bg-[#161616] border border-[#2a2a2a] rounded-xl p-5 space-y-4">
          <h2 className="font-medium text-white">New Writing Sample</h2>
          <input
            type="text"
            placeholder="Title (optional)"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full bg-[#111] border border-[#2a2a2a] rounded-lg px-3 py-2 text-sm text-white placeholder-[#555] focus:outline-none focus:border-[#444]"
          />
          <textarea
            placeholder="Paste your writing here — blog posts, tweets, emails, essays, anything you've actually written..."
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={10}
            className="w-full bg-[#111] border border-[#2a2a2a] rounded-lg px-3 py-2 text-sm text-white placeholder-[#555] focus:outline-none focus:border-[#444] resize-y"
          />

          {/* Category selector */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-[#555] uppercase tracking-widest">
                Writing type
              </span>
              {content.trim().length > 20 && autoDetected && (
                <span className="text-[10px] text-[#555] bg-[#111] border border-[#2a2a2a] rounded px-1.5 py-0.5">
                  auto-detected
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.map(({ value, label, color }) => (
                <button
                  key={value}
                  onClick={() => handleCategoryChange(value)}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium border transition-all"
                  style={
                    category === value
                      ? { backgroundColor: color + "22", borderColor: color, color }
                      : { backgroundColor: "transparent", borderColor: "#2a2a2a", color: "#555" }
                  }
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={addSample}
              disabled={adding || !content.trim()}
              className="bg-white text-black text-sm font-medium px-4 py-2 rounded-lg hover:bg-[#e8e8e8] transition-colors disabled:opacity-40"
            >
              {adding ? "Saving..." : "Save sample"}
            </button>
            <button
              onClick={resetForm}
              className="text-[#666] text-sm hover:text-[#999] transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Stats + Analyze */}
      {samples.length > 0 && (
        <div className="bg-[#161616] border border-[#222] rounded-xl p-5 flex items-center justify-between">
          <div className="space-y-0.5">
            <div className="text-sm text-white font-medium">
              {samples.length} sample{samples.length !== 1 ? "s" : ""} ·{" "}
              {totalWords.toLocaleString()} words
            </div>
            <div className="text-xs text-[#555]">
              {samples.length < 3
                ? `Add ${3 - samples.length} more sample${3 - samples.length !== 1 ? "s" : ""} for a better analysis`
                : "Good amount of data — ready to analyze"}
            </div>
          </div>
          <div className="flex flex-col items-end gap-2">
            <button
              onClick={analyzeVoice}
              disabled={analyzing || samples.length === 0}
              className="bg-white text-black text-sm font-medium px-4 py-2 rounded-lg hover:bg-[#e8e8e8] transition-colors disabled:opacity-40"
            >
              {analyzing ? "Analyzing..." : profile ? "Re-analyze voice" : "Analyze voice"}
            </button>
            {analyzeError && (
              <p className="text-xs text-red-400">{analyzeError}</p>
            )}
          </div>
        </div>
      )}

      {/* Voice profile */}
      {profile && (
        <div className="bg-[#111] border border-[#1e1e1e] rounded-xl overflow-hidden">
          <button
            onClick={() => setExpandedProfile(!expandedProfile)}
            className="w-full flex items-center justify-between px-5 py-4 hover:bg-[#161616] transition-colors"
          >
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-emerald-400" />
              <span className="font-medium text-white text-sm">Voice profile active</span>
            </div>
            <span className="text-[#555] text-xs">
              {expandedProfile ? "Hide" : "View details"}
            </span>
          </button>
          {expandedProfile && (
            <div className="px-5 pb-5 space-y-4 border-t border-[#1e1e1e] pt-4">
              <p className="text-sm text-[#aaa] italic">
                &ldquo;{profile.analysis.rawSummary}&rdquo;
              </p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {[
                  ["Tone", profile.analysis.tone],
                  ["Sentence structure", profile.analysis.sentenceStructure],
                  ["Vocabulary", profile.analysis.vocabularyStyle],
                  ["Punctuation", profile.analysis.punctuationHabits],
                  ["Paragraphs", profile.analysis.paragraphStyle],
                  ["Rhetorical devices", profile.analysis.rhetoricalDevices],
                ].map(([label, val]) => (
                  <div key={label} className="space-y-0.5">
                    <div className="text-xs font-semibold text-[#555] uppercase tracking-widest">
                      {label}
                    </div>
                    <div className="text-xs text-[#888]">{val}</div>
                  </div>
                ))}
              </div>
              {profile.analysis.commonPatterns?.length > 0 && (
                <div className="space-y-1">
                  <div className="text-xs font-semibold text-[#555] uppercase tracking-widest">
                    Recurring patterns
                  </div>
                  <ul className="space-y-0.5">
                    {profile.analysis.commonPatterns.map((p, i) => (
                      <li key={i} className="text-xs text-[#888]">· {p}</li>
                    ))}
                  </ul>
                </div>
              )}
              {profile.analysis.categoryInsights &&
                Object.keys(profile.analysis.categoryInsights).length > 0 && (
                  <div className="space-y-2">
                    <div className="text-xs font-semibold text-[#555] uppercase tracking-widest">
                      Style by format
                    </div>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {Object.entries(profile.analysis.categoryInsights).map(
                        ([cat, insight]) => {
                          const meta = categoryMeta(cat);
                          return (
                            <div
                              key={cat}
                              className="rounded-lg px-3 py-2 space-y-0.5 border"
                              style={{ borderColor: meta.color + "44", backgroundColor: meta.color + "0d" }}
                            >
                              <div
                                className="text-[10px] font-bold uppercase tracking-widest"
                                style={{ color: meta.color }}
                              >
                                {meta.label}
                              </div>
                              <div className="text-xs text-[#888]">{insight}</div>
                            </div>
                          );
                        }
                      )}
                    </div>
                  </div>
                )}
            </div>
          )}
        </div>
      )}

      {/* Samples list */}
      {samples.length === 0 ? (
        <div className="text-center py-16 text-[#444] text-sm">
          No samples yet. Add some of your writing to get started.
        </div>
      ) : (
        <div className="space-y-3">
          {samples.map((s) => {
            const meta = categoryMeta(s.category);
            return (
              <div
                key={s.id}
                className="bg-[#161616] border border-[#222] rounded-xl p-4 flex items-start justify-between gap-4"
              >
                <div className="space-y-1.5 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-white text-sm">{s.title}</span>
                    <span
                      className="text-[10px] font-semibold px-2 py-0.5 rounded-full border"
                      style={{
                        color: meta.color,
                        borderColor: meta.color + "55",
                        backgroundColor: meta.color + "15",
                      }}
                    >
                      {meta.label}
                    </span>
                  </div>
                  <div className="text-xs text-[#555]">
                    {s.wordCount} words ·{" "}
                    {new Date(s.createdAt).toLocaleDateString()}
                  </div>
                  <p className="text-xs text-[#666] line-clamp-2">{s.content}</p>
                </div>
                <button
                  onClick={() => deleteSample(s.id)}
                  className="text-[#444] hover:text-red-400 transition-colors text-xs shrink-0 mt-0.5"
                >
                  Remove
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
