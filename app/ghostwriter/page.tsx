"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { CONTENT_TYPE_LABELS } from "@/lib/content-types";
import DraftEditor from "@/components/DraftEditor";

interface Job {
  id: number;
  contentType: string;
  topic: string;
  title: string;
  summaryText: string;
  status: string;
  stepLabel: string;
  finalDraft: string;
  errorMsg: string;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

const STEPS = [
  { key: "planning",    label: "Planning structure" },
  { key: "drafting_1",  label: "Writing first draft" },
  { key: "drafting_2",  label: "Writing second draft" },
  { key: "drafting_3",  label: "Writing third draft" },
  { key: "comparing",   label: "Comparing drafts against your voice" },
  { key: "checking",    label: "Checking word count & structure" },
  { key: "humanizing",  label: "Final polish" },
];

const ACTIVE_STATUSES = new Set(STEPS.map((s) => s.key));

function stepIndex(status: string) {
  return STEPS.findIndex((s) => s.key === status);
}

function timeAgo(iso: string) {
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 60)    return `${secs}s ago`;
  if (secs < 3600)  return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return `${Math.floor(secs / 86400)}d ago`;
}

/** Sort: done first → processing → queued → error */
function sortJobs(jobs: Job[]) {
  const rank = (j: Job) => {
    if (j.status === "done")           return 0;
    if (ACTIVE_STATUSES.has(j.status)) return 1;
    if (j.status === "queued")         return 2;
    return 3;
  };
  return [...jobs].sort(
    (a, b) => rank(a) - rank(b) || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

function printAsPdf(topic: string, draft: string) {
  // Minimal markdown → HTML for the print window
  const html = draft
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/^### (.+)$/gm, "<h3>$1</h3>")
    .replace(/^## (.+)$/gm,  "<h2>$1</h2>")
    .replace(/^# (.+)$/gm,   "<h1>$1</h1>")
    .replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/^---+$/gm, "<hr>")
    .replace(/^[-*] (.+)$/gm, "<li>$1</li>")
    .replace(/^\d+\. (.+)$/gm, "<li>$1</li>")
    .replace(/(<li>.*<\/li>\n?)+/g, (m) => `<ul>${m}</ul>`)
    .split(/\n{2,}/)
    .map((block) => {
      const t = block.trim();
      if (!t) return "";
      if (/^<(h[123]|ul|hr)/.test(t)) return t;
      return `<p>${t.replace(/\n/g, "<br>")}</p>`;
    })
    .join("\n");

  const win = window.open("", "_blank", "width=800,height=900");
  if (!win) return;
  win.document.write(`<!DOCTYPE html><html><head>
<meta charset="utf-8"><title>${topic.replace(/</g, "&lt;")}</title>
<style>
  body{font-family:Georgia,serif;font-size:15px;line-height:1.75;max-width:680px;margin:48px auto;color:#111}
  h1{font-size:2em;margin-bottom:.4em}h2{font-size:1.4em}h3{font-size:1.2em}
  p{margin:0 0 1em}ul{margin:0 0 1em;padding-left:1.4em}li{margin-bottom:.3em}
  code{font-family:monospace;background:#f2f2f2;padding:0 .3em}
  hr{border:none;border-top:1px solid #ccc;margin:1.5em 0}
  @media print{body{margin:0}}
</style></head><body>${html}</body></html>`);
  win.document.close(); win.focus(); win.print();
}

export default function GhostwriterPage() {
  const [jobs,    setJobs]    = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);

  const [activeJobId, setActiveJobId] = useState<number | null>(null);
  const [liveStep,    setLiveStep]    = useState<string>("");
  const [expandedId,  setExpandedId]  = useState<number | null>(null);
  const [copiedId,    setCopiedId]    = useState<number | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  const loadJobs = useCallback(async () => {
    const res  = await fetch("/api/ghostwriter");
    const data: Job[] = await res.json();
    setJobs(data);
    setLoading(false);
    return data;
  }, []);

  useEffect(() => {
    loadJobs().then((data) => {
      const queued = data.find((j) => j.status === "queued");
      if (queued) startJob(queued.id);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function startJob(id: number) {
    if (activeJobId !== null) return;
    setActiveJobId(id);
    setLiveStep("planning");
    abortRef.current = new AbortController();

    try {
      const res = await fetch(`/api/ghostwriter/${id}/stream`, {
        signal: abortRef.current.signal,
      });
      if (!res.ok) { setActiveJobId(null); loadJobs(); return; }

      const reader = res.body!.getReader();
      const dec    = new TextDecoder();
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
              setJobs((prev) => prev.map((j) => j.id === id ? { ...j, status: msg.step, stepLabel: msg.label } : j));
            } else if (msg.type === "done") {
              setJobs((prev) => prev.map((j) => j.id === id ? { ...j, status: "done", stepLabel: "Done", finalDraft: msg.finalDraft } : j));
              setExpandedId(id);
            } else if (msg.type === "error") {
              setJobs((prev) => prev.map((j) => j.id === id ? { ...j, status: "error", errorMsg: msg.message } : j));
            }
          } catch { /* malformed */ }
        }
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setJobs((prev) => prev.map((j) => j.id === id ? { ...j, status: "error", errorMsg: "Connection lost." } : j));
      }
    } finally {
      setActiveJobId(null);
      setLiveStep("");
      setJobs((prev) => {
        const next = prev.find((j) => j.status === "queued");
        if (next) setTimeout(() => startJob(next.id), 400);
        return prev;
      });
    }
  }

  async function archiveJob(id: number) {
    await fetch(`/api/ghostwriter/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ archived: true }),
    });
    setJobs((prev) => prev.filter((j) => j.id !== id));
    if (expandedId === id) setExpandedId(null);
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

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center gap-3 py-20 text-black/[0.35] dark:text-white/[0.35] text-sm">
        <span className="w-1.5 h-1.5 bg-black/[0.35] dark:bg-white/[0.35] rounded-full animate-pulse" />
        Loading…
      </div>
    );
  }

  const sorted = sortJobs(jobs);

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-black/90 dark:text-white">Ghostwriter</h1>
          <p className="text-black/[0.40] dark:text-white/[0.40] text-sm mt-1">
            Completed drafts surface to the top — open the editor to refine inline or ask AI to rewrite sections.
          </p>
        </div>
        <Link
          href="/create"
          className="bg-black/[0.88] text-white dark:bg-white dark:text-black text-sm font-medium px-4 py-2 rounded-lg hover:bg-black/75 dark:hover:bg-white/90 transition-colors shrink-0"
        >
          + New piece
        </Link>
      </div>

      {sorted.length === 0 ? (
        <div className="bg-black/[0.04] dark:bg-[#111] border border-black/[0.06] dark:border-white/[0.05] rounded-xl p-12 text-center space-y-3">
          <p className="text-black/[0.35] dark:text-white/[0.35] text-sm">No pieces queued yet.</p>
          <Link href="/create" className="inline-block text-black/90 dark:text-white text-sm underline underline-offset-4">
            Go to Brainstorm →
          </Link>
        </div>
      ) : (() => {
        const queuedIds = sorted.filter((j) => j.status === "queued").map((j) => j.id);
        const queuePos  = Object.fromEntries(queuedIds.map((id, i) => [id, i + 1]));

        return (
          <div className="space-y-3">
            {sorted.map((job) => {
              const isActive     = job.id === activeJobId;
              const isDone       = job.status === "done";
              const isError      = job.status === "error";
              const isQueued     = job.status === "queued";
              const isProcessing = ACTIVE_STATUSES.has(job.status);
              const pos          = queuePos[job.id];
              const currentStepIdx = stepIndex(isActive ? liveStep : job.status);
              const isExpanded   = expandedId === job.id;

              return (
                <div
                  key={job.id}
                  className={`bg-black/[0.04] dark:bg-[#161616] border rounded-xl overflow-hidden ${isDone ? "border-black/[0.10] dark:border-[#2a2a2a]" : "border-black/[0.09] dark:border-white/[0.07]"}`}
                >
                  {/* ── Job header ─────────────────────────────────────────── */}
                  <div className="px-5 py-4 flex items-start justify-between gap-4">
                    <div className="min-w-0 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[11px] font-medium text-black/[0.35] dark:text-white/[0.35] bg-black/[0.07] dark:bg-[#1e1e1e] rounded px-1.5 py-0.5">
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
                          <span className="text-[11px] text-black/[0.28] dark:text-white/[0.28]">
                            {activeJobId !== null
                              ? pos === 1 ? "Up next" : `#${pos} in queue`
                              : "Queued"}
                          </span>
                        )}
                        {(isActive || isProcessing) && !isDone && !isError && (
                          <span className="flex items-center gap-1.5 text-[11px] text-black/[0.55] dark:text-white/[0.55]">
                            <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse inline-block" />
                            {isActive ? (STEPS[currentStepIdx]?.label ?? "Processing…") : job.stepLabel}
                          </span>
                        )}
                      </div>
                      <p className="text-sm font-medium text-black/90 dark:text-white truncate">{job.title || job.topic}</p>
                      {job.summaryText && (
                        <p className="text-[11px] text-black/[0.40] dark:text-white/[0.40] line-clamp-2">{job.summaryText}</p>
                      )}
                      <p className="text-[11px] text-black/[0.28] dark:text-white/[0.28]">{timeAgo(job.createdAt)}</p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                      {isDone && (
                        <>
                          <button
                            onClick={() => setExpandedId(isExpanded ? null : job.id)}
                            className="text-xs text-black/90 dark:text-white border border-black/[0.12] dark:border-white/[0.12] rounded-md px-3 py-1.5 hover:border-black/[0.21] dark:hover:border-white/[0.22] transition-colors"
                          >
                            {isExpanded ? "Close editor" : "Open editor"}
                          </button>
                          <button
                            onClick={() => copyDraft(job)}
                            className="text-xs text-black/[0.40] dark:text-white/[0.40] hover:text-black/90 dark:hover:text-white border border-black/[0.12] dark:border-white/[0.12] rounded-md px-3 py-1.5 transition-colors"
                          >
                            {copiedId === job.id ? "Copied!" : "Copy"}
                          </button>
                          <button
                            onClick={() => printAsPdf(job.title || job.topic, job.finalDraft)}
                            className="text-xs text-black/[0.40] dark:text-white/[0.40] hover:text-black/90 dark:hover:text-white border border-black/[0.12] dark:border-white/[0.12] rounded-md px-3 py-1.5 transition-colors"
                            title="Print / Save as PDF"
                          >
                            PDF
                          </button>
                          <button
                            onClick={() => archiveJob(job.id)}
                            className="text-xs text-black/[0.35] dark:text-white/[0.35] hover:text-black/90 dark:hover:text-white border border-black/[0.10] dark:border-[#2a2a2a] hover:border-black/[0.21] dark:hover:border-white/[0.22] rounded-md px-3 py-1.5 transition-colors"
                          >
                            Archive
                          </button>
                        </>
                      )}
                      {isQueued && activeJobId === null && (
                        <button
                          onClick={() => startJob(job.id)}
                          className="text-xs bg-white text-black font-medium rounded-md px-3 py-1.5 hover:bg-black/[0.08] dark:hover:bg-white/90 transition-colors"
                        >
                          Start
                        </button>
                      )}
                      <button
                        onClick={() => deleteJob(job.id)}
                        className="text-black/[0.28] dark:text-white/[0.28] hover:text-red-500 dark:hover:text-red-400 transition-colors text-xs"
                      >
                        Delete
                      </button>
                    </div>
                  </div>

                  {/* ── Progress steps ─────────────────────────────────────── */}
                  {(isActive || (isProcessing && !isDone)) && (
                    <div className="border-t border-black/[0.06] dark:border-white/[0.05] px-5 py-4 space-y-2.5">
                      {STEPS.map((s, i) => {
                        const idx    = isActive ? stepIndex(liveStep) : currentStepIdx;
                        const done   = i < idx;
                        const active = i === idx;
                        return (
                          <div key={s.key} className="flex items-center gap-3">
                            {done ? (
                              <svg className="w-3.5 h-3.5 text-emerald-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                              </svg>
                            ) : active ? (
                              <svg className="w-3.5 h-3.5 text-black/90 dark:text-white animate-spin shrink-0" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                              </svg>
                            ) : (
                              <span className="w-3.5 h-3.5 rounded-full border border-black/[0.12] dark:border-white/[0.12] shrink-0" />
                            )}
                            <span className={`text-xs ${done ? "text-black/[0.35] dark:text-white/[0.35]" : active ? "text-black/90 dark:text-white" : "text-black/[0.22] dark:text-white/[0.22]"}`}>
                              {s.label}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* ── Error ──────────────────────────────────────────────── */}
                  {isError && job.errorMsg && (
                    <div className="border-t border-black/[0.06] dark:border-white/[0.05] px-5 py-3">
                      <p className="text-xs text-red-400">{job.errorMsg}</p>
                    </div>
                  )}

                  {/* ── Live editor ────────────────────────────────────────── */}
                  {isDone && isExpanded && (
                    <DraftEditor
                      key={job.id}
                      jobId={job.id}
                      initialDraft={job.finalDraft}
                      contentType={job.contentType}
                      jobTitle={job.title || job.topic}
                      onDraftChange={(newDraft) =>
                        setJobs((prev) =>
                          prev.map((j) => j.id === job.id ? { ...j, finalDraft: newDraft } : j)
                        )
                      }
                    />
                  )}
                </div>
              );
            })}
          </div>
        );
      })()}
    </div>
  );
}
