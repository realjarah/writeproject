"use client";

import { CONTENT_TYPE_LABELS, CONTENT_TYPE_GROUPS, GROUP_COLORS, getGroupForType } from "@/lib/content-types";
import type { IntakeResult, SubVoiceStatus, GradeResult, CustomType } from "../types";
import GradeBadge from "./GradeBadge";

interface Props {
  intake: IntakeResult;
  overrideType: string | null;
  onOverrideType: (type: string) => void;
  customTypes: CustomType[];
  subVoiceStatus: SubVoiceStatus;
  gradeResult: GradeResult;
  onContinue: () => void;
}

export default function CategoryStep({
  intake,
  overrideType,
  onOverrideType,
  customTypes,
  subVoiceStatus,
  gradeResult,
  onContinue,
}: Props) {
  const activeType = overrideType ?? intake.contentType ?? "blog";
  const activeGroup = getGroupForType(activeType);
  const groupColor = activeGroup ? GROUP_COLORS[activeGroup] : "#888";

  return (
    <div className="space-y-6">
      {/* Grade badge */}
      <GradeBadge result={gradeResult} />

      {/* Detected type display */}
      <div className="space-y-1">
        <p className="text-sm text-black/[0.55] dark:text-white/[0.55]">
          We detected:{" "}
          <span className="font-semibold text-black/90 dark:text-white">
            {CONTENT_TYPE_LABELS[activeType] ?? activeType}
          </span>
        </p>
        {activeGroup && (
          <span
            className="inline-block text-[10px] font-bold px-2 py-0.5 rounded"
            style={{ color: groupColor, backgroundColor: groupColor + "22" }}
          >
            {activeGroup}
          </span>
        )}
      </div>

      {/* Type override — chip grid */}
      <div className="space-y-3">
        <p className="text-[11px] text-black/[0.35] dark:text-white/[0.35] uppercase tracking-wide font-medium">
          Change type
        </p>
        {CONTENT_TYPE_GROUPS.map((group) => {
          const gColor = GROUP_COLORS[group.label] ?? "#888";
          return (
            <div key={group.label} className="space-y-1.5">
              <p className="text-[10px] font-medium text-black/[0.28] dark:text-white/[0.28]">
                {group.label}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {group.types.map((type) => {
                  const isActive = type === activeType;
                  return (
                    <button
                      key={type}
                      type="button"
                      onClick={() => onOverrideType(type)}
                      className={`text-[11px] px-2.5 py-1 rounded-lg border transition-all ${
                        isActive
                          ? "font-medium"
                          : "border-black/[0.07] dark:border-white/[0.06] text-black/[0.45] dark:text-white/[0.40] hover:border-black/[0.15] dark:hover:border-white/[0.15] hover:text-black/70 dark:hover:text-white/70"
                      }`}
                      style={isActive ? { borderColor: gColor, color: gColor, backgroundColor: gColor + "11" } : undefined}
                    >
                      {CONTENT_TYPE_LABELS[type]}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}

        {/* Custom types */}
        {customTypes.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-[10px] font-medium text-black/[0.28] dark:text-white/[0.28]">
              My Custom Types
            </p>
            <div className="flex flex-wrap gap-1.5">
              {customTypes.map((ct) => {
                const isActive = ct.slug === activeType;
                return (
                  <button
                    key={ct.slug}
                    type="button"
                    onClick={() => onOverrideType(ct.slug)}
                    className={`text-[11px] px-2.5 py-1 rounded-lg border transition-all ${
                      isActive
                        ? "border-black dark:border-white text-black/90 dark:text-white bg-black/[0.07] dark:bg-[#1e1e1e] font-medium"
                        : "border-black/[0.07] dark:border-white/[0.06] text-black/[0.45] dark:text-white/[0.40] hover:border-black/[0.15] dark:hover:border-white/[0.15] hover:text-black/70 dark:hover:text-white/70"
                    }`}
                  >
                    {ct.name}{ct.sampleCount === 0 ? " (no examples)" : ""}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Sub-voice status panel */}
      <div className="bg-black/[0.03] dark:bg-[#111] border border-black/[0.07] dark:border-white/[0.06] rounded-xl p-4 space-y-1.5">
        <p className="text-[11px] text-black/[0.35] dark:text-white/[0.35] uppercase tracking-wide font-medium">
          Voice Status
        </p>
        {!subVoiceStatus.hasProfile ? (
          <p className="text-sm text-black/[0.55] dark:text-white/[0.55]">
            No voice profile yet.{" "}
            <a href="/voice" className="text-blue-500 hover:text-blue-400 transition-colors">
              Set up your voice &rarr;
            </a>
          </p>
        ) : subVoiceStatus.subVoiceAvailable ? (
          <div className="space-y-1">
            <p className="text-sm text-emerald-500">
              Your <span className="font-semibold">{CONTENT_TYPE_LABELS[activeType] ?? activeType}</span> voice is active
            </p>
            {subVoiceStatus.subVoiceSummary && (
              <p className="text-[11px] text-black/[0.40] dark:text-white/[0.40] line-clamp-2">
                {subVoiceStatus.subVoiceSummary}
              </p>
            )}
          </div>
        ) : (
          <p className="text-sm text-black/[0.55] dark:text-white/[0.55]">
            Your voice profile is active, but no{" "}
            <span className="font-semibold">{CONTENT_TYPE_LABELS[activeType] ?? activeType}</span>{" "}
            sub-voice trained. The ghost will use your general voice.
          </p>
        )}
      </div>

      {/* Continue */}
      <button
        type="button"
        onClick={onContinue}
        className="px-5 py-2.5 bg-black/[0.88] text-white dark:bg-white dark:text-black text-sm font-medium rounded-xl hover:bg-black/75 dark:hover:bg-white/90 transition-colors"
      >
        Continue &rarr;
      </button>
    </div>
  );
}
