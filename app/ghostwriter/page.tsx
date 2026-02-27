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
    return 3; // error
  };
  return [...jobs].sort(
    (a, b) => rank(a) - rank(b) || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

/** Parse a thread draft (tweets separated by '---') into individual tweet strings */
function parseTweets(draft: string): string[] {
  return draft
    .split(/\n---\n|\n---$|^---\n/m)
    .map((t) => t.trim())
    .filter(Boolean);
}

/** Minimal markdown → HTML for draft rendering */
function renderMarkdown(md: string): string {
  let html = md
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/^### (.+)$/gm, "<h3>$1</h3>")
    .replace(/^## (.+)$/gm, "<h2>$1</h2>")
    .replace(/^# (.+)$/gm, "<h1>$1</h1>")
    .replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/^---+$/gm, "<hr>")
    .replace(/^[-*] (.+)$/gm, "<li>$1</li>")
    .replace(/^\d+\. (.+)$/gm, "<li>$1</li>");

  html = html.replace(/(<li>.*<\/li>\n?)+/g, (m) => `<ul>${m}</ul>`);

  html = html
    .split(/\n{2,}/)
    .map((block) => {
      const t = block.trim();
      if (!t) return "";
      if (/^<(h[123]|ul|hr)/.test(t)) return t;
      return `<p>${t.replace(/\n/g, "<br>")}</p>`;
    })
    .join("\n");

  return html;
}

function downloadTxt(topic: string, draft: string) {
  const blob = new Blob([draft], { type: "text/plain" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = `${topic.slice(0, 60).replace(/[^a-z0-9]+/gi, "-")}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}

function printAsPdf(topic: string, draft: string) {
  const win = window.open("", "_blank", "width=800,height=900");
  if (!win) return;
  win.document.write(`<!DOCTYPE html><html><head>
<meta charset="utf-8">
<title>${topic.replace(/</g, "&lt;")}</title>
<style>
  body{font-family:Georgia,serif;font-size:15px;line-height:1.75;max-width:680px;margin:48px auto;color:#111}
  h1{font-size:2em;margin-bottom:.4em}h2{font-size:1.4em}h3{font-size:1.2em}
  p{margin:0 0 1em}ul{margin:0 0 1em;padding-left:1.4em}li{margin-bottom:.3em}
  code{font-family:monospace;background:#f2f2f2;padding:0 .3em}
  hr{border:none;border-top:1px solid #ccc;margin:1.5em 0}
  strong{font-weight:700}em{font-style:italic}
  @media print{body{margin:0}}
</style>
</head><body>${renderMarkdown(draft)}</body></html>`);
  win.document.close();
  win.focus();
  win.print();
}

export default function GhostwriterPage() {
  const [jobs,    setJobs]    = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);

  const [activeJobId, setActiveJobId] = useState<number | null>(null);
  const [liveStep,    setLiveStep]    = useState<string>("");
  const [expandedId,  setExpandedId]  = useState<number | null>(null);
  const [markdownId,  setMarkdownId]  = useState<number | null>(null);
  const [copiedId,    setCopiedId]    = useState<number | null>(null);

  const [feedbackMap,  setFeedbackMap]  = useState<Record<number, string>>({});
  const [revisingId,   setRevisingId]   = useState<number | null>(null);
  const [liveRevision, setLiveRevision] = useState<string>("");

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

  async function applyFeedback(job: Job) {
    const feedback = feedbackMap[job.id]?.trim();
    if (!feedback || revisingId !== null) return;

    setRevisingId(job.id);
    setLiveRevision("");

    try {
      const res = await fetch(`/api/ghostwriter/${job.id}/revise`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feedback }),
      });
      if (!res.ok) { setRevisingId(null); return; }

      const reader = res.body!.getReader();
      const dec    = new TextDecoder();
      let buf = "";
      let accumulated = "";

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
            if (msg.type === "chunk") {
              accumulated += msg.text;
              setLiveRevision(accumulated);
            } else if (msg.type === "done") {
              setJobs((prev) => prev.map((j) => j.id === job.id ? { ...j, finalDraft: msg.finalDraft } : j));
              setFeedbackMap((prev) => { const n = { ...prev }; delete n[job.id]; return n; });
            }
          } catch { /* malformed */ }
        }
      }
    } finally {
      setRevisingId(null);
      setLiveRevision("");
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
    const text = revisingId === job.id ? liveRevision : job.finalDraft;
    await navigator.clipboard.writeText(text);
    setCopiedId(job.id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  if (loading) {
    return (
      <div className="flex items-center gap-3 py-20 text-[#555] text-sm">
        <span className="w-1.5 h-1.5 bg-[#555] rounded-full animate-pulse" />
        Loading…
      </div>
    );
  }

  const sorted = sortJobs(jobs);

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Ghostwriter</h1>
          <p className="text-[#666] text-sm mt-1">
            Completed drafts surface to the top — review, refine with feedback, then save to your archive.
          </p>
        </div>
        <Link
          href="/create"
          className="bg-white text-black text-sm font-medium px-4 py-2 rounded-lg hover:bg-[#e8e8e8] transition-colors shrink-0"
        >
          + New piece
        </Link>
      </div>

      {sorted.length === 0 ? (
        <div className="bg-[#111] border border-[#1e1e1e] rounded-xl p-12 text-center space-y-3">
          <p className="text-[#555] text-sm">No pieces queued yet.</p>
          <Link href="/create" className="inline-block text-white text-sm underline underline-offset-4">
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
              const isRevising   = revisingId === job.id;
              const pos          = queuePos[job.id];
              const currentStepIdx = stepIndex(isActive ? liveStep : job.status);
              const isExpanded   = expandedId === job.id;
              const isMarkdown   = markdownId === job.id;
              const feedback     = feedbackMap[job.id] ?? "";
              const displayDraft = isRevising ? liveRevision : job.finalDraft;

              return (
                <div
                  key={job.id}
                  className={`bg-[#161616] border rounded-xl overflow-hidden ${isDone ? "border-[#2a2a2a]" : "border-[#222]"}`}
                >
                  {/* Header */}
                  <div className="px-5 py-4 flex items-start justify-between gap-4">
                    <div className="min-w-0 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[11px] font-medium text-[#555] bg-[#1e1e1e] rounded px-1.5 py-0.5">
                          {CONTENT_TYPE_LABELS[job.contentType] ?? job.contentType}
                        </span>
                        {isDone && (
                          <span className="flex items-center gap-1 text-[11px] text-emerald-400">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />
                            Ready for review
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
                        {isRevising && (
                          <span className="flex items-center gap-1.5 text-[11px] text-amber-400">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse inline-block" />
                            Applying edits…
                          </span>
                        )}
                      </div>
                      <p className="text-sm font-medium text-white truncate">{job.topic}</p>
                      <p className="text-[11px] text-[#444]">{timeAgo(job.createdAt)}</p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                      {isDone && (
                        <>
                          <button
                            onClick={() => { setExpandedId(isExpanded ? null : job.id); if (!isExpanded) setMarkdownId(null); }}
                            className="text-xs text-white border border-[#333] rounded-md px-3 py-1.5 hover:border-[#555] transition-colors"
                          >
                            {isExpanded ? "Hide" : "View draft"}
                          </button>
                          <button
                            onClick={() => copyDraft(job)}
                            className="text-xs text-[#666] hover:text-white border border-[#333] rounded-md px-3 py-1.5 transition-colors"
                          >
                            {copiedId === job.id ? "Copied!" : "Copy"}
                          </button>
                          <button
                            onClick={() => downloadTxt(job.topic, job.finalDraft)}
                            className="text-xs text-[#666] hover:text-white border border-[#333] rounded-md px-3 py-1.5 transition-colors"
                            title="Download as TXT"
                          >
                            TXT
                          </button>
                          <button
                            onClick={() => printAsPdf(job.topic, job.finalDraft)}
                            className="text-xs text-[#666] hover:text-white border border-[#333] rounded-md px-3 py-1.5 transition-colors"
                            title="Print / Save as PDF"
                          >
                            PDF
                          </button>
                          <button
                            onClick={() => archiveJob(job.id)}
                            className="text-xs text-[#555] hover:text-white border border-[#2a2a2a] hover:border-[#555] rounded-md px-3 py-1.5 transition-colors"
                          >
                            Archive
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

                  {/* Progress steps */}
                  {(isActive || (isProcessing && !isDone)) && (
                    <div className="border-t border-[#1e1e1e] px-5 py-4 space-y-2.5">
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

                  {/* Error */}
                  {isError && job.errorMsg && (
                    <div className="border-t border-[#1e1e1e] px-5 py-3">
                      <p className="text-xs text-red-400">{job.errorMsg}</p>
                    </div>
                  )}

                  {/* Expanded: draft + feedback */}
                  {isDone && isExpanded && (() => {
                    const isThread = job.contentType === "twitter_thread";
                    // threadView: null = plain, "thread" = thread cards, "rendered" = markdown
                    const viewMode = isThread
                      ? (isMarkdown ? "thread" : "plain")
                      : (isMarkdown ? "rendered" : "plain");
                    return (
                    <div className="border-t border-[#1e1e1e]">
                      {/* View toggle */}
                      <div className="px-5 pt-4 pb-2">
                        <div className="inline-flex items-center gap-0.5 bg-[#111] border border-[#222] rounded-lg p-0.5">
                          <button
                            onClick={() => setMarkdownId(null)}
                            className={`text-[11px] px-2.5 py-1 rounded-md transition-colors ${!isMarkdown ? "bg-[#222] text-white" : "text-[#555] hover:text-[#888]"}`}
                          >
                            Plain
                          </button>
                          {isThread ? (
                            <button
                              onClick={() => setMarkdownId(job.id)}
                              className={`text-[11px] px-2.5 py-1 rounded-md transition-colors ${isMarkdown ? "bg-[#222] text-white" : "text-[#555] hover:text-[#888]"}`}
                            >
                              Thread view
                            </button>
                          ) : (
                            <button
                              onClick={() => setMarkdownId(job.id)}
                              className={`text-[11px] px-2.5 py-1 rounded-md transition-colors ${isMarkdown ? "bg-[#222] text-white" : "text-[#555] hover:text-[#888]"}`}
                            >
                              Rendered
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Draft */}
                      <div className="px-5 pb-5">
                        {viewMode === "thread" ? (
                          // Thread card view — each tweet as a card with char count
                          <div className="space-y-2">
                            {parseTweets(displayDraft).map((tweet, idx, arr) => {
                              const len = tweet.length;
                              const over = len > 280;
                              return (
                                <div key={idx} className={`bg-[#111] border rounded-lg p-4 space-y-2 ${over ? "border-red-500/40" : "border-[#222]"}`}>
                                  <div className="flex items-center justify-between">
                                    <span className="text-[10px] text-[#444]">{idx + 1} / {arr.length}</span>
                                    <span className={`text-[10px] tabular-nums font-medium ${over ? "text-red-400" : len > 240 ? "text-amber-400" : "text-[#555]"}`}>
                                      {len} / 280
                                    </span>
                                  </div>
                                  <p className="text-sm text-[#ccc] leading-relaxed whitespace-pre-wrap">{tweet}</p>
                                  {over && (
                                    <p className="text-[10px] text-red-400">⚠ {len - 280} characters over limit</p>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        ) : viewMode === "rendered" ? (
                          <div
                            className="text-sm text-[#ccc] leading-relaxed [&_h1]:text-white [&_h1]:text-xl [&_h1]:font-bold [&_h1]:mb-3 [&_h1]:mt-5 [&_h2]:text-white [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:mb-2 [&_h2]:mt-4 [&_h3]:text-[#ddd] [&_h3]:font-semibold [&_h3]:mb-2 [&_h3]:mt-3 [&_p]:mb-3 [&_ul]:mb-3 [&_ul]:pl-5 [&_li]:mb-1 [&_li]:list-disc [&_strong]:text-white [&_em]:italic [&_code]:font-mono [&_code]:text-[#9cdcfe] [&_code]:bg-[#1e1e1e] [&_code]:px-1 [&_code]:rounded [&_hr]:border-[#333] [&_hr]:my-4"
                            dangerouslySetInnerHTML={{ __html: renderMarkdown(displayDraft) }}
                          />
                        ) : (
                          <pre className="text-sm text-[#ccc] whitespace-pre-wrap font-sans leading-relaxed">
                            {displayDraft || (isRevising ? "Writing…" : "")}
                          </pre>
                        )}
                      </div>

                      {/* Feedback */}
                      <div className="border-t border-[#1e1e1e] px-5 py-4 space-y-3">
                        <p className="text-[11px] text-[#555] font-medium uppercase tracking-widest">Refine this draft</p>
                        <textarea
                          value={feedback}
                          onChange={(e) => setFeedbackMap((prev) => ({ ...prev, [job.id]: e.target.value }))}
                          placeholder='Describe what to change — e.g. "Make the intro punchier" or "Remove the third bullet and add a closing question"'
                          rows={3}
                          disabled={isRevising}
                          className="w-full bg-[#111] border border-[#2a2a2a] focus:border-[#444] rounded-lg px-3 py-2.5 text-sm text-white placeholder-[#3a3a3a] resize-none focus:outline-none transition-colors disabled:opacity-50"
                        />
                        <div className="flex items-center gap-3">
                          <button
                            onClick={() => applyFeedback(job)}
                            disabled={!feedback.trim() || isRevising}
                            className="bg-white text-black text-xs font-medium px-4 py-2 rounded-lg hover:bg-[#e8e8e8] transition-colors disabled:opacity-40"
                          >
                            {isRevising ? "Applying…" : "Apply edits"}
                          </button>
                          {feedback.trim() && !isRevising && (
                            <button
                              onClick={() => setFeedbackMap((prev) => { const n = { ...prev }; delete n[job.id]; return n; })}
                              className="text-[#555] text-xs hover:text-[#888] transition-colors"
                            >
                              Clear
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                    );
                  })()}
                </div>
              );
            })}
          </div>
        );
      })()}
    </div>
  );
}
