"use client";

import { useState, useEffect, useCallback } from "react";
import { CONTENT_TYPE_LABELS } from "@/lib/content-types";

interface HistoryItem {
  id: number;
  contentType: string;
  topic: string;
  content: string;
  createdAt: string;
}

export default function HistoryPage() {
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [copied, setCopied] = useState<number | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/history");
    setItems(await res.json());
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function deleteItem(id: number) {
    await fetch("/api/history", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    load();
  }

  async function copy(id: number, content: string) {
    await navigator.clipboard.writeText(content);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-black/90 dark:text-white">History</h1>
        <p className="text-black/[0.40] dark:text-white/[0.40] text-sm mt-1">
          All your generated pieces.
        </p>
      </div>

      {items.length === 0 ? (
        <div className="text-center py-20 text-black/[0.28] dark:text-white/[0.28] text-sm">
          Nothing generated yet. Head to Create to write your first piece.
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <div
              key={item.id}
              className="bg-black/[0.04] dark:bg-[#161616] border border-black/[0.09] dark:border-white/[0.07] rounded-xl overflow-hidden"
            >
              <div
                className="px-5 py-4 flex items-center justify-between gap-4 cursor-pointer hover:bg-black/[0.06] hover:dark:bg-[#1a1a1a] transition-colors"
                onClick={() =>
                  setExpanded(expanded === item.id ? null : item.id)
                }
              >
                <div className="space-y-0.5 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-black/[0.35] dark:text-white/[0.35] bg-black/[0.08] dark:bg-[#222] px-2 py-0.5 rounded-md">
                      {CONTENT_TYPE_LABELS[item.contentType] ?? item.contentType}
                    </span>
                    <span className="text-xs text-black/[0.35] dark:text-white/[0.35]">
                      {new Date(item.createdAt).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </span>
                  </div>
                  <div className="font-medium text-black/90 dark:text-white text-sm truncate">
                    {item.topic}
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      copy(item.id, item.content);
                    }}
                    className="text-xs text-black/[0.35] dark:text-white/[0.35] hover:text-black/68 dark:hover:text-white/68 transition-colors"
                  >
                    {copied === item.id ? "Copied!" : "Copy"}
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteItem(item.id);
                    }}
                    className="text-xs text-black/[0.28] dark:text-white/[0.28] hover:text-red-500 dark:hover:text-red-400 transition-colors"
                  >
                    Delete
                  </button>
                  <span className="text-black/[0.28] dark:text-white/[0.28] text-xs">
                    {expanded === item.id ? "▲" : "▼"}
                  </span>
                </div>
              </div>

              {expanded === item.id && (
                <div className="border-t border-black/[0.06] dark:border-white/[0.05] px-5 py-4">
                  <pre className="text-sm text-black/[0.75] dark:text-[#ccc] whitespace-pre-wrap font-sans leading-relaxed">
                    {item.content}
                  </pre>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
