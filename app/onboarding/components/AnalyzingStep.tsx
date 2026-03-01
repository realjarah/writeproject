"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import type { VoiceAnalysis } from "@/lib/content-types";
import type { AnalyzeStats } from "../types";

const MESSAGES = [
  "Reading your writing samples\u2026",
  "Studying your sentence patterns\u2026",
  "Learning your vocabulary preferences\u2026",
  "Analyzing your punctuation habits\u2026",
  "Mapping your rhetorical style\u2026",
  "Building your format-specific voice profiles\u2026",
  "Almost there\u2026",
];

export default function AnalyzingStep({
  selectedTypes,
  onComplete,
  setAnalyzeStats,
}: {
  selectedTypes: string[];
  onComplete: (analysis: VoiceAnalysis) => void;
  setAnalyzeStats: (s: AnalyzeStats) => void;
}) {
  const [msgIndex, setMsgIndex] = useState(0);
  const [error, setError] = useState("");
  const started = useRef(false);

  // Rotate messages
  useEffect(() => {
    const interval = setInterval(() => {
      setMsgIndex((i) => (i + 1) % MESSAGES.length);
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  // Kick off analysis + poll
  useEffect(() => {
    if (started.current) return;
    started.current = true;

    // Fire analysis
    fetch("/api/voice/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ selectedCategories: selectedTypes }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.totalWords) setAnalyzeStats({ totalWords: data.totalWords, sampleCount: data.sampleCount });
      })
      .catch(() => {});

    // Poll status
    const poll = setInterval(async () => {
      try {
        const res = await fetch("/api/voice/analyze/status");
        const data = await res.json();
        if (data.totalWords) setAnalyzeStats({ totalWords: data.totalWords, sampleCount: data.sampleCount });

        if (data.status === "done") {
          clearInterval(poll);
          const profileRes = await fetch("/api/voice/profile");
          const profile = await profileRes.json();
          if (profile?.analysis) {
            onComplete(profile.analysis);
          } else {
            setError("Analysis completed but profile could not be loaded.");
          }
        } else if (data.status === "error") {
          clearInterval(poll);
          setError("Voice analysis failed. Please try again.");
        }
      } catch {
        // network error, keep polling
      }
    }, 3000);

    return () => clearInterval(poll);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (error) {
    return (
      <div className="max-w-md mx-auto flex items-center justify-center min-h-[60vh] px-4">
        <div className="text-center space-y-4">
          <p className="text-[14px] text-red-400">{error}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="text-[13px] text-black/50 dark:text-white/40 hover:text-black/70 dark:hover:text-white/60 transition-colors underline"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto flex items-center justify-center min-h-[60vh] px-4">
      <div className="text-center space-y-8">
        {/* Animated spinner */}
        <div className="flex items-center justify-center">
          <div className="relative w-16 h-16">
            <div className="absolute inset-0 rounded-full border-2 border-violet-400/20 dark:border-violet-400/15" />
            <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-violet-400 animate-spin" />
            <div className="absolute inset-2 rounded-full border-2 border-transparent border-b-violet-300 animate-spin" style={{ animationDirection: "reverse", animationDuration: "1.5s" }} />
            <div className="absolute inset-0 flex items-center justify-center">
              <svg className="w-5 h-5 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z" />
              </svg>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <h2 className="text-[20px] font-semibold text-black/90 dark:text-white tracking-tight">
            Building your voice profile
          </h2>
          <AnimatePresence mode="wait">
            <motion.p
              key={msgIndex}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.35 }}
              className="text-[14px] text-black/45 dark:text-white/35"
            >
              {MESSAGES[msgIndex]}
            </motion.p>
          </AnimatePresence>
        </div>

        <p className="text-[11px] text-black/25 dark:text-white/15">
          This usually takes about a minute
        </p>
      </div>
    </div>
  );
}
