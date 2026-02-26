"use client";

import { useState, useEffect, useCallback } from "react";

interface Sample {
  id: number;
  title: string;
  content: string;
  wordCount: number;
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

export default function VoicePage() {
  const [samples, setSamples] = useState<Sample[]>([]);
  const [profile, setProfile] = useState<VoiceProfile | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
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

  async function addSample() {
    if (!content.trim()) return;
    setAdding(true);
    await fetch("/api/voice", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, content }),
    });
    setTitle("");
    setContent("");
    setShowForm(false);
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
    try {
      const res = await fetch("/api/voice/analyze", { method: "POST" });
      if (!res.ok) {
        let errorMsg = "Analysis failed.";
        try {
          const data = await res.json();
          errorMsg = data.error || errorMsg;
        } catch {
          // response wasn't JSON (e.g. Next.js 500 HTML page)
        }
        setAnalyzeError(errorMsg);
      } else {
        await load();
        setExpandedProfile(true);
      }
    } catch {
      setAnalyzeError("Network error — please try again.");
    } finally {
      setAnalyzing(false);
    }
  }

  const totalWords = samples.reduce((s, x) => s + x.wordCount, 0);

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">My Voice</h1>
          <p className="text-[#666] text-sm mt-1">
            Add samples of your real writing. The more you add, the better the
            clone.
          </p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="bg-white text-black text-sm font-medium px-4 py-2 rounded-lg hover:bg-[#e8e8e8] transition-colors"
        >
          + Add sample
        </button>
      </div>

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
          <div className="flex items-center gap-3">
            <button
              onClick={addSample}
              disabled={adding || !content.trim()}
              className="bg-white text-black text-sm font-medium px-4 py-2 rounded-lg hover:bg-[#e8e8e8] transition-colors disabled:opacity-40"
            >
              {adding ? "Saving..." : "Save sample"}
            </button>
            <button
              onClick={() => setShowForm(false)}
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
              className="bg-white text-black text-sm font-medium px-4 py-2 rounded-lg hover:bg-[#e8e8e8] transition-colors disabled:opacity-40 flex items-center gap-2"
            >
              {analyzing && (
                <svg
                  className="animate-spin h-3.5 w-3.5 text-black"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                  />
                </svg>
              )}
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
              <span className="font-medium text-white text-sm">
                Voice profile active
              </span>
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
                      <li key={i} className="text-xs text-[#888]">
                        · {p}
                      </li>
                    ))}
                  </ul>
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
          {samples.map((s) => (
            <div
              key={s.id}
              className="bg-[#161616] border border-[#222] rounded-xl p-4 flex items-start justify-between gap-4"
            >
              <div className="space-y-1 min-w-0">
                <div className="font-medium text-white text-sm">{s.title}</div>
                <div className="text-xs text-[#555]">
                  {s.wordCount} words ·{" "}
                  {new Date(s.createdAt).toLocaleDateString()}
                </div>
                <p className="text-xs text-[#666] line-clamp-2 mt-1">
                  {s.content}
                </p>
              </div>
              <button
                onClick={() => deleteSample(s.id)}
                className="text-[#444] hover:text-red-400 transition-colors text-xs shrink-0 mt-0.5"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
