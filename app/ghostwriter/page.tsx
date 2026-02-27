"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { CONTENT_TYPE_LABELS } from "@/lib/content-types";

interface Job {
  id: number;
  contentType: string;
  topic: string;
  status: string;
  stepLabel: string;
  finalDraft: string;
  errorMsg: string;
  createdAt: string;
  updatedAt: string;
}

const STEPS = [
  { key: "planning",    label: "Planning structure" },
  { key: "drafting_1",  label: "Writing first draft" },
  { key: "drafting_2",  label: "Writing second draft" },
  { key: "drafting_3",  label: "Writing third draft" },
  { key: "comparing",  label: "Comparing drafts against your voice" },
  { key: "checking",   label: "Checking word count & structure" },
  { key: "humanizing", label: "Final polish" },
];

const ACTIVE_STATUSES = new Set(STEPS.map((s) => s.key));

function stepIndex(status: string) {
  return STEPS.findIndex((s) => s.key === status);
}

function timeAgo(iso: string) {
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 60)  return `${secs}s ago`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return `${Math.floor(secs / 86400)}d ago`;
}

export default function GhostwriterPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);

  // Per-job state
  const [activeJobId, setActiveJobId] = useState<number | null>(null);
  const [liveStep, setLiveStep] = useState<string>("");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const loadJobs = useCallback(async () => {
    const res = await fetch("/api/ghostwriter");
    const data: Job[] = await res.json();
    setJobs(data);
    setLoading(false);
    return data;
  }, []);

  useEffect(() => {
    loadJobs().then((data) => {
      // Auto-start the most recent queued job
      const queued = data.find((j) => j.status === "queued");
      if (queued) startJob(queued.id);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function startJob(id: number) {
    if (activeJobId !== null) return; // one at a time
    setActiveJobId(id);
    setLiveStep("planning");
    abortRef.current = new AbortController();

    try {
      const res = await fetch(`/api/ghostwriter/${id}/stream`, {
        signal: abortRef.current.signal,
      });
      if (!res.ok) {
        setActiveJobId(null);
        loadJobs();
        return;
      }

      const reader = res.body!.getReader();
      const dec = new TextDecoder();
      let buf = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const msg = JSON.parse(line.slice(6));
            if (msg.type === "step") {
              setLiveStep(msg.step);
              setJobs((prev) =>
                prev.map((j) => j.id === id ? { ...j, status: msg.step, stepLabel: msg.label } : j)
              );
            } else if (msg.type === "done") {
              setJobs((prev) =>
                prev.map((j) => j.id === id ? { ...j, status: "done", stepLabel: "Done", finalDraft: msg.finalDraft } : j)
              );
              setExpandedId(id);
            } else if (msg.type === "error") {
              setJobs((prev) =>
                prev.map((j) => j.id === id ? { ...j, status: "error", errorMsg: msg.message } : j)
              );
            }
          } catch { /* malformed line */ }
        }
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setJobs((prev) =>
          prev.map((j) => j.id === id ? { ...j, status: "error", errorMsg: "Connection lost." } : j)
        );
      }
    } finally {
      setActiveJobId(null);
      setLiveStep("");
      // Drain the queue — start next queued job if one exists
      setJobs((prev) => {
        const next = prev.find((j) => j.status === "queued");
        if (next) setTimeout(() => startJob(next.id), 400);
        return prev;
      });
    }
  }

  async function deleteJob(id: number) {
    await fetch(`/api/ghostwriter/${id}`, { method: "DELETE" });
    setJobs((prev) => prev.filter((j) => j.id !== id));
    if (expandedId === id) setExpandedId(null);
  }

  async function copyDraft(job: Job) {
    await navigator.clipboard.writeText(job.finalDraft);
    setCopiedId(job.id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  function restartJob(id: number) {
    if (activeJobId !== null) return;
    // Reset to queued
    fetch(`/api/ghostwriter/${id}`, { method: "DELETE" }).then(() => {
      // Caller should re-create the job — for now just reload
      loadJobs();
    });
  }

  if (loading) {
    return (
      <div className="flex items-center gap-3 py-20 text-[#555] text-sm">
        <span className="w-1.5 h-1.5 bg-[#555] rounded-full animate-pulse" />
        Loading…
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Ghostwriter</h1>
          <p className="text-[#666] text-sm mt-1">
            Your pieces in progress — the ghostwriter writes 3 drafts, compares them against your voice, and delivers the best one.
          </p>
        </div>
        <Link
          href="/create"
          className="bg-white text-black text-sm font-medium px-4 py-2 rounded-lg hover:bg-[#e8e8e8] transition-colors shrink-0"
        >
          + New piece
        </Link>
      </div>

      {jobs.length === 0 ? (
        <div className="bg-[#111] border border-[#1e1e1e] rounded-xl p-12 text-center space-y-3">
          <p className="text-[#555] text-sm">No pieces queued yet.</p>
          <Link href="/create" className="inline-block text-white text-sm underline underline-offset-4">
            Go to Brainstorm →
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {(() => {
            // Build queue position map for "queued" jobs (newest = position 1)
            const queuedIds = jobs.filter((j) => j.status === "queued").map((j) => j.id);
            const queuePos = Object.fromEntries(queuedIds.map((id, i) => [id, i + 1]));
            return jobs.map((job) => {
            const isActive = job.id === activeJobId;
            const isDone = job.status === "done";
            const isError = job.status === "error";
            const isQueued = job.status === "queued";
            const isProcessing = ACTIVE_STATUSES.has(job.status);
            const pos = queuePos[job.id];
            const currentStepIdx = stepIndex(isActive ? liveStep : job.status);
            const isExpanded = expandedId === job.id;

            return (
              <div
                key={job.id}
                className="bg-[#161616] border border-[#222] rounded-xl overflow-hidden"
              >
                {/* Card header */}
                <div className="px-5 py-4 flex items-start justify-between gap-4">
                  <div className="min-w-0 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[11px] font-medium text-[#555] bg-[#1e1e1e] rounded px-1.5 py-0.5">
                        {CONTENT_TYPE_LABELS[job.contentType] ?? job.contentType}
                      </span>
                      {isDone && (
                        <span className="flex items-center gap-1 text-[11px] text-emerald-400">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />
                          Ready
                        </span>
                      )}
                      {isError && (
                        <span className="flex items-center gap-1 text-[11px] text-red-400">
                          <span className="w-1.5 h-1.5 rounded-full bg-red-400 inline-block" />
                          Error
                        </span>
                      )}
                      {isQueued && (
                        <span className="text-[11px] text-[#444]">
                          {activeJobId !== null
                            ? pos === 1 ? "Up next" : `#${pos} in queue`
                            : "Queued"}
                        </span>
                      )}
                      {(isActive || isProcessing) && !isDone && !isError && (
                        <span className="flex items-center gap-1.5 text-[11px] text-[#888]">
                          <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse inline-block" />
                          {isActive ? (STEPS[currentStepIdx]?.label ?? "Processing…") : job.stepLabel}
                        </span>
                      )}
                    </div>
                    <p className="text-sm font-medium text-white truncate">{job.topic}</p>
                    <p className="text-[11px] text-[#444]">{timeAgo(job.createdAt)}</p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {isDone && (
                      <>
                        <button
                          onClick={() => setExpandedId(isExpanded ? null : job.id)}
                          className="text-xs text-white border border-[#333] rounded-md px-3 py-1.5 hover:border-[#555] transition-colors"
                        >
                          {isExpanded ? "Hide" : "View draft"}
                        </button>
                        <button
                          onClick={() => copyDraft(job)}
                          className="text-xs text-[#666] hover:text-white transition-colors border border-[#333] rounded-md px-3 py-1.5"
                        >
                          {copiedId === job.id ? "Copied!" : "Copy"}
                        </button>
                      </>
                    )}
                    {isQueued && activeJobId === null && (
                      <button
                        onClick={() => startJob(job.id)}
                        className="text-xs bg-white text-black font-medium rounded-md px-3 py-1.5 hover:bg-[#e8e8e8] transition-colors"
                      >
                        Start
                      </button>
                    )}
                    <button
                      onClick={() => deleteJob(job.id)}
                      className="text-[#444] hover:text-red-400 transition-colors text-xs"
                    >
                      Delete
                    </button>
                  </div>
                </div>

                {/* Progress steps — shown while processing */}
                {(isActive || (isProcessing && !isDone)) && (
                  <div className="border-t border-[#1e1e1e] px-5 py-4 space-y-2.5">
                    {STEPS.map((s, i) => {
                      const idx = isActive ? stepIndex(liveStep) : currentStepIdx;
                      const done = i < idx;
                      const active = i === idx;
                      return (
                        <div key={s.key} className="flex items-center gap-3">
                          {done ? (
                            <svg className="w-3.5 h-3.5 text-emerald-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                          ) : active ? (
                            <svg className="w-3.5 h-3.5 text-white animate-spin shrink-0" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                            </svg>
                          ) : (
                            <span className="w-3.5 h-3.5 rounded-full border border-[#333] shrink-0" />
                          )}
                          <span className={`text-xs ${done ? "text-[#555]" : active ? "text-white" : "text-[#333]"}`}>
                            {s.label}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Error message */}
                {isError && job.errorMsg && (
                  <div className="border-t border-[#1e1e1e] px-5 py-3">
                    <p className="text-xs text-red-400">{job.errorMsg}</p>
                  </div>
                )}

                {/* Expanded draft */}
                {isDone && isExpanded && (
                  <div className="border-t border-[#1e1e1e] px-5 py-5">
                    <pre className="text-sm text-[#ccc] whitespace-pre-wrap font-sans leading-relaxed">
                      {job.finalDraft}
                    </pre>
                  </div>
                )}
              </div>
            );
          });
          })()}
        </div>
      )}
    </div>
  );
}
