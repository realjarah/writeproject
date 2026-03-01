"use client";

import { useState } from "react";
import { CONTENT_TYPE_LABELS, GROUP_COLORS, getGroupForType } from "@/lib/content-types";
import { extractTemplateBrief, defaultTemplateName, type TemplateBrief } from "@/lib/template-utils";
import type { BriefState, IntakeResult, Signature, SubVoiceStatus, GradeResult, Step } from "../types";
import GradeBadge from "./GradeBadge";

interface Props {
  briefState: BriefState;
  intake: IntakeResult;
  overrideType: string | null;
  signatures: Signature[];
  subVoiceStatus: SubVoiceStatus;
  gradeResult: GradeResult;
  sending: boolean;
  error: string;
  onJumpToStep: (step: Step) => void;
  onSendToGhostwriter: () => void;
  onSaveForLater: () => void;
  onSaveTemplate: (name: string) => void;
}

export default function BriefReview({
  briefState,
  intake,
  overrideType,
  signatures,
  subVoiceStatus,
  gradeResult,
  sending,
  error,
  onJumpToStep,
  onSendToGhostwriter,
  onSaveForLater,
  onSaveTemplate,
}: Props) {
  const [showTemplateInput, setShowTemplateInput] = useState(false);
  const [templateName, setTemplateName] = useState("");

  const activeType = overrideType ?? intake.contentType ?? "blog";
  const group = getGroupForType(activeType);
  const groupColor = group ? GROUP_COLORS[group] : "#888";

  const topic = intake.topic ?? briefState.answers.topic ?? "";
  const angle = intake.angle ?? briefState.answers.angle ?? "";
  const keyPoints = intake.keyPoints ?? briefState.answers.keyPoints ?? "";
  const targetAudience = intake.targetAudience ?? briefState.answers.targetAudience ?? "";
  const toneNotes = intake.toneNotes ?? briefState.answers.toneNotes ?? "";
  const selectedSig = signatures.find((s) => s.id === briefState.selectedSigId) ?? null;

  const editBtn = (step: Step) => (
    <button
      type="button"
      onClick={() => onJumpToStep(step)}
      className="w-6 h-6 flex items-center justify-center rounded text-black/[0.22] dark:text-white/[0.22] hover:text-black/55 dark:hover:text-white/55 hover:bg-black/[0.04] dark:hover:bg-white/[0.04] transition-colors"
    >
      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
      </svg>
    </button>
  );

  return (
    <div className="max-w-2xl mx-auto">
      {/* Document-styled card */}
      <div className="bg-white dark:bg-[#0e0e0e] border border-black/[0.09] dark:border-white/[0.07] rounded-2xl shadow-sm overflow-hidden">
        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-black/[0.06] dark:border-white/[0.05] space-y-4">
          <GradeBadge result={gradeResult} />

          <div className="flex items-center gap-2 flex-wrap">
            <span
              className="text-[10px] font-bold px-2 py-0.5 rounded"
              style={{ color: groupColor, backgroundColor: groupColor + "22" }}
            >
              {CONTENT_TYPE_LABELS[activeType] ?? activeType}
            </span>
            {subVoiceStatus.subVoiceAvailable && (
              <span className="text-[10px] text-emerald-500 font-medium">
                &#10003; Voice trained
              </span>
            )}
          </div>

          <h2 className="text-lg font-semibold text-black/90 dark:text-white leading-snug">
            {briefState.titleInput.trim() || (
              <span className="text-black/[0.28] dark:text-white/[0.28] font-normal italic">
                Title will be chosen by the ghost
              </span>
            )}
          </h2>
        </div>

        {/* Brief fields */}
        <div className="px-6 py-4 space-y-4">
          {topic && (
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[10px] text-black/[0.35] dark:text-white/[0.35] uppercase tracking-wide font-medium mb-0.5">Topic</p>
                <p className="text-sm text-black/[0.75] dark:text-white/[0.75]">{topic}</p>
              </div>
              {editBtn("details")}
            </div>
          )}
          {angle && (
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[10px] text-black/[0.35] dark:text-white/[0.35] uppercase tracking-wide font-medium mb-0.5">Angle</p>
                <p className="text-sm text-black/[0.75] dark:text-white/[0.75] whitespace-pre-wrap">{angle}</p>
              </div>
              {editBtn("details")}
            </div>
          )}
          {keyPoints && (
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[10px] text-black/[0.35] dark:text-white/[0.35] uppercase tracking-wide font-medium mb-0.5">Key Points</p>
                <p className="text-sm text-black/[0.75] dark:text-white/[0.75] whitespace-pre-wrap">{keyPoints}</p>
              </div>
              {editBtn("details")}
            </div>
          )}
          {targetAudience && (
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[10px] text-black/[0.35] dark:text-white/[0.35] uppercase tracking-wide font-medium mb-0.5">Audience</p>
                <p className="text-sm text-black/[0.75] dark:text-white/[0.75]">{targetAudience}</p>
              </div>
              {editBtn("details")}
            </div>
          )}
          {toneNotes && (
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[10px] text-black/[0.35] dark:text-white/[0.35] uppercase tracking-wide font-medium mb-0.5">Tone</p>
                <p className="text-sm text-black/[0.75] dark:text-white/[0.75]">{toneNotes}</p>
              </div>
              {editBtn("details")}
            </div>
          )}
          {briefState.wordCountTarget && (
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[10px] text-black/[0.35] dark:text-white/[0.35] uppercase tracking-wide font-medium mb-0.5">Target Length</p>
                <p className="text-sm text-black/[0.75] dark:text-white/[0.75]">{briefState.wordCountTarget}</p>
              </div>
              {editBtn("details")}
            </div>
          )}
        </div>

        {/* Context & materials */}
        {(briefState.contextItems.length > 0 || briefState.draftText.trim() || briefState.draftData) && (
          <div className="px-6 py-4 border-t border-black/[0.06] dark:border-white/[0.05]">
            <div className="flex items-center justify-between">
              <p className="text-[10px] text-black/[0.35] dark:text-white/[0.35] uppercase tracking-wide font-medium">
                Context &amp; materials
                <span className="ml-1.5 normal-case font-normal">
                  {briefState.contextItems.length} item{briefState.contextItems.length !== 1 ? "s" : ""}
                  {(briefState.draftText.trim() || briefState.draftData) ? " + starting draft" : ""}
                </span>
              </p>
              {editBtn("context")}
            </div>
          </div>
        )}

        {/* Signature */}
        {selectedSig && (
          <div className="px-6 py-4 border-t border-black/[0.06] dark:border-white/[0.05]">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] text-black/[0.35] dark:text-white/[0.35] uppercase tracking-wide font-medium mb-0.5">Signature</p>
                <p className="text-sm text-black/[0.55] dark:text-white/[0.55]">{selectedSig.name}</p>
              </div>
              {editBtn("context")}
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="px-6 py-3">
            <p className="text-xs text-red-400">{error}</p>
          </div>
        )}

        {/* Action buttons */}
        <div className="px-6 py-5 border-t border-black/[0.06] dark:border-white/[0.05] space-y-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onSendToGhostwriter}
              disabled={sending}
              className="flex-1 py-3 bg-black/[0.88] text-white dark:bg-white dark:text-black text-sm font-medium rounded-xl hover:bg-black/75 dark:hover:bg-white/90 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              {sending ? "Sending\u2026" : "Send to Ghostwriter \u2192"}
            </button>
            <button
              type="button"
              onClick={onSaveForLater}
              disabled={sending}
              className="py-3 px-5 bg-transparent text-black/[0.55] dark:text-white/[0.55] border border-black/[0.12] dark:border-white/[0.12] text-sm font-medium rounded-xl hover:text-black/90 dark:hover:text-white hover:border-black/[0.21] dark:hover:border-white/[0.22] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              Save for later
            </button>
            <button
              type="button"
              onClick={() => {
                setTemplateName("");
                setShowTemplateInput(true);
              }}
              className="py-3 px-5 bg-transparent text-black/[0.40] dark:text-white/[0.40] border border-black/[0.09] dark:border-white/[0.07] text-sm rounded-xl hover:text-black/90 dark:hover:text-white hover:border-black/[0.21] dark:hover:border-white/[0.22] transition-colors"
            >
              Save as Template
            </button>
          </div>

          {showTemplateInput && (
            <div className="flex items-center gap-3">
              <input
                type="text"
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                placeholder="Template name"
                className="flex-1 bg-black/[0.04] dark:bg-[#111] border border-black/[0.10] dark:border-[#2a2a2a] rounded-lg px-3 py-2 text-sm text-black/90 dark:text-white placeholder-black/[0.23] dark:placeholder-white/[0.23] focus:outline-none focus:border-black/[0.22] dark:focus:border-white/[0.22]"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Escape") setShowTemplateInput(false);
                  if (e.key === "Enter" && templateName.trim()) {
                    onSaveTemplate(templateName.trim());
                    setShowTemplateInput(false);
                  }
                }}
              />
              <button
                type="button"
                onClick={() => {
                  if (templateName.trim()) {
                    onSaveTemplate(templateName.trim());
                    setShowTemplateInput(false);
                  }
                }}
                disabled={!templateName.trim()}
                className="bg-black/[0.88] text-white dark:bg-white dark:text-black text-sm font-medium px-4 py-2 rounded-xl hover:bg-black/75 dark:hover:bg-white/90 transition-colors disabled:opacity-40"
              >
                Save Template
              </button>
              <button
                type="button"
                onClick={() => setShowTemplateInput(false)}
                className="text-sm text-black/[0.35] dark:text-white/[0.35] hover:text-black/55 dark:hover:text-white/55"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
