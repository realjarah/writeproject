"use client";

import React from "react";

export default function Collapsible({
  label,
  badge,
  open,
  onToggle,
  children,
}: {
  label: string;
  badge?: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="border border-black/[0.09] dark:border-white/[0.07] rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-3 bg-black/[0.04] dark:bg-[#161616] hover:bg-black/[0.06] dark:hover:bg-[#1a1a1a] transition-colors text-left"
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-black/90 dark:text-white">{label}</span>
          {badge && <span className="text-xs text-black/[0.35] dark:text-white/[0.35]">{badge}</span>}
        </div>
        <svg
          className={`w-4 h-4 text-black/[0.28] dark:text-white/[0.28] transition-transform ${open ? "rotate-180" : ""}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="bg-black/[0.04] dark:bg-[#111] border-t border-black/[0.06] dark:border-white/[0.05] p-4">
          {children}
        </div>
      )}
    </div>
  );
}
