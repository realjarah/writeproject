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

function masteryPct(words: number, count: number): number {
  if (count === 0) return 0;
  const w =
    words >= 2000 ? 60 :
    words >= 1000 ? 45 + Math.floor(((words - 1000) / 1000) * 15) :
    words >= 400  ? 25 + Math.floor(((words - 400) / 600) * 20) :
    words >= 100  ? 10 + Math.floor(((words - 100) / 300) * 15) : 5;
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
  createdAt: string;
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ProfilePage() {
  // Read initial tab from URL search param (client-side only)
  const [activeTab, setActiveTab] = useState<"train" | "signatures">("train");

  useEffect(() => {
    if (typeof window !== "undefined") {
      const p = new URLSearchParams(window.location.search);
      if (p.get("tab") === "signatures") setActiveTab("signatures");
    }
  }, []);

  return (
    <div className="space-y-6">
      {/* Tab bar */}
      <div className="flex gap-1 border-b border-[#222] pb-0">
        {(["train", "signatures"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
              activeTab === tab
                ? "text-white border-white"
                : "text-[#555] border-transparent hover:text-[#888]"
            }`}
          >
            {tab === "train" ? "My Voice" : "Signatures"}
          </button>
        ))}
      </div>

      {activeTab === "train" && <TrainTab />}
      {activeTab === "signatures" && <SignaturesTab />}
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
          <h1 className="text-2xl font-bold text-white">My Voice</h1>
          <p className="text-[#666] text-sm mt-1">
            Paste your actual writing — the more you add, the more accurate the ghost.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {analyzing && (
            <span className="flex items-center gap-1.5 text-xs text-[#555]">
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
              className="bg-white text-black text-sm font-medium px-4 py-2 rounded-lg hover:bg-[#e8e8e8] transition-colors"
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
        <div className="bg-[#161616] border border-[#2a2a2a] rounded-xl p-5 space-y-4">
          <h2 className="font-medium text-white">New Writing Sample</h2>

          {/* Input mode tabs */}
          <div className="flex gap-1 border-b border-[#2a2a2a] pb-1">
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
                  className="flex-1 bg-[#111] border border-[#2a2a2a] rounded-lg px-3 py-2 text-sm text-white placeholder-[#555] focus:outline-none focus:border-[#444]"
                />
                <button
                  onClick={handleUrl}
                  disabled={fetching || !urlInput.trim()}
                  className="bg-white text-black text-sm font-medium px-4 py-2 rounded-lg hover:bg-[#e8e8e8] transition-colors disabled:opacity-40 whitespace-nowrap"
                >
                  {fetching ? "Importing…" : "Import"}
                </button>
              </div>
              {fetchError && <p className="text-[11px] text-red-400">{fetchError}</p>}
              <p className="text-[11px] text-[#444]">Any published writing — blog posts, articles, newsletters, etc.</p>
              <button onClick={resetForm} className="text-[#666] text-sm hover:text-[#999] transition-colors">Cancel</button>
            </div>
          )}

          {/* File upload */}
          {inputMode === "file" && (
            <div className="space-y-2">
              <label
                className="flex flex-col items-center justify-center gap-2 border border-dashed border-[#2a2a2a] rounded-lg p-8 cursor-pointer hover:border-[#444] transition-colors"
                style={fetching ? { opacity: 0.5, pointerEvents: "none" } : {}}
              >
                <span className="text-[#555] text-sm">{fetching ? "Saving…" : "Click to upload or drag a file here"}</span>
                <span className="text-[11px] text-[#444]">.txt · .md · .pdf</span>
                <input
                  type="file"
                  accept=".txt,.md,.markdown,.text,.pdf"
                  className="hidden"
                  disabled={fetching}
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }}
                />
              </label>
              {fileError && <p className="text-[11px] text-red-400">{fileError}</p>}
              <button onClick={resetForm} className="text-[#666] text-sm hover:text-[#999] transition-colors">Cancel</button>
            </div>
          )}

          {/* Paste mode */}
          {inputMode === "paste" && (<>
            <input
              type="text"
              placeholder="Title (optional)"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full bg-[#111] border border-[#2a2a2a] rounded-lg px-3 py-2 text-sm text-white placeholder-[#555] focus:outline-none focus:border-[#444]"
            />
            <textarea
              placeholder="Paste your writing here — blog posts, emails, essays, tweets, anything you've actually written…"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={10}
              className="w-full bg-[#111] border border-[#2a2a2a] rounded-lg px-3 py-2 text-sm text-white placeholder-[#555] focus:outline-none focus:border-[#444] resize-y"
            />

            {/* Category picker */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-[#555] uppercase tracking-widest">Writing type</span>
                {content.trim().length > 20 && autoDetected && (
                  <span className="text-[10px] text-[#555] bg-[#111] border border-[#2a2a2a] rounded px-1.5 py-0.5">auto-detected</span>
                )}
              </div>
              <div className="space-y-2">
                {CONTENT_TYPE_GROUPS.map((group) => (
                  <div key={group.label}>
                    <div className="text-[10px] text-[#444] uppercase tracking-wider mb-1.5">{group.label}</div>
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
                className="bg-white text-black text-sm font-medium px-4 py-2 rounded-lg hover:bg-[#e8e8e8] transition-colors disabled:opacity-40"
              >
                {adding ? "Saving…" : "Save sample"}
              </button>
              <button onClick={resetForm} className="text-[#666] text-sm hover:text-[#999] transition-colors">Cancel</button>
            </div>
          </>)}
        </div>
      )}

      {/* Voice profile */}
      {profile && (
        <div className="bg-[#161616] border border-[#222] rounded-xl overflow-hidden">
          <button
            onClick={() => setExpandedProfile((v) => !v)}
            className="w-full flex items-center justify-between px-5 py-4 hover:bg-[#1a1a1a] transition-colors text-left"
          >
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-emerald-400" />
                <span className="text-sm font-medium text-white">Voice profile</span>
              </div>
              <p className="text-xs text-[#555] pl-4">Updated {new Date(profile.updatedAt).toLocaleDateString()}</p>
            </div>
            <svg
              className={`w-4 h-4 text-[#444] transition-transform ${expandedProfile ? "rotate-180" : ""}`}
              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {expandedProfile && (
            <div className="border-t border-[#1e1e1e] px-5 py-4 space-y-4">
              <p className="text-sm text-[#888] leading-relaxed">{profile.analysis.rawSummary}</p>
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
                    <div className="text-[10px] font-semibold text-[#444] uppercase tracking-widest">{label}</div>
                    <p className="text-xs text-[#666] leading-relaxed">{value}</p>
                  </div>
                ))}
              </div>
              {profile.analysis.thingsToAvoid?.length > 0 && (
                <div className="space-y-2">
                  <div className="text-[10px] font-semibold text-[#444] uppercase tracking-widest">Things to avoid</div>
                  <div className="flex flex-wrap gap-1.5">
                    {profile.analysis.thingsToAvoid.map((t, i) => (
                      <span key={i} className="text-[11px] text-[#555] bg-[#111] border border-[#222] rounded-full px-2.5 py-0.5">{t}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Per-type mastery */}
      {samples.length > 0 && (
        <div className="space-y-5">
          <div>
            <h2 className="text-sm font-semibold text-white">Ghost training by format</h2>
            <p className="text-xs text-[#555] mt-0.5">
              How much of your writing the ghost has seen per format.
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
              {group.types.map((type) => {
                const stats = typeStats[type] ?? { count: 0, words: 0 };
                const pct = masteryPct(stats.words, stats.count);
                const color = masteryColor(pct);
                return (
                  <div key={type} className="flex items-center gap-3">
                    <span className="text-[11px] text-[#555] w-28 shrink-0">{CONTENT_TYPE_LABELS[type]}</span>
                    <div className="flex-1 h-1 bg-[#1e1e1e] rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${pct}%`, backgroundColor: color }}
                      />
                    </div>
                    <span className="text-[10px] w-8 text-right shrink-0" style={{ color }}>
                      {pct > 0 ? `${pct}%` : "—"}
                    </span>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}

      {/* Sample list */}
      {samples.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-white">Samples ({samples.length})</h2>
          {samples.map((s) => (
            <div key={s.id} className="flex items-center justify-between gap-3 py-2.5 border-b border-[#1a1a1a]">
              <div className="min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span
                    className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                    style={{ color: groupColor(s.category), backgroundColor: groupColor(s.category) + "22" }}
                  >
                    {CONTENT_TYPE_LABELS[s.category] ?? s.category}
                  </span>
                  <span className="text-xs text-[#555]">{s.wordCount.toLocaleString()} words</span>
                </div>
                <p className="text-sm text-[#888] truncate">{s.title || "Untitled"}</p>
              </div>
              <button
                onClick={() => deleteSample(s.id)}
                className="text-[#333] hover:text-red-400 transition-colors text-xs shrink-0"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}

      {samples.length === 0 && !showForm && (
        <div className="text-center py-16 text-[#444] text-sm">
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
          <h1 className="text-2xl font-bold text-white">Signatures</h1>
          <p className="text-[#666] text-sm mt-1">
            Custom footers appended to your generated content — links, credits, CTAs.
          </p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="bg-white text-black text-sm font-medium px-4 py-2 rounded-lg hover:bg-[#e8e8e8] transition-colors"
        >
          + New signature
        </button>
      </div>

      <div className="bg-[#111] border border-[#1e1e1e] rounded-xl px-5 py-4 flex items-start gap-3">
        <div className="w-1.5 h-1.5 rounded-full bg-[#555] shrink-0 mt-1.5" />
        <p className="text-xs text-[#555] leading-relaxed">
          All content generated on the free tier includes a{" "}
          <span className="text-[#888]">&ldquo;Written by me, powered by Ghostwrite&rdquo;</span>{" "}
          attribution by default. Customise the text or add your own signatures on top.
        </p>
      </div>

      {showForm && (
        <div className="bg-[#161616] border border-[#2a2a2a] rounded-xl p-5 space-y-4">
          <h2 className="font-medium text-white">New Signature</h2>
          <input
            type="text"
            placeholder="Name (e.g. Newsletter footer)"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="w-full bg-[#111] border border-[#2a2a2a] rounded-lg px-3 py-2 text-sm text-white placeholder-[#555] focus:outline-none focus:border-[#444]"
          />
          <div className="space-y-1.5">
            <label className="text-xs text-[#555]">Content — plain text, links, emoji are all fine</label>
            <textarea
              placeholder={"---\n\nFollow me on Twitter: @yourhandle\nBuilding in public at yoursite.com"}
              value={newContent}
              onChange={(e) => setNewContent(e.target.value)}
              rows={5}
              className="w-full bg-[#111] border border-[#2a2a2a] rounded-lg px-3 py-2 text-sm text-white placeholder-[#555] font-mono focus:outline-none focus:border-[#444] resize-y"
            />
          </div>
          {newContent && (
            <div className="space-y-1">
              <div className="text-xs font-semibold text-[#555] uppercase tracking-widest">Preview</div>
              <div className="bg-[#0f0f0f] border border-[#222] rounded-lg px-4 py-3">
                <pre className="text-xs text-[#888] whitespace-pre-wrap font-sans leading-relaxed">{newContent}</pre>
              </div>
            </div>
          )}
          <label className="flex items-center gap-2.5 cursor-pointer select-none">
            <div
              onClick={() => setNewIsDefault(!newIsDefault)}
              className={`w-8 h-4 rounded-full transition-colors relative ${newIsDefault ? "bg-white" : "bg-[#333]"}`}
            >
              <div className={`absolute top-0.5 w-3 h-3 rounded-full transition-transform bg-black ${newIsDefault ? "translate-x-4" : "translate-x-0.5"}`} />
            </div>
            <span className="text-sm text-[#888]">Set as default signature</span>
          </label>
          <div className="flex items-center gap-3">
            <button
              onClick={createSignature}
              disabled={saving || !newName.trim() || !newContent.trim()}
              className="bg-white text-black text-sm font-medium px-4 py-2 rounded-lg hover:bg-[#e8e8e8] transition-colors disabled:opacity-40"
            >
              {saving ? "Saving…" : "Save signature"}
            </button>
            <button onClick={() => setShowForm(false)} className="text-[#666] text-sm hover:text-[#999] transition-colors">
              Cancel
            </button>
          </div>
        </div>
      )}

      {signatures.length === 0 ? (
        <div className="text-center py-16 text-[#444] text-sm">No signatures yet.</div>
      ) : (
        <div className="space-y-3">
          {signatures.map((sig) => (
            <div key={sig.id} className="bg-[#161616] border border-[#222] rounded-xl overflow-hidden">
              {editingId === sig.id ? (
                <div className="p-5 space-y-4">
                  <input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="w-full bg-[#111] border border-[#2a2a2a] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#444]"
                  />
                  <textarea
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    rows={5}
                    className="w-full bg-[#111] border border-[#2a2a2a] rounded-lg px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-[#444] resize-y"
                  />
                  {editContent && (
                    <div className="space-y-1">
                      <div className="text-xs font-semibold text-[#555] uppercase tracking-widest">Preview</div>
                      <div className="bg-[#0f0f0f] border border-[#222] rounded-lg px-4 py-3">
                        <pre className="text-xs text-[#888] whitespace-pre-wrap font-sans leading-relaxed">{editContent}</pre>
                      </div>
                    </div>
                  )}
                  <div className="flex items-center gap-3">
                    <button onClick={() => saveEdit(sig.id)} disabled={saving} className="bg-white text-black text-sm font-medium px-4 py-2 rounded-lg hover:bg-[#e8e8e8] transition-colors disabled:opacity-40">
                      {saving ? "Saving…" : "Save"}
                    </button>
                    <button onClick={cancelEdit} className="text-[#666] text-sm hover:text-[#999] transition-colors">Cancel</button>
                  </div>
                </div>
              ) : (
                <div className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-white text-sm">{sig.name}</span>
                        {sig.isDefault && (
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-400/15 text-emerald-400 border border-emerald-400/30">
                            Default
                          </span>
                        )}
                      </div>
                      <pre className="text-xs text-[#555] whitespace-pre-wrap font-sans leading-relaxed mt-2 line-clamp-3">{sig.content}</pre>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {!sig.isDefault && (
                        <button onClick={() => setDefault(sig.id)} className="text-[#444] hover:text-[#888] transition-colors text-xs">Set default</button>
                      )}
                      <button onClick={() => openEdit(sig)} className="text-[#444] hover:text-white transition-colors text-xs">Edit</button>
                      <button onClick={() => deleteSig(sig.id)} className="text-[#444] hover:text-red-400 transition-colors text-xs">Delete</button>
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
