"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { CONTENT_TYPE_LABELS } from "@/lib/content-types";
import {
  downloadTxt as dlTxt,
  downloadMarkdown,
  downloadDocx,
  downloadHtml,
  printAsPdf as printPdf,
} from "@/lib/export-utils";
import { extractTemplateBrief, defaultTemplateName } from "@/lib/template-utils";

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

interface PipelineStep {
  key: string;
  label: string;
}

// Default steps used as fallback when no pipeline event has been received
// (e.g. for jobs already in progress before this update)
const DEFAULT_STEPS: PipelineStep[] = [
  { key: "planning",    label: "Planning…" },
  { key: "drafting",    label: "Writing…" },
  { key: "humanizing",  label: "Polishing…" },
];

// Superset of all possible active step keys across all pipeline tiers
const ALL_ACTIVE_STATUSES = new Set([
  "planning", "researching",
  "drafting", "drafting_1", "proposing", "drafting_2",
  "comparing", "checking", "humanizing", "reviewing",
]);

function getStepIndex(steps: PipelineStep[], status: string) {
  return steps.findIndex((s) => s.key === status);
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
    if (j.status === "done")                  return 0;
    if (ALL_ACTIVE_STATUSES.has(j.status))    return 1;
    if (j.status === "queued")                return 2;
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

  // Download dropdown
  const [downloadDropdownId, setDownloadDropdownId] = useState<number | null>(null);
  // Save as template
  const [saveTemplateId,  setSaveTemplateId]  = useState<number | null>(null);
  const [templateName,    setTemplateName]    = useState("");
  const [savingTemplate,  setSavingTemplate]  = useState(false);
  const [savedTemplateId, setSavedTemplateId] = useState<number | null>(null);

  // Per-job pipeline steps (sent by the server at pipeline start)
  const [jobSteps, setJobSteps] = useState<Record<number, PipelineStep[]>>({});
  // Accumulated streaming content during humanization
  const [liveContent, setLiveContent] = useState<string>("");

  const abortRef = useRef<AbortController | null>(null);

  // Close download dropdown on outside click
  useEffect(() => {
    if (downloadDropdownId === null) return;
    function handleClick(e: MouseEvent) {
      if (!(e.target as HTMLElement).closest("[data-download-dropdown]")) {
        setDownloadDropdownId(null);
      }
    }
    document.addEventListener("click", handleClick, { capture: true });
    return () => document.removeEventListener("click", handleClick, { capture: true });
  }, [downloadDropdownId]);

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
    setLiveContent("");
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
            if (msg.type === "pipeline") {
              // Server sent the step list for this job's pipeline tier
              setJobSteps((prev) => ({ ...prev, [id]: msg.steps }));
            } else if (msg.type === "step") {
              setLiveStep(msg.step);
              setJobs((prev) => prev.map((j) => j.id === id ? { ...j, status: msg.step, stepLabel: msg.label } : j));
              // Reset live content when moving past humanizing (e.g. to reviewing)
              if (msg.step === "reviewing") {
                setLiveContent("");
              }
            } else if (msg.type === "chunk") {
              // Stream humanized content live
              setLiveContent((prev) => prev + msg.text);
              setExpandedId(id);
            } else if (msg.type === "done") {
              setLiveContent("");
              setJobs((prev) => prev.map((j) => j.id === id ? { ...j, status: "done", stepLabel: "Done", finalDraft: msg.finalDraft } : j));
              setExpandedId(id);
            } else if (msg.type === "error") {
              setLiveContent("");
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
      setLiveContent("");
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
            Completed drafts surface to the top — review, refine with feedback, then save to your archive.
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
              const isProcessing = ALL_ACTIVE_STATUSES.has(job.status);
              const isRevising   = revisingId === job.id;
              const isStreaming   = isActive && liveContent.length > 0;
              const pos          = queuePos[job.id];

              // Use per-job steps from server, or fall back to default
              const currentSteps = jobSteps[job.id] ?? DEFAULT_STEPS;
              const currentStepIdx = getStepIndex(currentSteps, isActive ? liveStep : job.status);

              const isExpanded   = expandedId === job.id;
              const isMarkdown   = markdownId === job.id;
              const feedback     = feedbackMap[job.id] ?? "";
              const displayDraft = isRevising ? liveRevision : (isStreaming ? liveContent : job.finalDraft);

              return (
                <div
                  key={job.id}
                  className={`bg-black/[0.04] dark:bg-[#161616] border rounded-xl overflow-hidden ${isDone ? "border-black/[0.10] dark:border-[#2a2a2a]" : "border-black/[0.09] dark:border-white/[0.07]"}`}
                >
                  {/* Header */}
                  <div className="px-5 py-4 flex items-start justify-between gap-4">
                    <div className="min-w-0 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[11px] font-medium text-black/[0.35] dark:text-white/[0.35] bg-black/[0.07] dark:bg-[#1e1e1e] rounded px-1.5 py-0.5">
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
                          <span className="text-[11px] text-black/[0.28] dark:text-white/[0.28]">
                            {activeJobId !== null
                              ? pos === 1 ? "Up next" : `#${pos} in queue`
                              : "Queued"}
                          </span>
                        )}
                        {(isActive || isProcessing) && !isDone && !isError && (
                          <span className="flex items-center gap-1.5 text-[11px] text-black/[0.55] dark:text-white/[0.55]">
                            <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse inline-block" />
                            {isActive ? (currentSteps[currentStepIdx]?.label ?? "Processing…") : job.stepLabel}
                          </span>
                        )}
                        {isRevising && (
                          <span className="flex items-center gap-1.5 text-[11px] text-amber-400">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse inline-block" />
                            Applying edits…
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
                            onClick={() => { setExpandedId(isExpanded ? null : job.id); if (!isExpanded) setMarkdownId(null); }}
                            className="text-xs text-black/90 dark:text-white border border-black/[0.12] dark:border-white/[0.12] rounded-md px-3 py-1.5 hover:border-black/[0.21] dark:hover:border-white/[0.22] transition-colors"
                          >
                            {isExpanded ? "Hide" : "View draft"}
                          </button>
                          <button
                            onClick={() => copyDraft(job)}
                            className="text-xs text-black/[0.40] dark:text-white/[0.40] hover:text-black/90 dark:hover:text-white border border-black/[0.12] dark:border-white/[0.12] rounded-md px-3 py-1.5 transition-colors"
                          >
                            {copiedId === job.id ? "Copied!" : "Copy"}
                          </button>

                          {/* Download dropdown */}
                          <div className="relative" data-download-dropdown>
                            <button
                              onClick={(e) => { e.stopPropagation(); setDownloadDropdownId(downloadDropdownId === job.id ? null : job.id); }}
                              className="text-xs text-black/[0.40] dark:text-white/[0.40] hover:text-black/90 dark:hover:text-white border border-black/[0.12] dark:border-white/[0.12] rounded-md px-3 py-1.5 transition-colors flex items-center gap-1"
                            >
                              Download
                              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                              </svg>
                            </button>
                            {downloadDropdownId === job.id && (
                              <div className="absolute right-0 top-full mt-1 bg-white dark:bg-[#1a1a1a] border border-black/[0.12] dark:border-white/[0.12] rounded-lg shadow-lg py-1 z-50 min-w-[140px]">
                                {[
                                  { label: "Text (.txt)",   action: () => dlTxt(job.title || job.topic, job.finalDraft) },
                                  { label: "Markdown (.md)", action: () => downloadMarkdown(job.title || job.topic, job.finalDraft) },
                                  { label: "Word (.docx)",  action: () => downloadDocx(job.title || job.topic, job.finalDraft) },
                                  { label: "PDF (print)",   action: () => printPdf(job.title || job.topic, job.finalDraft, renderMarkdown) },
                                  { label: "HTML (.html)",  action: () => downloadHtml(job.title || job.topic, job.finalDraft, renderMarkdown) },
                                ].map((opt) => (
                                  <button
                                    key={opt.label}
                                    onClick={() => { opt.action(); setDownloadDropdownId(null); }}
                                    className="w-full text-left px-3 py-1.5 text-xs text-black/[0.60] dark:text-white/[0.60] hover:bg-black/[0.05] dark:hover:bg-white/[0.07] hover:text-black/90 dark:hover:text-white transition-colors"
                                  >
                                    {opt.label}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>

                          <button
                            onClick={async () => {
                              const res = await fetch(`/api/ghostwriter/${job.id}`);
                              const fullJob = await res.json();
                              if (!fullJob.brief) return;
                              const tBrief = extractTemplateBrief(fullJob.brief);
                              setTemplateName(defaultTemplateName(tBrief));
                              setSaveTemplateId(job.id);
                            }}
                            className="text-xs text-black/[0.35] dark:text-white/[0.35] hover:text-black/90 dark:hover:text-white border border-black/[0.10] dark:border-[#2a2a2a] hover:border-black/[0.21] dark:hover:border-white/[0.22] rounded-md px-3 py-1.5 transition-colors"
                          >
                            {savedTemplateId === job.id ? "Saved!" : "Template"}
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

                  {/* Save as template form */}
                  {saveTemplateId === job.id && (
                    <div className="border-t border-black/[0.06] dark:border-white/[0.05] px-5 py-3 flex items-center gap-3">
                      <input
                        type="text"
                        value={templateName}
                        onChange={(e) => setTemplateName(e.target.value)}
                        placeholder="Template name"
                        className="flex-1 bg-black/[0.04] dark:bg-[#111] border border-black/[0.10] dark:border-[#2a2a2a] rounded-lg px-3 py-1.5 text-xs text-black/90 dark:text-white placeholder-black/[0.23] dark:placeholder-white/[0.23] focus:outline-none focus:border-black/[0.22] dark:focus:border-white/[0.22]"
                        autoFocus
                        onKeyDown={(e) => { if (e.key === "Escape") setSaveTemplateId(null); }}
                      />
                      <button
                        onClick={async () => {
                          setSavingTemplate(true);
                          const res = await fetch(`/api/ghostwriter/${job.id}`);
                          const fullJob = await res.json();
                          const tBrief = extractTemplateBrief(fullJob.brief);
                          await fetch("/api/templates", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                              name: templateName.trim() || defaultTemplateName(tBrief),
                              contentType: tBrief.interview.contentType,
                              brief: JSON.stringify(tBrief),
                            }),
                          });
                          setSavingTemplate(false);
                          setSaveTemplateId(null);
                          setSavedTemplateId(job.id);
                          setTimeout(() => setSavedTemplateId(null), 2000);
                        }}
                        disabled={savingTemplate || !templateName.trim()}
                        className="text-xs bg-black/[0.88] text-white dark:bg-white dark:text-black font-medium px-3 py-1.5 rounded-lg hover:bg-black/75 dark:hover:bg-white/90 transition-colors disabled:opacity-40"
                      >
                        {savingTemplate ? "Saving..." : "Save"}
                      </button>
                      <button
                        onClick={() => setSaveTemplateId(null)}
                        className="text-xs text-black/[0.35] dark:text-white/[0.35] hover:text-black/55 dark:hover:text-white/55"
                      >
                        Cancel
                      </button>
                    </div>
                  )}

                  {/* Progress steps (dynamic per-job) */}
                  {(isActive || (isProcessing && !isDone)) && (
                    <div className="border-t border-black/[0.06] dark:border-white/[0.05] px-5 py-4 space-y-2.5">
                      {currentSteps.map((s, i) => {
                        const idx    = isActive ? getStepIndex(currentSteps, liveStep) : currentStepIdx;
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
                              {active ? (job.stepLabel || s.label) : s.label}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Error */}
                  {isError && job.errorMsg && (
                    <div className="border-t border-black/[0.06] dark:border-white/[0.05] px-5 py-3">
                      <p className="text-xs text-red-400">{job.errorMsg}</p>
                    </div>
                  )}

                  {/* Expanded: draft + feedback — show when done OR when streaming live content */}
                  {((isDone && isExpanded) || isStreaming) && (() => {
                    const isThread = job.contentType === "twitter_thread";
                    const viewMode = isStreaming
                      ? "plain" // always plain while streaming
                      : isThread
                        ? (isMarkdown ? "thread" : "plain")
                        : (isMarkdown ? "rendered" : "plain");
                    return (
                    <div className="border-t border-black/[0.06] dark:border-white/[0.05]">
                      {/* View toggle (only when done, not while streaming) */}
                      {isDone && (
                        <div className="px-5 pt-4 pb-2">
                          <div className="inline-flex items-center gap-0.5 bg-black/[0.04] dark:bg-[#111] border border-black/[0.09] dark:border-white/[0.07] rounded-lg p-0.5">
                            <button
                              onClick={() => setMarkdownId(null)}
                              className={`text-[11px] px-2.5 py-1 rounded-md transition-colors ${!isMarkdown ? "bg-black/[0.08] dark:bg-[#222] text-black/90 dark:text-white" : "text-black/[0.35] dark:text-white/[0.35] hover:text-black/55 dark:hover:text-white/55"}`}
                            >
                              Plain
                            </button>
                            {isThread ? (
                              <button
                                onClick={() => setMarkdownId(job.id)}
                                className={`text-[11px] px-2.5 py-1 rounded-md transition-colors ${isMarkdown ? "bg-black/[0.08] dark:bg-[#222] text-black/90 dark:text-white" : "text-black/[0.35] dark:text-white/[0.35] hover:text-black/55 dark:hover:text-white/55"}`}
                              >
                                Thread view
                              </button>
                            ) : (
                              <button
                                onClick={() => setMarkdownId(job.id)}
                                className={`text-[11px] px-2.5 py-1 rounded-md transition-colors ${isMarkdown ? "bg-black/[0.08] dark:bg-[#222] text-black/90 dark:text-white" : "text-black/[0.35] dark:text-white/[0.35] hover:text-black/55 dark:hover:text-white/55"}`}
                              >
                                Rendered
                              </button>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Streaming indicator */}
                      {isStreaming && (
                        <div className="px-5 pt-3 pb-1">
                          <span className="text-[11px] text-black/[0.35] dark:text-white/[0.35]">Writing live…</span>
                        </div>
                      )}

                      {/* Draft */}
                      <div className="px-5 pb-5">
                        {viewMode === "thread" ? (
                          <div className="space-y-2">
                            {parseTweets(displayDraft).map((tweet, idx, arr) => {
                              const len = tweet.length;
                              const over = len > 280;
                              return (
                                <div key={idx} className={`bg-black/[0.04] dark:bg-[#111] border rounded-lg p-4 space-y-2 ${over ? "border-red-500/40" : "border-black/[0.09] dark:border-white/[0.07]"}`}>
                                  <div className="flex items-center justify-between">
                                    <span className="text-[10px] text-black/[0.28] dark:text-white/[0.28]">{idx + 1} / {arr.length}</span>
                                    <span className={`text-[10px] tabular-nums font-medium ${over ? "text-red-400" : len > 240 ? "text-amber-400" : "text-black/[0.35] dark:text-white/[0.35]"}`}>
                                      {len} / 280
                                    </span>
                                  </div>
                                  <p className="text-sm text-black/[0.75] dark:text-[#ccc] leading-relaxed whitespace-pre-wrap">{tweet}</p>
                                  {over && (
                                    <p className="text-[10px] text-red-400">⚠ {len - 280} characters over limit</p>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        ) : viewMode === "rendered" ? (
                          <div
                            className="text-sm text-black/75 dark:text-[#ccc] leading-relaxed [&_h1]:text-black/90 dark:[&_h1]:text-white [&_h1]:text-xl [&_h1]:font-bold [&_h1]:mb-3 [&_h1]:mt-5 [&_h2]:text-black/90 dark:[&_h2]:text-white [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:mb-2 [&_h2]:mt-4 [&_h3]:text-black/85 dark:[&_h3]:text-[#ddd] [&_h3]:font-semibold [&_h3]:mb-2 [&_h3]:mt-3 [&_p]:mb-3 [&_ul]:mb-3 [&_ul]:pl-5 [&_li]:mb-1 [&_li]:list-disc [&_strong]:text-black/90 dark:[&_strong]:text-white [&_em]:italic [&_code]:font-mono [&_code]:text-[#9cdcfe] [&_code]:bg-black/[0.06] dark:[&_code]:bg-[#1e1e1e] [&_code]:px-1 [&_code]:rounded [&_hr]:border-black/[0.12] dark:[&_hr]:border-white/[0.12] [&_hr]:my-4"
                            dangerouslySetInnerHTML={{ __html: renderMarkdown(displayDraft) }}
                          />
                        ) : (
                          <pre className="text-sm text-black/[0.75] dark:text-[#ccc] whitespace-pre-wrap font-sans leading-relaxed">
                            {displayDraft || (isRevising ? "Writing…" : isStreaming ? "Starting…" : "")}
                          </pre>
                        )}
                      </div>

                      {/* Feedback (only when done, not while streaming) */}
                      {isDone && (
                        <div className="border-t border-black/[0.06] dark:border-white/[0.05] px-5 py-4 space-y-3">
                          <p className="text-[11px] text-black/[0.35] dark:text-white/[0.35] font-medium uppercase tracking-widest">Refine this draft</p>
                          <textarea
                            value={feedback}
                            onChange={(e) => setFeedbackMap((prev) => ({ ...prev, [job.id]: e.target.value }))}
                            placeholder='Describe what to change — e.g. "Make the intro punchier" or "Remove the third bullet and add a closing question"'
                            rows={3}
                            disabled={isRevising}
                            className="w-full bg-black/[0.04] dark:bg-[#111] border border-black/[0.10] dark:border-[#2a2a2a] focus:border-black/[0.22] dark:focus:border-white/[0.22] rounded-lg px-3 py-2.5 text-sm text-black/90 dark:text-white placeholder-black/[0.23] dark:placeholder-white/[0.23] resize-none focus:outline-none transition-colors disabled:opacity-50"
                          />
                          <div className="flex items-center gap-3">
                            <button
                              onClick={() => applyFeedback(job)}
                              disabled={!feedback.trim() || isRevising}
                              className="bg-white text-black text-xs font-medium px-4 py-2 rounded-lg hover:bg-black/[0.08] dark:hover:bg-white/90 transition-colors disabled:opacity-40"
                            >
                              {isRevising ? "Applying…" : "Apply edits"}
                            </button>
                            {feedback.trim() && !isRevising && (
                              <button
                                onClick={() => setFeedbackMap((prev) => { const n = { ...prev }; delete n[job.id]; return n; })}
                                className="text-black/[0.35] dark:text-white/[0.35] text-xs hover:text-black/55 dark:hover:text-white/55 transition-colors"
                              >
                                Clear
                              </button>
                            )}
                          </div>
                        </div>
                      )}
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
