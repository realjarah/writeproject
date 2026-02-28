"use client";

import { useState, useEffect, useCallback } from "react";
import { detectCategory, type SampleCategory } from "@/lib/detectCategory";
import ReadinessBar from "@/components/ReadinessBar";
import { CONTENT_TYPE_GROUPS, CONTENT_TYPE_LABELS } from "@/lib/content-types";

// Color per group — used in sample list badges and the mastery grid
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

function masteryPct(words: number, count: number): number {
  if (count === 0) return 0;
  const w =
    words >= 2000 ? 60 :
    words >= 1000 ? 45 + Math.floor(((words - 1000) / 1000) * 15) :
    words >= 400  ? 25 + Math.floor(((words - 400)  / 600)  * 20) :
    words >= 100  ? 10 + Math.floor(((words - 100)  / 300)  * 15) : 5;
  const c = count >= 5 ? 40 : count >= 3 ? 30 : count >= 2 ? 20 : 10;
  return Math.min(100, w + c);
}

function masteryColor(pct: number): string {
  if (pct >= 80) return "#34d399";
  if (pct >= 60) return "#86efac";
  if (pct >= 40) return "#facc15";
  if (pct >= 20) return "#fb923c";
  if (pct > 0)   return "#f87171";
  return "#2a2a2a";
}

interface Sample {
  id: number;
  title: string;
  content: string;
  wordCount: number;
  category: string;
  createdAt: string;
}

interface PendingSample {
  tempId: string;
  title: string;
  status: "processing" | "error";
  error?: string;
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

export default function VoicePage() {
  const [samples, setSamples] = useState<Sample[]>([]);
  const [pendingSamples, setPendingSamples] = useState<PendingSample[]>([]);
  const [profile, setProfile] = useState<VoiceProfile | null>(null);

  // Form state
  const [title, setTitle]         = useState("");
  const [content, setContent]     = useState("");
  const [category, setCategory]   = useState<SampleCategory>("blog");
  const [autoDetected, setAutoDetected] = useState(true);
  const [adding, setAdding]       = useState(false);
  const [showForm, setShowForm]   = useState(false);
  const [fileError, setFileError] = useState("");

  // Input mode: paste text | import from URL | upload file
  const [inputMode, setInputMode] = useState<"paste" | "url" | "file">("paste");
  const [urlInput, setUrlInput]   = useState("");
  const [fetching, setFetching]   = useState(false);
  const [fetchError, setFetchError] = useState("");

  // Analyze state
  const [analyzing, setAnalyzing]     = useState(false);
  const [analyzeError, setAnalyzeError] = useState("");

  // Profile expand
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

  async function saveDirect(text: string, sampleTitle: string, sampleCategory: SampleCategory) {
    await fetch("/api/voice", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: sampleTitle, content: text, category: sampleCategory }),
    });
    resetForm();
    load();
  }

  // Client-side size limits (match server: 30MB b64 ≈ 22MB binary PDF, 20MB b64 ≈ 15MB binary DOCX)
  const MAX_PDF_SIZE = 22 * 1024 * 1024;
  const MAX_DOCX_SIZE = 15 * 1024 * 1024;
  const MAX_TEXT_SIZE = 500 * 1024; // 500KB for plain text

  function handleFile(file: File) {
    setFileError("");
    const inferredTitle = file.name.replace(/\.[^.]+$/, "").replace(/[-_]/g, " ");

    const isPdf  = file.type === "application/pdf" || file.name.endsWith(".pdf");
    const isDocx = file.name.endsWith(".docx") ||
      file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

    // Validate file size before reading into memory
    if (isPdf && file.size > MAX_PDF_SIZE) {
      setFileError("PDF too large (max 22MB).");
      return;
    }
    if (isDocx && file.size > MAX_DOCX_SIZE) {
      setFileError("DOCX too large (max 15MB).");
      return;
    }
    if (!isPdf && !isDocx && file.size > MAX_TEXT_SIZE) {
      setFileError("Text file too large (max 500KB).");
      return;
    }

    if (!isPdf && !isDocx) {
      // Plain text — instant, no API call
      const reader = new FileReader();
      reader.onload = async (e) => {
        const text = (e.target?.result as string) || "";
        if (!text.trim()) return;
        const cat = detectCategory(text);
        await saveDirect(text, inferredTitle, cat);
      };
      reader.readAsText(file);
      return;
    }

    // PDF or DOCX — add pending card immediately, close form, process in background
    const tempId   = Math.random().toString(36).slice(2);
    const endpoint = isPdf ? "/api/voice/import-pdf" : "/api/voice/import-docx";
    setPendingSamples((prev) => [...prev, { tempId, title: inferredTitle, status: "processing" }]);
    resetForm();

    const reader = new FileReader();
    reader.onload = async (e) => {
      const dataUrl = e.target?.result as string;
      const [, base64] = dataUrl.split(",");
      try {
        const res  = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ data: base64, fileName: file.name }),
        });
        const data = await res.json();
        if (!res.ok || data.error) {
          setPendingSamples((prev) =>
            prev.map((p) => p.tempId === tempId ? { ...p, status: "error", error: data.error || "Extraction failed." } : p)
          );
        } else {
          const cat = detectCategory(data.text);
          await fetch("/api/voice", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ title: inferredTitle, content: data.text, category: cat }),
          });
          setPendingSamples((prev) => prev.filter((p) => p.tempId !== tempId));
          load();
        }
      } catch {
        setPendingSamples((prev) =>
          prev.map((p) => p.tempId === tempId ? { ...p, status: "error", error: "Extraction failed. Try again." } : p)
        );
      }
    };
    reader.readAsDataURL(file);
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
        const cat = detectCategory(data.text);
        await saveDirect(data.text, data.title || urlInput.trim(), cat);
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

  // Per-type stats derived from samples
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

      {/* ── Header ───────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-black/90 dark:text-white">My Voice</h1>
          <p className="text-black/[0.40] dark:text-white/[0.40] text-sm mt-1">
            Add samples of your real writing — the ghost learns your style per format.
          </p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="bg-black/[0.88] text-white dark:bg-white dark:text-black text-sm font-medium px-4 py-2 rounded-lg hover:bg-black/75 dark:hover:bg-white/90 transition-colors"
        >
          + Add sample
        </button>
      </div>

      {/* ── Readiness bar ────────────────────────────────────────────── */}
      {samples.length > 0 && (
        <ReadinessBar
          totalWords={totalWords}
          sampleCount={samples.length}
          categoryCount={categoryCount}
        />
      )}

      {/* ── Add sample form ──────────────────────────────────────────── */}
      {showForm && (
        <div className="bg-black/[0.04] dark:bg-[#161616] border border-black/[0.10] dark:border-[#2a2a2a] rounded-xl p-5 space-y-4">
          <h2 className="font-medium text-black/90 dark:text-white">New Writing Sample</h2>

          {/* Input mode tabs */}
          <div className="flex gap-1 border-b border-black/[0.10] dark:border-[#2a2a2a] pb-1">
            {(["paste", "url", "file"] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => { setInputMode(mode); setFetchError(""); setFileError(""); }}
                className="text-[11px] px-3 py-1 rounded-t transition-colors"
                style={
                  inputMode === mode
                    ? { color: "#fff", background: "#2a2a2a" }
                    : { color: "#555" }
                }
              >
                {mode === "paste" ? "Paste text" : mode === "url" ? "Import from URL" : "Upload file"}
              </button>
            ))}
          </div>

          {/* URL import mode — fetch + save in one click */}
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
                  className="flex-1 bg-black/[0.04] dark:bg-[#111] border border-black/[0.10] dark:border-[#2a2a2a] rounded-lg px-3 py-2 text-sm text-black/90 dark:text-white placeholder-black/[0.30] dark:placeholder-white/[0.30] focus:outline-none focus:border-black/[0.22] dark:focus:border-white/[0.22]"
                />
                <button
                  onClick={handleUrl}
                  disabled={fetching || !urlInput.trim()}
                  className="bg-black/[0.88] text-white dark:bg-white dark:text-black text-sm font-medium px-4 py-2 rounded-lg hover:bg-black/75 dark:hover:bg-white/90 transition-colors disabled:opacity-40 whitespace-nowrap"
                >
                  {fetching ? "Importing…" : "Import"}
                </button>
              </div>
              {fetchError && <p className="text-[11px] text-red-400">{fetchError}</p>}
              <p className="text-[11px] text-black/[0.28] dark:text-white/[0.28]">
                Any published writing — blog posts, articles, newsletters, LinkedIn posts, etc.
              </p>
              <button onClick={resetForm} className="text-black/[0.40] dark:text-white/[0.40] text-sm hover:text-black/60 dark:hover:text-black/[0.60] dark:text-[#999] transition-colors">
                Cancel
              </button>
            </div>
          )}

          {/* File upload mode — select + save immediately */}
          {inputMode === "file" && (
            <div className="space-y-2">
              <label
                className="flex flex-col items-center justify-center gap-2 border border-dashed border-black/[0.10] dark:border-[#2a2a2a] rounded-lg p-8 cursor-pointer hover:border-black/[0.17] dark:hover:border-white/[0.17] transition-colors"
              >
                <span className="text-black/[0.35] dark:text-white/[0.35] text-sm">
                  Click to upload or drag a file here
                </span>
                <span className="text-[11px] text-black/[0.28] dark:text-white/[0.28]">.txt · .md · .pdf · .docx</span>
                <input
                  type="file"
                  accept=".txt,.md,.markdown,.text,.pdf,.docx"
                  className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }}
                />
              </label>
              {fileError && <p className="text-[11px] text-red-400">{fileError}</p>}
              <button onClick={resetForm} className="text-black/[0.40] dark:text-white/[0.40] text-sm hover:text-black/60 dark:hover:text-black/[0.60] dark:text-[#999] transition-colors">
                Cancel
              </button>
            </div>
          )}

          {/* Paste mode — manual form with title, textarea, category picker */}
          {inputMode === "paste" && (
          <><input
            type="text"
            placeholder="Title (optional)"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full bg-black/[0.04] dark:bg-[#111] border border-black/[0.10] dark:border-[#2a2a2a] rounded-lg px-3 py-2 text-sm text-black/90 dark:text-white placeholder-black/[0.30] dark:placeholder-white/[0.30] focus:outline-none focus:border-black/[0.22] dark:focus:border-white/[0.22]"
          />
          <textarea
            placeholder="Paste your writing here — blog posts, emails, essays, tweets, anything you've actually written…"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={10}
            className="w-full bg-black/[0.04] dark:bg-[#111] border border-black/[0.10] dark:border-[#2a2a2a] rounded-lg px-3 py-2 text-sm text-black/90 dark:text-white placeholder-black/[0.30] dark:placeholder-white/[0.30] focus:outline-none focus:border-black/[0.22] dark:focus:border-white/[0.22] resize-y"
          />

          {/* Category picker — grouped, aligned with content types */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-black/[0.35] dark:text-white/[0.35] uppercase tracking-widest">
                Writing type
              </span>
              {content.trim().length > 20 && autoDetected && (
                <span className="text-[10px] text-black/[0.35] dark:text-white/[0.35] bg-black/[0.04] dark:bg-[#111] border border-black/[0.10] dark:border-[#2a2a2a] rounded px-1.5 py-0.5">
                  auto-detected
                </span>
              )}
            </div>
            <div className="space-y-2">
              {CONTENT_TYPE_GROUPS.map((group) => (
                <div key={group.label}>
                  <div className="text-[10px] text-black/[0.28] dark:text-white/[0.28] uppercase tracking-wider mb-1.5">
                    {group.label}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {group.types.map((type) => (
                      <button
                        key={type}
                        onClick={() => { setCategory(type as SampleCategory); setAutoDetected(false); }}
                        className="px-2.5 py-1 rounded-md text-[11px] font-medium border transition-all"
                        style={
                          category === type
                            ? { backgroundColor: groupColor(type) + "22", borderColor: groupColor(type), color: groupColor(type) }
                            : { backgroundColor: "transparent", borderColor: "#2a2a2a", color: "#555" }
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
              className="bg-black/[0.88] text-white dark:bg-white dark:text-black text-sm font-medium px-4 py-2 rounded-lg hover:bg-black/75 dark:hover:bg-white/90 transition-colors disabled:opacity-40"
            >
              {adding ? "Saving…" : "Save sample"}
            </button>
            <button onClick={resetForm} className="text-black/[0.40] dark:text-white/[0.40] text-sm hover:text-black/60 dark:hover:text-black/[0.60] dark:text-[#999] transition-colors">
              Cancel
            </button>
          </div>
          </>)}
        </div>
      )}

      {/* ── Analyze bar ──────────────────────────────────────────────── */}
      {samples.length > 0 && (
        <div className="bg-black/[0.04] dark:bg-[#161616] border border-black/[0.09] dark:border-white/[0.07] rounded-xl p-5 flex items-center justify-between">
          <div className="space-y-0.5">
            <div className="text-sm text-black/90 dark:text-white font-medium">
              {samples.length} sample{samples.length !== 1 ? "s" : ""} · {totalWords.toLocaleString()} words
            </div>
            <div className="text-xs text-black/[0.35] dark:text-white/[0.35]">
              {samples.length < 3
                ? `Add ${3 - samples.length} more to improve the analysis`
                : profile
                ? "Re-analyze to update the ghost with your latest samples"
                : "Ready to analyze — this trains the ghost on your voice"}
            </div>
          </div>
          <div className="flex flex-col items-end gap-2">
            <button
              onClick={analyzeVoice}
              disabled={analyzing}
              className="bg-black/[0.88] text-white dark:bg-white dark:text-black text-sm font-medium px-4 py-2 rounded-lg hover:bg-black/75 dark:hover:bg-white/90 transition-colors disabled:opacity-40"
            >
              {analyzing ? "Analyzing…" : profile ? "Re-analyze" : "Analyze voice"}
            </button>
            {analyzeError && <p className="text-xs text-red-400">{analyzeError}</p>}
          </div>
        </div>
      )}

      {/* ── Per-type mastery grid ─────────────────────────────────────── */}
      {samples.length > 0 && (
        <div className="space-y-5">
          <div>
            <h2 className="text-sm font-semibold text-black/90 dark:text-white">Ghost training by format</h2>
            <p className="text-xs text-black/[0.35] dark:text-white/[0.35] mt-0.5">
              How much of your writing the ghost has seen per format. Add samples to level up each type.
            </p>
          </div>
          {CONTENT_TYPE_GROUPS.map((group) => (
            <div key={group.label} className="space-y-2">
              <div
                className="text-[10px] font-bold uppercase tracking-widest"
                style={{ color: GROUP_COLORS[group.label] + "99" }}
              >
                {group.label}
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {group.types.map((type) => {
                  const stat  = typeStats[type] ?? { count: 0, words: 0 };
                  const pct   = masteryPct(stat.words, stat.count);
                  const color = masteryColor(pct);
                  return (
                    <div
                      key={type}
                      className="bg-black/[0.04] dark:bg-[#161616] border border-black/[0.06] dark:border-white/[0.05] rounded-xl p-3 space-y-2"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-medium text-black/90 dark:text-white truncate">
                          {CONTENT_TYPE_LABELS[type]}
                        </span>
                        <span
                          className="text-[10px] font-bold shrink-0 ml-1"
                          style={{ color: pct > 0 ? color : "#444" }}
                        >
                          {pct > 0 ? `${pct}%` : "—"}
                        </span>
                      </div>
                      <div className="h-1 w-full bg-black/[0.08] dark:bg-[#2a2a2a] rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{ width: `${pct}%`, backgroundColor: color }}
                        />
                      </div>
                      <div className="text-[10px] text-black/[0.28] dark:text-white/[0.28]">
                        {stat.count > 0
                          ? `${stat.count} sample${stat.count !== 1 ? "s" : ""} · ${stat.words.toLocaleString()} words`
                          : "No samples yet"}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Voice profile summary (collapsed by default) ──────────────── */}
      {profile && (
        <div className="bg-black/[0.04] dark:bg-[#111] border border-black/[0.06] dark:border-white/[0.05] rounded-xl overflow-hidden">
          <button
            onClick={() => setExpandedProfile(!expandedProfile)}
            className="w-full flex items-center justify-between px-5 py-4 hover:bg-black/[0.04] hover:dark:bg-[#161616] transition-colors"
          >
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-emerald-400" />
              <span className="font-medium text-black/90 dark:text-white text-sm">Voice analyzed</span>
              <span className="text-black/[0.28] dark:text-white/[0.28] text-xs">
                {new Date(profile.updatedAt).toLocaleDateString()}
              </span>
            </div>
            <span className="text-black/[0.35] dark:text-white/[0.35] text-xs">
              {expandedProfile ? "Hide" : "View details"}
            </span>
          </button>
          {expandedProfile && (
            <div className="px-5 pb-5 space-y-4 border-t border-black/[0.06] dark:border-white/[0.05] pt-4">
              <p className="text-sm text-black/[0.68] dark:text-white/[0.68] italic">
                &ldquo;{profile.analysis.rawSummary}&rdquo;
              </p>
              <div className="grid grid-cols-2 gap-3">
                {[
                  ["Tone",        profile.analysis.tone],
                  ["Sentences",   profile.analysis.sentenceStructure],
                  ["Vocabulary",  profile.analysis.vocabularyStyle],
                  ["Punctuation", profile.analysis.punctuationHabits],
                ].map(([label, val]) => (
                  <div key={label} className="space-y-0.5">
                    <div className="text-[10px] font-semibold text-black/[0.35] dark:text-white/[0.35] uppercase tracking-widest">
                      {label}
                    </div>
                    <div className="text-xs text-black/[0.55] dark:text-white/[0.55]">{val}</div>
                  </div>
                ))}
              </div>
              {profile.analysis.thingsToAvoid?.length > 0 && (
                <div className="space-y-1.5">
                  <div className="text-[10px] font-semibold text-black/[0.35] dark:text-white/[0.35] uppercase tracking-widest">
                    Never do
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {profile.analysis.thingsToAvoid.map((t, i) => (
                      <span
                        key={i}
                        className="text-[10px] bg-black/[0.06] dark:bg-[#1a1a1a] border border-black/[0.10] dark:border-[#2a2a2a] rounded px-2 py-0.5 text-black/[0.40] dark:text-white/[0.40]"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Sample list ──────────────────────────────────────────────── */}
      {samples.length === 0 && pendingSamples.length === 0 ? (
        <div className="text-center py-16 text-black/[0.28] dark:text-white/[0.28] text-sm">
          No samples yet. Add some of your writing to get started.
        </div>
      ) : (
        <div className="space-y-3">
          {/* Pending (processing/failed) uploads */}
          {pendingSamples.map((p) => (
            <div
              key={p.tempId}
              className="bg-black/[0.04] dark:bg-[#161616] border border-black/[0.09] dark:border-white/[0.07] rounded-xl p-4 flex items-start justify-between gap-4"
            >
              <div className="space-y-1.5 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-black/90 dark:text-white text-sm">{p.title}</span>
                  {p.status === "processing" ? (
                    <span className="text-[10px] animate-pulse text-black/[0.40] dark:text-white/[0.40] bg-black/[0.04] dark:bg-[#222] border border-black/[0.08] dark:border-[#333] rounded px-1.5 py-0.5">
                      Extracting…
                    </span>
                  ) : (
                    <span className="text-[10px] text-red-400">{p.error}</span>
                  )}
                </div>
                <div className="text-xs text-black/[0.28] dark:text-white/[0.28]">
                  {p.status === "processing" ? "Reading file — this may take a moment" : "Failed to process file"}
                </div>
              </div>
              {p.status === "error" && (
                <button
                  onClick={() => setPendingSamples((prev) => prev.filter((x) => x.tempId !== p.tempId))}
                  className="text-black/[0.28] dark:text-white/[0.28] hover:text-red-500 dark:hover:text-red-400 transition-colors text-xs shrink-0 mt-0.5"
                >
                  Dismiss
                </button>
              )}
            </div>
          ))}
          {samples.map((s) => {
            const color = groupColor(s.category);
            const label = CONTENT_TYPE_LABELS[s.category] ?? s.category;
            return (
              <div
                key={s.id}
                className="bg-black/[0.04] dark:bg-[#161616] border border-black/[0.09] dark:border-white/[0.07] rounded-xl p-4 flex items-start justify-between gap-4"
              >
                <div className="space-y-1.5 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-black/90 dark:text-white text-sm">{s.title}</span>
                    <span
                      className="text-[10px] font-semibold px-2 py-0.5 rounded-full border"
                      style={{ color, borderColor: color + "55", backgroundColor: color + "15" }}
                    >
                      {label}
                    </span>
                  </div>
                  <div className="text-xs text-black/[0.35] dark:text-white/[0.35]">
                    {s.wordCount} words · {new Date(s.createdAt).toLocaleDateString()}
                  </div>
                  <p className="text-xs text-black/[0.40] dark:text-white/[0.40] line-clamp-2">{s.content}</p>
                </div>
                <button
                  onClick={() => deleteSample(s.id)}
                  className="text-black/[0.28] dark:text-white/[0.28] hover:text-red-500 dark:hover:text-red-400 transition-colors text-xs shrink-0 mt-0.5"
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
