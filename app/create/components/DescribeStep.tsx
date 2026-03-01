"use client";

import { CONTENT_TYPE_LABELS, GROUP_COLORS, getGroupForType } from "@/lib/content-types";
import type { SavedBrief, QueuedJob, Template } from "../types";
import { GradeBadgeCompact } from "./GradeBadge";
import type { BriefGrade } from "../types";

function timeAgo(iso: string) {
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 60) return `${secs}s ago`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return `${Math.floor(secs / 86400)}d ago`;
}

function extractGrade(brief: SavedBrief): BriefGrade | null {
  if (brief.briefGrade && brief.briefGrade !== "") return brief.briefGrade as BriefGrade;
  try {
    const parsed = JSON.parse(brief.brief);
    if (parsed.briefGrade) return parsed.briefGrade as BriefGrade;
  } catch { /* ignore */ }
  return null;
}

interface Props {
  description: string;
  onDescriptionChange: (v: string) => void;
  onAnalyze: () => void;
  templates: Template[];
  onApplyTemplate: (t: Template) => void;
  savedBriefs: SavedBrief[];
  onEditSavedBrief: (b: SavedBrief) => void;
  onDeleteSavedBrief: (id: number) => void;
  onSendSavedBrief: (id: number) => void;
  queuedJobs: QueuedJob[];
  onDeleteQueuedJob: (id: number) => void;
  onOpenGhostwriter: () => void;
}

export default function DescribeStep({
  description,
  onDescriptionChange,
  onAnalyze,
  templates,
  onApplyTemplate,
  savedBriefs,
  onEditSavedBrief,
  onDeleteSavedBrief,
  onSendSavedBrief,
  queuedJobs,
  onDeleteQueuedJob,
  onOpenGhostwriter,
}: Props) {
  return (
    <div className="space-y-8">
      {/* Compact input with gradient glow */}
      <div className="relative">
        <div className="absolute -inset-[1px] rounded-2xl bg-gradient-to-br from-white/[0.15] via-white/[0.05] to-white/[0.12] dark:from-white/[0.08] dark:via-white/[0.02] dark:to-white/[0.06] pointer-events-none" />
        <div className="absolute -inset-[1px] rounded-2xl opacity-50 blur-sm bg-gradient-to-r from-blue-500/[0.08] via-purple-500/[0.06] to-blue-500/[0.08] dark:from-blue-400/[0.10] dark:via-purple-400/[0.08] dark:to-blue-400/[0.10] pointer-events-none animate-pulse" style={{ animationDuration: "4s" }} />
        <div className="relative bg-white dark:bg-[#0e0e0e] rounded-2xl p-5 space-y-3">
          <textarea
            value={description}
            onChange={(e) => onDescriptionChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && description.trim().length >= 5) {
                e.preventDefault();
                onAnalyze();
              }
            }}
            placeholder="What do you want to write?"
            className="w-full bg-transparent text-sm text-black/90 dark:text-white placeholder-black/[0.30] dark:placeholder-white/[0.25] focus:outline-none resize-none"
            rows={description.trim() ? 5 : 2}
            autoFocus
          />
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {templates.length > 0 && (
                <div className="flex items-center gap-1.5">
                  {templates.slice(0, 3).map((t) => {
                    const group = getGroupForType(t.contentType);
                    const tint = group ? GROUP_COLORS[group] : undefined;
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => onApplyTemplate(t)}
                        className="text-[10px] px-2 py-0.5 rounded-md border transition-colors"
                        style={{
                          borderColor: tint ? tint + "33" : undefined,
                          color: tint || undefined,
                        }}
                      >
                        {t.name}
                      </button>
                    );
                  })}
                  {templates.length > 3 && (
                    <span className="text-[10px] text-black/[0.22] dark:text-white/[0.22]">+{templates.length - 3}</span>
                  )}
                </div>
              )}
              <span className="text-[10px] text-black/[0.18] dark:text-white/[0.18]">Cmd+Enter</span>
            </div>
            <button
              type="button"
              onClick={onAnalyze}
              disabled={description.trim().length < 5}
              className="px-4 py-1.5 bg-black/[0.88] text-white dark:bg-white dark:text-black text-xs font-medium rounded-lg hover:bg-black/75 dark:hover:bg-white/90 transition-colors disabled:opacity-20 disabled:cursor-not-allowed"
            >
              Continue &rarr;
            </button>
          </div>
        </div>
      </div>

      {/* Saved ideas mosaic */}
      {savedBriefs.length > 0 && (
        <div className="space-y-3">
          <p className="text-[11px] text-black/[0.28] dark:text-white/[0.28] uppercase tracking-widest font-semibold">
            Saved ideas
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {savedBriefs.map((brief) => {
              const grade = extractGrade(brief);
              return (
                <div
                  key={brief.id}
                  className="group relative bg-black/[0.03] dark:bg-[#111] border border-black/[0.07] dark:border-white/[0.06] rounded-xl p-4 hover:border-black/[0.14] dark:hover:border-white/[0.12] transition-colors"
                >
                  <div className="space-y-2 min-h-[72px]">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-medium text-black/[0.28] dark:text-white/[0.28] bg-black/[0.05] dark:bg-white/[0.05] rounded px-1.5 py-0.5">
                        {CONTENT_TYPE_LABELS[brief.contentType] ?? brief.contentType}
                      </span>
                      {grade && <GradeBadgeCompact grade={grade} />}
                    </div>
                    <p className="text-sm font-medium text-black/[0.80] dark:text-white/[0.80] line-clamp-2 leading-snug">
                      {brief.title || brief.topic || "Untitled"}
                    </p>
                    {brief.summaryText && (
                      <p className="text-[11px] text-black/[0.35] dark:text-white/[0.35] line-clamp-2 leading-relaxed">
                        {brief.summaryText}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center justify-between mt-3 pt-3 border-t border-black/[0.05] dark:border-white/[0.04]">
                    <span className="text-[10px] text-black/[0.22] dark:text-white/[0.22]">
                      {timeAgo(brief.updatedAt || brief.createdAt)}
                    </span>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button type="button" onClick={() => onEditSavedBrief(brief)} className="w-7 h-7 flex items-center justify-center rounded-md text-black/[0.30] dark:text-white/[0.30] hover:text-black/90 dark:hover:text-white hover:bg-black/[0.06] dark:hover:bg-white/[0.06] transition-colors" title="Edit">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                      </button>
                      <button type="button" onClick={() => onDeleteSavedBrief(brief.id)} className="w-7 h-7 flex items-center justify-center rounded-md text-black/[0.30] dark:text-white/[0.30] hover:text-red-500 dark:hover:text-red-400 hover:bg-red-500/[0.06] transition-colors" title="Delete">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                      </button>
                      <button type="button" onClick={() => onSendSavedBrief(brief.id)} className="w-7 h-7 flex items-center justify-center rounded-md text-black/[0.30] dark:text-white/[0.30] hover:text-black/90 dark:hover:text-white hover:bg-black/[0.06] dark:hover:bg-white/[0.06] transition-colors" title="Send to Ghostwriter">
                        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-2-3.5l6-4.5-6-4.5v9z" /></svg>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Queued jobs */}
      {queuedJobs.length > 0 && (
        <div className="space-y-2">
          <p className="text-[11px] text-black/[0.28] dark:text-white/[0.28] uppercase tracking-widest font-semibold">Queued</p>
          {queuedJobs.map((job) => (
            <div key={job.id} className="flex items-center justify-between gap-3 bg-black/[0.03] dark:bg-[#111] border border-black/[0.06] dark:border-white/[0.05] rounded-xl px-4 py-2.5">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-[10px] font-medium text-black/[0.28] dark:text-white/[0.28] bg-black/[0.05] dark:bg-white/[0.05] rounded px-1.5 py-0.5 shrink-0">
                  {CONTENT_TYPE_LABELS[job.contentType] ?? job.contentType}
                </span>
                <span className="text-xs text-black/[0.55] dark:text-white/[0.55] truncate">
                  {job.title || job.topic}
                </span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button type="button" onClick={onOpenGhostwriter} className="text-[10px] text-black/[0.55] dark:text-white/[0.55] hover:text-black/90 dark:hover:text-white transition-colors">
                  Open &rarr;
                </button>
                <button type="button" onClick={() => onDeleteQueuedJob(job.id)} className="text-[10px] text-black/[0.22] dark:text-white/[0.22] hover:text-red-500 dark:hover:text-red-400 transition-colors">
                  &#10005;
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
