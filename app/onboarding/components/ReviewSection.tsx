import React from "react";

export default function ReviewSection({
  title,
  onEdit,
  empty,
  emptyLabel,
  children,
}: {
  title: string;
  onEdit: () => void;
  empty?: boolean;
  emptyLabel?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-black/[0.02] dark:bg-white/[0.02] border border-black/[0.08] dark:border-white/[0.07] rounded-xl px-5 py-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-[13px] font-semibold text-black/70 dark:text-white/60">{title}</h3>
        <button
          type="button"
          onClick={onEdit}
          className="text-[11px] text-black/35 dark:text-white/25 hover:text-black/60 dark:hover:text-white/50 transition-colors"
        >
          Edit &rarr;
        </button>
      </div>
      {empty ? (
        <p className="text-[12px] text-black/25 dark:text-white/15 italic">{emptyLabel}</p>
      ) : (
        children
      )}
    </div>
  );
}
