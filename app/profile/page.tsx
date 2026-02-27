"use client";

import { useState, useEffect, useCallback } from "react";
import { detectCategory, type SampleCategory } from "@/lib/detectCategory";
import ReadinessBar from "@/components/ReadinessBar";
import { CONTENT_TYPE_GROUPS, CONTENT_TYPE_LABELS } from "@/lib/content-types";

// ── Color helpers ─────────────────────────────────────────────────────────────

const GROUP_COLORS: Record<string, string> = {
  "Writing":              "#60a5fa",
  "Business":             "#34d399",
  "Career":               "#a78bfa",
  "Academic & Technical": "#fb923c",
  "Short-form":           "#f472b6",
  "Spoken word":          "#facc15",
};

function groupColor(type: string): string {
  for (const g of CONTENT_TYPE_GROUPS) {
    if (g.types.includes(type)) return GROUP_COLORS[g.label] ?? "#9ca3af";
  }
  return "#9ca3af";
}

// Per-type mastery: smooth curve targeting 100k words for 100%
function masteryPct(words: number, count: number): number {
  if (count === 0) return 0;
  if (words === 0) return 0;
  const w =
    words >= 100_000 ? 100 :
    words >=  75_000 ? 88 + Math.round(((words -  75_000) / 25_000) * 12) :
    words >=  50_000 ? 74 + Math.round(((words -  50_000) / 25_000) * 14) :
    words >=  25_000 ? 56 + Math.round(((words -  25_000) / 25_000) * 18) :
    words >=  10_000 ? 38 + Math.round(((words -  10_000) / 15_000) * 18) :
    words >=   5_000 ? 24 + Math.round(((words -   5_000) /  5_000) * 14) :
    words >=   1_000 ? 10 + Math.round(((words -   1_000) /  4_000) * 14) :
    words >=     100 ?  2 + Math.round(((words -     100) /    900) *  8) : 1;
  return Math.min(100, w);
}

function fmtWords(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1)}k`;
  return n.toLocaleString();
}

function masteryColor(pct: number): string {
  if (pct >= 80) return "#34d399";
  if (pct >= 60) return "#86efac";
  if (pct >= 40) return "#facc15";
  if (pct >= 20) return "#fb923c";
  if (pct > 0)   return "#f87171";
  return "#2a2a2a";
}

// ── Types ─────────────────────────────────────────────────────────────────────

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
  };
  updatedAt: string;
}

interface Signature {
  id: number;
  name: string;
  content: string;
  isDefault: boolean;
  isSystem: boolean;
  createdAt: string;
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ProfilePage() {
  // Read initial tab from URL search param (client-side only)
  const [activeTab, setActiveTab] = useState<"train" | "signatures" | "archive">("train");

  useEffect(() => {
    if (typeof window !== "undefined") {
      const p = new URLSearchParams(window.location.search);
      if (p.get("tab") === "signatures") setActiveTab("signatures");
      if (p.get("tab") === "archive")    setActiveTab("archive");
    }
  }, []);

  return (
    <div className="space-y-6">
      {/* Tab bar */}
      <div className="flex items-center gap-1 bg-black/[0.04] dark:bg-white/[0.04] border border-black/[0.08] dark:border-white/[0.07] rounded-xl p-1 w-fit">
        {(["train", "signatures", "archive"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-3.5 py-1.5 rounded-lg text-[13px] font-medium transition-all duration-150 ${
              activeTab === tab
                ? "bg-black/[0.09] dark:bg-white/[0.09] text-black/90 dark:text-white"
                : "text-black/50 dark:text-white/40 hover:text-black/75 dark:hover:text-white/70"
            }`}
          >
            {tab === "train" ? "My Voice" : tab === "signatures" ? "Signatures" : "Archive"}
          </button>
        ))}
      </div>

      {activeTab === "train"       && <TrainTab />}
      {activeTab === "signatures"  && <SignaturesTab />}
      {activeTab === "archive"     && <ArchiveTab />}
    </div>
  );
}

// ── Train tab (voice samples) ─────────────────────────────────────────────────

function TrainTab() {
  const [samples, setSamples] = useState<Sample[]>([]);
  const [profile, setProfile] = useState<VoiceProfile | null>(null);

  // Form state
  const [title, setTitle]           = useState("");
  const [content, setContent]       = useState("");
  const [category, setCategory]     = useState<SampleCategory>("blog");
  const [autoDetected, setAutoDetected] = useState(true);
  const [adding, setAdding]         = useState(false);
  const [showForm, setShowForm]     = useState(false);
  const [fileError, setFileError]   = useState("");

  // Input mode
  const [inputMode, setInputMode]   = useState<"paste" | "url" | "file">("paste");
  const [urlInput, setUrlInput]     = useState("");
  const [fetching, setFetching]     = useState(false);
  const [fetchError, setFetchError] = useState("");

  // Profile expand
  const [expandedProfile, setExpandedProfile] = useState(false);

  // Auto-analyze state (shown after adding samples)
  const [analyzing, setAnalyzing]     = useState(false);
  const [analyzeError, setAnalyzeError] = useState("");

  const load = useCallback(async () => {
    const [samplesRes, profileRes] = await Promise.all([
      fetch("/api/voice"),
      fetch("/api/voice/profile"),
    ]);
    setSamples(await samplesRes.json());
    const p = await profileRes.json();
    setProfile(p);
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (autoDetected && content.trim().length > 20) {
      setCategory(detectCategory(content));
    }
  }, [content, autoDetected]);

  function resetForm() {
    setTitle(""); setContent(""); setCategory("blog");
    setAutoDetected(true); setShowForm(false); setFileError("");
    setInputMode("paste"); setUrlInput(""); setFetchError("");
  }

  // Auto-analyze after adding a sample
  async function triggerAnalyze() {
    setAnalyzing(true);
    setAnalyzeError("");
    try {
      const res = await fetch("/api/voice/analyze", { method: "POST" });
      if (!res.ok) {
        const data = await res.json();
        setAnalyzeError(data.error || "Re-analysis failed.");
      } else {
        await load(); // reload profile
      }
    } catch {
      setAnalyzeError("Re-analysis failed.");
    } finally {
      setAnalyzing(false);
    }
  }

  async function saveDirect(text: string, sampleTitle: string, sampleCategory: SampleCategory) {
    await fetch("/api/voice", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: sampleTitle, content: text, category: sampleCategory }),
    });
    resetForm();
    await load();
    triggerAnalyze(); // non-blocking re-analyze
  }

  function handleFile(file: File) {
    setFileError("");
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
            setFileError(data.error || "PDF extraction failed.");
          } else {
            await saveDirect(data.text, inferredTitle, detectCategory(data.text));
          }
        } catch {
          setFileError("PDF extraction failed. Try again.");
        } finally {
          setFetching(false);
        }
      };
      reader.readAsDataURL(file);
      return;
    }
    const reader = new FileReader();
    reader.onload = async (e) => {
      const text = (e.target?.result as string) || "";
      if (!text.trim()) return;
      await saveDirect(text, inferredTitle, detectCategory(text));
    };
    reader.readAsText(file);
  }

  async function handleUrl() {
    if (!urlInput.trim()) return;
    setFetching(true);
    setFetchError("");
    try {
      const res = await fetch("/api/voice/import-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: urlInput.trim() }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setFetchError(data.error || "Could not fetch URL.");
      } else {
        await saveDirect(data.text, data.title || urlInput.trim(), detectCategory(data.text));
      }
    } catch {
      setFetchError("Fetch failed. Check the URL and try again.");
    } finally {
      setFetching(false);
    }
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
    await load();
    triggerAnalyze(); // non-blocking re-analyze
  }

  async function deleteSample(id: number) {
    await fetch("/api/voice", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    load();
  }

  const typeStats = samples.reduce(
    (acc, s) => {
      if (!acc[s.category]) acc[s.category] = { count: 0, words: 0 };
      acc[s.category].count += 1;
      acc[s.category].words += s.wordCount;
      return acc;
    },
    {} as Record<string, { count: number; words: number }>
  );

  const totalWords    = samples.reduce((s, x) => s + x.wordCount, 0);
  const categoryCount = new Set(samples.map((s) => s.category)).size;

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-[22px] font-semibold text-black/90 dark:text-white tracking-tight">My Voice</h1>
          <p className="text-black/45 dark:text-white/35 text-sm mt-1">
            Paste your actual writing — the more you add, the more accurate the ghost.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {analyzing && (
            <span className="flex items-center gap-1.5 text-xs text-black/40 dark:text-white/30">
              <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
              </svg>
              Updating voice…
            </span>
          )}
          {!showForm && (
            <button
              onClick={() => setShowForm(true)}
              className="bg-white text-black text-sm font-medium px-4 py-2 rounded-lg hover:bg-white/90 transition-colors"
            >
              + Add sample
            </button>
          )}
        </div>
      </div>

      {analyzeError && (
        <p className="text-xs text-red-400">{analyzeError}</p>
      )}

      {/* Readiness */}
      {samples.length > 0 && (
        <ReadinessBar
          totalWords={totalWords}
          sampleCount={samples.length}
          categoryCount={categoryCount}
        />
      )}

      {/* Add sample form */}
      {showForm && (
        <div className="bg-black/[0.03] dark:bg-white/[0.03] border border-black/[0.09] dark:border-white/[0.08] rounded-xl p-5 space-y-4">
          <h2 className="font-medium text-black/90 dark:text-white">New Writing Sample</h2>

          {/* Input mode tabs */}
          <div className="flex gap-1 border-b border-black/[0.09] dark:border-white/[0.08] pb-1">
            {(["paste", "url", "file"] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => { setInputMode(mode); setFetchError(""); setFileError(""); }}
                className={`text-[11px] px-3 py-1 rounded-t transition-colors ${
                  inputMode === mode
                    ? "bg-black/[0.08] dark:bg-white/[0.09] text-black/90 dark:text-white"
                    : "text-black/40 dark:text-white/30"
                }`}
              >
                {mode === "paste" ? "Paste text" : mode === "url" ? "Import from URL" : "Upload file"}
              </button>
            ))}
          </div>

          {/* URL import */}
          {inputMode === "url" && (
            <div className="space-y-2">
              <div className="flex gap-2">
                <input
                  type="url"
                  placeholder="https://your-blog.com/post-title"
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleUrl(); }}
                  autoFocus
                  className="flex-1 bg-black/[0.02] dark:bg-white/[0.02] border border-black/[0.09] dark:border-white/[0.08] rounded-lg px-3 py-2 text-[13px] text-black/85 dark:text-white/80 placeholder-black/30 dark:placeholder-white/20 focus:outline-none focus:border-black/[0.22] dark:focus:border-white/[0.22] transition-colors"
                />
                <button
                  onClick={handleUrl}
                  disabled={fetching || !urlInput.trim()}
                  className="bg-white text-black text-sm font-medium px-4 py-2 rounded-lg hover:bg-white/90 transition-colors disabled:opacity-40 whitespace-nowrap"
                >
                  {fetching ? "Importing…" : "Import"}
                </button>
              </div>
              {fetchError && <p className="text-[11px] text-red-400">{fetchError}</p>}
              <p className="text-[11px] text-black/35 dark:text-white/25">Any published writing — blog posts, articles, newsletters, etc.</p>
              <button onClick={resetForm} className="text-black/45 dark:text-white/35 text-sm hover:text-black/70 dark:hover:text-white/60 transition-colors">Cancel</button>
            </div>
          )}

          {/* File upload */}
          {inputMode === "file" && (
            <div className="space-y-2">
              <label
                className="flex flex-col items-center justify-center gap-2 border border-dashed border-black/[0.09] dark:border-white/[0.08] rounded-lg p-8 cursor-pointer hover:border-black/[0.18] dark:hover:border-white/[0.18] transition-colors"
                style={fetching ? { opacity: 0.5, pointerEvents: "none" } : {}}
              >
                <span className="text-black/40 dark:text-white/30 text-sm">{fetching ? "Saving…" : "Click to upload or drag a file here"}</span>
                <span className="text-[11px] text-black/35 dark:text-white/25">.txt · .md · .pdf</span>
                <input
                  type="file"
                  accept=".txt,.md,.markdown,.text,.pdf"
                  className="hidden"
                  disabled={fetching}
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }}
                />
              </label>
              {fileError && <p className="text-[11px] text-red-400">{fileError}</p>}
              <button onClick={resetForm} className="text-black/45 dark:text-white/35 text-sm hover:text-black/70 dark:hover:text-white/60 transition-colors">Cancel</button>
            </div>
          )}

          {/* Paste mode */}
          {inputMode === "paste" && (<>
            <input
              type="text"
              placeholder="Title (optional)"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full bg-black/[0.02] dark:bg-white/[0.02] border border-black/[0.09] dark:border-white/[0.08] rounded-lg px-3 py-2 text-[13px] text-black/85 dark:text-white/80 placeholder-black/30 dark:placeholder-white/20 focus:outline-none focus:border-black/[0.22] dark:focus:border-white/[0.22] transition-colors"
            />
            <textarea
              placeholder="Paste your writing here — blog posts, emails, essays, tweets, anything you've actually written…"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={10}
              className="w-full bg-black/[0.02] dark:bg-white/[0.02] border border-black/[0.09] dark:border-white/[0.08] rounded-lg px-3 py-2 text-[13px] text-black/85 dark:text-white/80 placeholder-black/30 dark:placeholder-white/20 focus:outline-none focus:border-black/[0.22] dark:focus:border-white/[0.22] transition-colors resize-y"
            />

            {/* Category picker */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-black/40 dark:text-white/30 uppercase tracking-widest">Writing type</span>
                {content.trim().length > 20 && autoDetected && (
                  <span className="text-[10px] text-black/40 dark:text-white/30 bg-black/[0.02] dark:bg-white/[0.02] border border-black/[0.09] dark:border-white/[0.08] rounded px-1.5 py-0.5">auto-detected</span>
                )}
              </div>
              <div className="space-y-2">
                {CONTENT_TYPE_GROUPS.map((group) => (
                  <div key={group.label}>
                    <div className="text-[10px] text-black/35 dark:text-white/25 uppercase tracking-wider mb-1.5">{group.label}</div>
                    <div className="flex flex-wrap gap-1.5">
                      {group.types.map((type) => (
                        <button
                          key={type}
                          onClick={() => { setCategory(type as SampleCategory); setAutoDetected(false); }}
                          className="px-2.5 py-1 rounded-md text-[11px] font-medium border transition-all"
                          className={category !== type ? "border-black/[0.1] dark:border-white/[0.1] text-black/40 dark:text-white/30" : ""}
                          style={
                            category === type
                              ? { backgroundColor: groupColor(type) + "22", borderColor: groupColor(type), color: groupColor(type) }
                              : undefined
                          }
                        >
                          {CONTENT_TYPE_LABELS[type]}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={addSample}
                disabled={adding || !content.trim()}
                className="bg-white text-black text-sm font-medium px-4 py-2 rounded-lg hover:bg-white/90 transition-colors disabled:opacity-40"
              >
                {adding ? "Saving…" : "Save sample"}
              </button>
              <button onClick={resetForm} className="text-black/45 dark:text-white/35 text-sm hover:text-black/70 dark:hover:text-white/60 transition-colors">Cancel</button>
            </div>
          </>)}
        </div>
      )}

      {/* Voice profile */}
      {profile && (
        <div className="bg-black/[0.03] dark:bg-white/[0.03] border border-black/[0.08] dark:border-white/[0.07] rounded-xl overflow-hidden">
          <button
            onClick={() => setExpandedProfile((v) => !v)}
            className="w-full flex items-center justify-between px-5 py-4 hover:bg-black/[0.04] dark:hover:bg-white/[0.04] transition-colors text-left"
          >
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-emerald-400" />
                <span className="text-sm font-medium text-black/90 dark:text-white">Voice profile</span>
              </div>
              <p className="text-xs text-black/40 dark:text-white/30 pl-4">Updated {new Date(profile.updatedAt).toLocaleDateString()}</p>
            </div>
            <svg
              className={`w-4 h-4 text-black/35 dark:text-white/25 transition-transform ${expandedProfile ? "rotate-180" : ""}`}
              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {expandedProfile && (
            <div className="border-t border-black/[0.07] dark:border-white/[0.06] px-5 py-4 space-y-4">
              <p className="text-sm text-black/60 dark:text-white/50 leading-relaxed">{profile.analysis.rawSummary}</p>
              <div className="grid grid-cols-2 gap-3">
                {[
                  ["Tone", profile.analysis.tone],
                  ["Sentences", profile.analysis.sentenceStructure],
                  ["Vocabulary", profile.analysis.vocabularyStyle],
                  ["Punctuation", profile.analysis.punctuationHabits],
                  ["Paragraphs", profile.analysis.paragraphStyle],
                  ["Devices", profile.analysis.rhetoricalDevices],
                ].map(([label, value]) => (
                  <div key={label} className="space-y-1">
                    <div className="text-[10px] font-semibold text-black/35 dark:text-white/25 uppercase tracking-widest">{label}</div>
                    <p className="text-xs text-black/45 dark:text-white/35 leading-relaxed">{value}</p>
                  </div>
                ))}
              </div>
              {profile.analysis.thingsToAvoid?.length > 0 && (
                <div className="space-y-2">
                  <div className="text-[10px] font-semibold text-black/35 dark:text-white/25 uppercase tracking-widest">Things to avoid</div>
                  <div className="flex flex-wrap gap-1.5">
                    {profile.analysis.thingsToAvoid.map((t, i) => (
                      <span key={i} className="text-[11px] text-black/40 dark:text-white/30 bg-black/[0.02] dark:bg-white/[0.02] border border-black/[0.08] dark:border-white/[0.07] rounded-full px-2.5 py-0.5">{t}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Per-type mastery */}
      {samples.length > 0 && (() => {
        // Separate trained types (any words) from untrained
        const trainedGroups = CONTENT_TYPE_GROUPS
          .map((g) => ({ ...g, types: g.types.filter((t) => (typeStats[t]?.words ?? 0) > 0) }))
          .filter((g) => g.types.length > 0);
        const untrainedGroups = CONTENT_TYPE_GROUPS
          .map((g) => ({ ...g, types: g.types.filter((t) => (typeStats[t]?.words ?? 0) === 0) }))
          .filter((g) => g.types.length > 0);

        return (
          <div className="space-y-5">
            <div>
              <h2 className="text-sm font-semibold text-black/90 dark:text-white">Training by format</h2>
              <p className="text-xs text-black/40 dark:text-white/30 mt-0.5">
                100k words per format = full mastery. Each format trains the ghost independently.
              </p>
            </div>

            {/* Trained types */}
            {trainedGroups.map((group) => (
              <div key={group.label} className="space-y-3">
                <div
                  className="text-[10px] font-bold uppercase tracking-widest"
                  style={{ color: GROUP_COLORS[group.label] + "99" }}
                >
                  {group.label}
                </div>
                {group.types.map((type) => {
                  const stats = typeStats[type] ?? { count: 0, words: 0 };
                  const pct   = masteryPct(stats.words, stats.count);
                  const color = masteryColor(pct);
                  return (
                    <div key={type} className="space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] text-black/60 dark:text-white/50">{CONTENT_TYPE_LABELS[type]}</span>
                        <span className="text-[10px] text-black/35 dark:text-white/25">
                          {fmtWords(stats.words)} words · {stats.count} {stats.count === 1 ? "sample" : "samples"}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 bg-black/[0.04] dark:bg-white/[0.04] rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{ width: `${pct}%`, backgroundColor: color }}
                          />
                        </div>
                        <span className="text-[10px] w-8 text-right shrink-0 tabular-nums" style={{ color }}>
                          {pct}%
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}

            {/* Untrained types — collapsed hint */}
            {untrainedGroups.length > 0 && (
              <div className="border-t border-black/[0.06] dark:border-white/[0.05] pt-4 space-y-1.5">
                <p className="text-[10px] text-black/30 dark:text-white/20 uppercase tracking-widest font-bold">
                  Not yet trained
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {untrainedGroups.flatMap((g) => g.types).map((type) => (
                    <span
                      key={type}
                      className="text-[10px] text-black/30 dark:text-white/20 bg-black/[0.02] dark:bg-white/[0.02] border border-black/[0.07] dark:border-white/[0.06] rounded-md px-2 py-0.5"
                    >
                      {CONTENT_TYPE_LABELS[type]}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* Sample list */}
      {samples.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-black/90 dark:text-white">Samples ({samples.length})</h2>
          {samples.map((s) => (
            <div key={s.id} className="flex items-center justify-between gap-3 py-2.5 border-b border-black/[0.06] dark:border-white/[0.05]">
              <div className="min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span
                    className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                    style={{ color: groupColor(s.category), backgroundColor: groupColor(s.category) + "22" }}
                  >
                    {CONTENT_TYPE_LABELS[s.category] ?? s.category}
                  </span>
                  <span className="text-xs text-black/40 dark:text-white/30">{s.wordCount.toLocaleString()} words</span>
                </div>
                <p className="text-sm text-black/60 dark:text-white/50 truncate">{s.title || "Untitled"}</p>
              </div>
              <button
                onClick={() => deleteSample(s.id)}
                className="text-black/30 dark:text-white/20 hover:text-red-400 transition-colors text-xs shrink-0"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}

      {samples.length === 0 && !showForm && (
        <div className="text-center py-16 text-black/35 dark:text-white/25 text-sm">
          No samples yet. Add your writing to train the ghost.
        </div>
      )}
    </div>
  );
}

// ── Signatures tab ────────────────────────────────────────────────────────────

function SignaturesTab() {
  const [signatures, setSignatures] = useState<Signature[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  const [newName, setNewName] = useState("");
  const [newContent, setNewContent] = useState("");
  const [newIsDefault, setNewIsDefault] = useState(false);
  const [saving, setSaving] = useState(false);

  const [editName, setEditName] = useState("");
  const [editContent, setEditContent] = useState("");

  const load = useCallback(async () => {
    const res = await fetch("/api/signatures");
    setSignatures(await res.json());
  }, []);

  useEffect(() => { load(); }, [load]);

  function openEdit(sig: Signature) {
    setEditingId(sig.id);
    setEditName(sig.name);
    setEditContent(sig.content);
  }
  function cancelEdit() { setEditingId(null); setEditName(""); setEditContent(""); }

  async function saveEdit(id: number) {
    setSaving(true);
    await fetch("/api/signatures", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, name: editName, content: editContent }),
    });
    cancelEdit(); setSaving(false); load();
  }

  async function createSignature() {
    if (!newName.trim() || !newContent.trim()) return;
    setSaving(true);
    await fetch("/api/signatures", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName, content: newContent, isDefault: newIsDefault }),
    });
    setNewName(""); setNewContent(""); setNewIsDefault(false);
    setShowForm(false); setSaving(false); load();
  }

  async function setDefault(id: number) {
    await fetch("/api/signatures", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, isDefault: true }),
    });
    load();
  }

  async function deleteSig(id: number) {
    await fetch("/api/signatures", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    load();
  }

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-[22px] font-semibold text-black/90 dark:text-white tracking-tight">Signatures</h1>
          <p className="text-black/45 dark:text-white/35 text-sm mt-1">
            Custom footers appended to your generated content — links, credits, CTAs.
          </p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="bg-white text-black text-sm font-medium px-4 py-2 rounded-lg hover:bg-white/90 transition-colors"
        >
          + New signature
        </button>
      </div>

      <div className="bg-black/[0.02] dark:bg-white/[0.02] border border-black/[0.07] dark:border-white/[0.06] rounded-xl px-5 py-4 flex items-start gap-3">
        <div className="w-1.5 h-1.5 rounded-full bg-black/30 dark:bg-white/30 shrink-0 mt-1.5" />
        <p className="text-xs text-black/40 dark:text-white/30 leading-relaxed">
          All content generated on the free tier includes a{" "}
          <span className="text-black/60 dark:text-white/50">&ldquo;Written by me, powered by Ghostwrite&rdquo;</span>{" "}
          attribution by default. Customise the text or add your own signatures on top.
        </p>
      </div>

      {showForm && (
        <div className="bg-black/[0.03] dark:bg-white/[0.03] border border-black/[0.09] dark:border-white/[0.08] rounded-xl p-5 space-y-4">
          <h2 className="font-medium text-black/90 dark:text-white">New Signature</h2>
          <input
            type="text"
            placeholder="Name (e.g. Newsletter footer)"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="w-full bg-black/[0.02] dark:bg-white/[0.02] border border-black/[0.09] dark:border-white/[0.08] rounded-lg px-3 py-2 text-[13px] text-black/85 dark:text-white/80 placeholder-black/30 dark:placeholder-white/20 focus:outline-none focus:border-black/[0.22] dark:focus:border-white/[0.22] transition-colors"
          />
          <div className="space-y-1.5">
            <label className="text-xs text-black/40 dark:text-white/30">Content — plain text, links, emoji are all fine</label>
            <textarea
              placeholder={"---\n\nFollow me on Twitter: @yourhandle\nBuilding in public at yoursite.com"}
              value={newContent}
              onChange={(e) => setNewContent(e.target.value)}
              rows={5}
              className="w-full bg-black/[0.02] dark:bg-white/[0.02] border border-black/[0.09] dark:border-white/[0.08] rounded-lg px-3 py-2 text-sm text-black/90 dark:text-white placeholder-black/30 dark:placeholder-white/20 font-mono focus:outline-none focus:border-black/[0.22] dark:focus:border-white/[0.22] resize-y"
            />
          </div>
          {newContent && (
            <div className="space-y-1">
              <div className="text-xs font-semibold text-black/40 dark:text-white/30 uppercase tracking-widest">Preview</div>
              <div className="bg-black/50 border border-black/[0.08] dark:border-white/[0.07] rounded-lg px-4 py-3">
                <pre className="text-xs text-black/60 dark:text-white/50 whitespace-pre-wrap font-sans leading-relaxed">{newContent}</pre>
              </div>
            </div>
          )}
          <label className="flex items-center gap-2.5 cursor-pointer select-none">
            <div
              onClick={() => setNewIsDefault(!newIsDefault)}
              className={`w-8 h-4 rounded-full transition-colors relative ${newIsDefault ? "bg-white" : "bg-black/[0.12] dark:bg-white/[0.12]"}`}
            >
              <div className={`absolute top-0.5 w-3 h-3 rounded-full transition-transform bg-black ${newIsDefault ? "translate-x-4" : "translate-x-0.5"}`} />
            </div>
            <span className="text-sm text-black/60 dark:text-white/50">Set as default signature</span>
          </label>
          <div className="flex items-center gap-3">
            <button
              onClick={createSignature}
              disabled={saving || !newName.trim() || !newContent.trim()}
              className="bg-white text-black text-sm font-medium px-4 py-2 rounded-lg hover:bg-white/90 transition-colors disabled:opacity-40"
            >
              {saving ? "Saving…" : "Save signature"}
            </button>
            <button onClick={() => setShowForm(false)} className="text-black/45 dark:text-white/35 text-sm hover:text-black/70 dark:hover:text-white/60 transition-colors">
              Cancel
            </button>
          </div>
        </div>
      )}

      {signatures.length === 0 ? (
        <div className="text-center py-16 text-black/35 dark:text-white/25 text-sm">No signatures yet.</div>
      ) : (
        <div className="space-y-3">
          {signatures.map((sig) => (
            <div key={sig.id} className="bg-black/[0.03] dark:bg-white/[0.03] border border-black/[0.08] dark:border-white/[0.07] rounded-xl overflow-hidden">
              {editingId === sig.id ? (
                <div className="p-5 space-y-4">
                  <input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="w-full bg-black/[0.02] dark:bg-white/[0.02] border border-black/[0.09] dark:border-white/[0.08] rounded-lg px-3 py-2 text-sm text-black/90 dark:text-white focus:outline-none focus:border-black/[0.22] dark:focus:border-white/[0.22]"
                  />
                  <textarea
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    rows={5}
                    className="w-full bg-black/[0.02] dark:bg-white/[0.02] border border-black/[0.09] dark:border-white/[0.08] rounded-lg px-3 py-2 text-sm text-black/90 dark:text-white font-mono focus:outline-none focus:border-black/[0.22] dark:focus:border-white/[0.22] resize-y"
                  />
                  {editContent && (
                    <div className="space-y-1">
                      <div className="text-xs font-semibold text-black/40 dark:text-white/30 uppercase tracking-widest">Preview</div>
                      <div className="bg-black/50 border border-black/[0.08] dark:border-white/[0.07] rounded-lg px-4 py-3">
                        <pre className="text-xs text-black/60 dark:text-white/50 whitespace-pre-wrap font-sans leading-relaxed">{editContent}</pre>
                      </div>
                    </div>
                  )}
                  <div className="flex items-center gap-3">
                    <button onClick={() => saveEdit(sig.id)} disabled={saving} className="bg-white text-black text-sm font-medium px-4 py-2 rounded-lg hover:bg-white/90 transition-colors disabled:opacity-40">
                      {saving ? "Saving…" : "Save"}
                    </button>
                    <button onClick={cancelEdit} className="text-black/45 dark:text-white/35 text-sm hover:text-black/70 dark:hover:text-white/60 transition-colors">Cancel</button>
                  </div>
                </div>
              ) : sig.isSystem ? (
                /* System / locked signature */
                <div className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-black/60 dark:text-white/50 text-sm">{sig.name}</span>
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-black/[0.04] dark:bg-white/[0.04] text-black/35 dark:text-white/25 border border-black/[0.09] dark:border-white/[0.08]">
                          Required
                        </span>
                        {sig.isDefault && (
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-400/15 text-emerald-400 border border-emerald-400/30">
                            Default
                          </span>
                        )}
                      </div>
                      <pre className="text-xs text-black/35 dark:text-white/25 whitespace-pre-wrap font-sans leading-relaxed mt-2 line-clamp-3">{sig.content}</pre>
                      <p className="text-[10px] text-black/30 dark:text-white/20 mt-1.5">This attribution is always included and cannot be removed.</p>
                    </div>
                  </div>
                </div>
              ) : (
                /* User signature */
                <div className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-black/90 dark:text-white text-sm">{sig.name}</span>
                        {sig.isDefault && (
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-400/15 text-emerald-400 border border-emerald-400/30">
                            Default
                          </span>
                        )}
                      </div>
                      <pre className="text-xs text-black/40 dark:text-white/30 whitespace-pre-wrap font-sans leading-relaxed mt-2 line-clamp-3">{sig.content}</pre>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {!sig.isDefault && (
                        <button onClick={() => setDefault(sig.id)} className="text-black/35 dark:text-white/25 hover:text-black/60 dark:hover:text-white/50 transition-colors text-xs">Set default</button>
                      )}
                      <button onClick={() => openEdit(sig)} className="text-black/35 dark:text-white/25 hover:text-black/90 dark:text-white transition-colors text-xs">Edit</button>
                      <button onClick={() => deleteSig(sig.id)} className="text-black/35 dark:text-white/25 hover:text-red-400 transition-colors text-xs">Delete</button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Archive tab ───────────────────────────────────────────────────────────────

interface ArchivedJob {
  id: number;
  contentType: string;
  topic: string;
  finalDraft: string;
  archivedAt: string;
  createdAt: string;
}

function timeAgoArchive(iso: string) {
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 60)         return `${secs}s ago`;
  if (secs < 3600)       return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400)      return `${Math.floor(secs / 3600)}h ago`;
  if (secs < 86400 * 30) return `${Math.floor(secs / 86400)}d ago`;
  return new Date(iso).toLocaleDateString();
}

function downloadTxtArchive(topic: string, draft: string) {
  const blob = new Blob([draft], { type: "text/plain" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = `${topic.slice(0, 60).replace(/[^a-z0-9]+/gi, "-")}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}

function ArchiveTab() {
  const [jobs,       setJobs]       = useState<ArchivedJob[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [copiedId,   setCopiedId]   = useState<number | null>(null);

  useEffect(() => {
    fetch("/api/ghostwriter?archived=true")
      .then((r) => r.json())
      .then((data) => { setJobs(data); setLoading(false); });
  }, []);

  async function unarchive(id: number) {
    await fetch(`/api/ghostwriter/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ archived: false }),
    });
    setJobs((prev) => prev.filter((j) => j.id !== id));
    if (expandedId === id) setExpandedId(null);
  }

  async function deleteJob(id: number) {
    await fetch(`/api/ghostwriter/${id}`, { method: "DELETE" });
    setJobs((prev) => prev.filter((j) => j.id !== id));
    if (expandedId === id) setExpandedId(null);
  }

  async function copyDraft(job: ArchivedJob) {
    await navigator.clipboard.writeText(job.finalDraft);
    setCopiedId(job.id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  if (loading) {
    return (
      <div className="flex items-center gap-3 py-20 text-black/40 dark:text-white/30 text-sm">
        <span className="w-1.5 h-1.5 bg-black/30 dark:bg-white/30 rounded-full animate-pulse" />
        Loading…
      </div>
    );
  }

  if (jobs.length === 0) {
    return (
      <div className="bg-black/[0.02] dark:bg-white/[0.02] border border-black/[0.07] dark:border-white/[0.06] rounded-xl p-12 text-center">
        <p className="text-black/40 dark:text-white/30 text-sm">No archived drafts yet.</p>
        <p className="text-black/35 dark:text-white/25 text-xs mt-1">
          Finished drafts can be archived from the Ghostwriter tab.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {jobs.map((job) => {
        const isExpanded = expandedId === job.id;
        return (
          <div key={job.id} className="bg-black/[0.03] dark:bg-white/[0.03] border border-black/[0.08] dark:border-white/[0.07] rounded-xl overflow-hidden">
            <div className="px-5 py-4 flex items-start justify-between gap-4">
              <div className="min-w-0 space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[11px] font-medium text-black/40 dark:text-white/30 bg-black/[0.04] dark:bg-white/[0.04] rounded px-1.5 py-0.5">
                    {CONTENT_TYPE_LABELS[job.contentType] ?? job.contentType}
                  </span>
                  <span className="text-[11px] text-black/35 dark:text-white/25">
                    Archived {timeAgoArchive(job.archivedAt)}
                  </span>
                </div>
                <p className="text-sm font-medium text-black/90 dark:text-white truncate">{job.topic}</p>
                <p className="text-[11px] text-black/35 dark:text-white/25">Created {timeAgoArchive(job.createdAt)}</p>
              </div>

              <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                <button
                  onClick={() => setExpandedId(isExpanded ? null : job.id)}
                  className="text-xs text-black/90 dark:text-white border border-black/[0.12] dark:border-white/[0.1] rounded-md px-3 py-1.5 hover:border-black/[0.2] dark:hover:border-white/[0.2] transition-colors"
                >
                  {isExpanded ? "Hide" : "View"}
                </button>
                <button
                  onClick={() => copyDraft(job)}
                  className="text-xs text-black/45 dark:text-white/35 hover:text-black/90 dark:text-white border border-black/[0.12] dark:border-white/[0.1] rounded-md px-3 py-1.5 transition-colors"
                >
                  {copiedId === job.id ? "Copied!" : "Copy"}
                </button>
                <button
                  onClick={() => downloadTxtArchive(job.topic, job.finalDraft)}
                  className="text-xs text-black/45 dark:text-white/35 hover:text-black/90 dark:text-white border border-black/[0.12] dark:border-white/[0.1] rounded-md px-3 py-1.5 transition-colors"
                >
                  TXT
                </button>
                <button
                  onClick={() => unarchive(job.id)}
                  className="text-xs text-black/40 dark:text-white/30 hover:text-black/90 dark:text-white border border-black/[0.09] dark:border-white/[0.08] hover:border-black/[0.2] dark:hover:border-white/[0.2] rounded-md px-3 py-1.5 transition-colors"
                >
                  Restore
                </button>
                <button
                  onClick={() => deleteJob(job.id)}
                  className="text-black/35 dark:text-white/25 hover:text-red-400 transition-colors text-xs"
                >
                  Delete
                </button>
              </div>
            </div>

            {isExpanded && (
              <div className="border-t border-black/[0.07] dark:border-white/[0.06] px-5 py-5">
                <pre className="text-sm text-black/75 dark:text-white/70 whitespace-pre-wrap font-sans leading-relaxed">
                  {job.finalDraft}
                </pre>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
