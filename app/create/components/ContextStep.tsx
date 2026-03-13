"use client";

import { useState, useRef } from "react";
import { type ContextItem, type ContextItemTag } from "@/lib/content-types";
import type { IntakeResult, BriefUpdater, Signature, GradeResult } from "../types";
import GradeBadge from "./GradeBadge";

type SourceType = "url" | "file" | "text" | "research";

const TAGS: { value: ContextItemTag; label: string; color: string }[] = [
  { value: "data",      label: "Data",      color: "#facc15" },
  { value: "research",  label: "Research",  color: "#a78bfa" },
  { value: "example",   label: "Example",   color: "#60a5fa" },
  { value: "reference", label: "Reference", color: "#9ca3af" },
  { value: "note",      label: "Note",      color: "#fb923c" },
];

function tagMeta(tag: ContextItemTag) {
  return TAGS.find((t) => t.value === tag) ?? TAGS[3];
}

const SIZE_LIMITS: Record<string, number> = {
  image: 5 * 1024 * 1024,
  pdf: 45 * 1024 * 1024,
  docx: 15 * 1024 * 1024,
  text: 50 * 1024,
};

function fileKind(name: string): "image" | "pdf" | "docx" | "text" {
  if (/\.(png|jpe?g|gif|webp)$/i.test(name)) return "image";
  if (/\.pdf$/i.test(name)) return "pdf";
  if (/\.docx$/i.test(name)) return "docx";
  return "text";
}

interface Props {
  intake: IntakeResult;
  overrideType: string | null;
  contextItems: ContextItem[];
  draftText: string;
  draftFileName: string;
  draftData: string;
  draftMediaType: string;
  signatures: Signature[];
  selectedSigId: number | null;
  onUpdate: BriefUpdater;
  gradeResult: GradeResult;
  onContinue: () => void;
}

export default function ContextStep({
  intake,
  overrideType,
  contextItems,
  draftText,
  draftFileName,
  draftData,
  draftMediaType,
  signatures,
  selectedSigId,
  onUpdate,
  gradeResult,
  onContinue,
}: Props) {
  // Add-item form state
  const [showAddForm, setShowAddForm] = useState(false);
  const [sourceType, setSourceType] = useState<SourceType>("url");
  const [newTag, setNewTag] = useState<ContextItemTag>("reference");
  const [newUrl, setNewUrl] = useState("");
  const [newText, setNewText] = useState("");
  const [newFileName, setNewFileName] = useState("");
  const [newFileContent, setNewFileContent] = useState("");
  const [newData, setNewData] = useState("");
  const [newMediaType, setNewMediaType] = useState("");
  const [newIsCSV, setNewIsCSV] = useState(false);
  const [newIncludePlaceholders, setNewIncludePlaceholders] = useState(false);
  const [newInstructions, setNewInstructions] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const draftFileRef = useRef<HTMLInputElement>(null);
  const [researchPrompt, setResearchPrompt] = useState("");
  const [researching, setResearching] = useState(false);
  const [researchError, setResearchError] = useState("");

  function resetAddForm() {
    setSourceType("url");
    setNewTag("reference");
    setNewUrl("");
    setNewText("");
    setNewFileName("");
    setNewFileContent("");
    setNewData("");
    setNewMediaType("");
    setNewIsCSV(false);
    setNewIncludePlaceholders(false);
    setNewInstructions("");
    setResearchPrompt("");
    setResearching(false);
    setResearchError("");
    setShowAddForm(false);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const kind = fileKind(file.name);
    const limit = SIZE_LIMITS[kind];
    if (file.size > limit) {
      const limitLabel = kind === "image" ? "5MB" : kind === "pdf" ? "45MB" : kind === "docx" ? "15MB" : "50KB";
      alert(`${file.name} is too large. Limit: ${limitLabel}.`);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    const reader = new FileReader();
    if (kind === "image" || kind === "pdf") {
      reader.onload = (ev) => {
        const dataUrl = ev.target?.result as string;
        const [header, base64] = dataUrl.split(",");
        const mime = header.match(/data:([^;]+)/)?.[1] ?? (kind === "pdf" ? "application/pdf" : "image/jpeg");
        setNewFileName(file.name);
        setNewData(base64);
        setNewMediaType(mime);
        if (kind === "image" && newTag === "reference") setNewTag("example");
        if (kind === "pdf" && newTag === "reference") setNewTag("research");
      };
      reader.readAsDataURL(file);
    } else if (kind === "docx") {
      reader.onload = async (ev) => {
        const dataUrl = ev.target?.result as string;
        const [, base64] = dataUrl.split(",");
        try {
          const res = await fetch("/api/voice/import-docx", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ data: base64 }),
          });
          const result = await res.json();
          if (!res.ok || result.error) {
            alert(result.error || "Could not extract text from this document.");
            return;
          }
          setNewFileName(file.name);
          setNewFileContent(result.text);
          setNewIsCSV(false);
          if (newTag === "reference") setNewTag("research");
        } catch {
          alert("Failed to process DOCX file. Please try again.");
        }
      };
      reader.readAsDataURL(file);
    } else {
      const isCSV = file.name.toLowerCase().endsWith(".csv");
      reader.onload = (ev) => {
        setNewFileName(file.name);
        setNewFileContent(ev.target?.result as string);
        setNewIsCSV(isCSV);
        if (isCSV) setNewTag("data");
      };
      reader.readAsText(file);
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handleDraftFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const kind = fileKind(file.name);
    if (kind === "image") {
      alert("Draft files must be text (.txt, .md), DOCX, or PDF.");
      if (draftFileRef.current) draftFileRef.current.value = "";
      return;
    }
    const limit = kind === "pdf" ? SIZE_LIMITS.pdf : kind === "docx" ? SIZE_LIMITS.docx : SIZE_LIMITS.text;
    if (file.size > limit) {
      const limitLabel = kind === "pdf" ? "45MB" : kind === "docx" ? "15MB" : "50KB";
      alert(`File too large. Max ${limitLabel}.`);
      if (draftFileRef.current) draftFileRef.current.value = "";
      return;
    }
    const reader = new FileReader();
    if (kind === "pdf") {
      reader.onload = (ev) => {
        const dataUrl = ev.target?.result as string;
        const [header, base64] = dataUrl.split(",");
        const mime = header.match(/data:([^;]+)/)?.[1] ?? "application/pdf";
        onUpdate("draftFileName", file.name);
        onUpdate("draftData", base64);
        onUpdate("draftMediaType", mime);
        onUpdate("draftText", "");
      };
      reader.readAsDataURL(file);
    } else if (kind === "docx") {
      reader.onload = async (ev) => {
        const dataUrl = ev.target?.result as string;
        const [, base64] = dataUrl.split(",");
        try {
          const res = await fetch("/api/voice/import-docx", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ data: base64 }),
          });
          const result = await res.json();
          if (!res.ok || result.error) {
            alert(result.error || "Could not extract text from this document.");
            return;
          }
          onUpdate("draftText", result.text);
          onUpdate("draftFileName", file.name);
          onUpdate("draftData", "");
          onUpdate("draftMediaType", "");
        } catch {
          alert("Failed to process DOCX file. Please try again.");
        }
      };
      reader.readAsDataURL(file);
    } else {
      reader.onload = (ev) => {
        onUpdate("draftText", ev.target?.result as string);
        onUpdate("draftFileName", file.name);
        onUpdate("draftData", "");
        onUpdate("draftMediaType", "");
      };
      reader.readAsText(file);
    }
    if (draftFileRef.current) draftFileRef.current.value = "";
  }

  function commitItem() {
    const item: ContextItem = { tag: newTag, instructions: newInstructions.trim() || undefined };
    if (sourceType === "url") {
      if (!newUrl.trim()) return;
      item.url = newUrl.trim();
    } else if (sourceType === "file") {
      if (!newFileName) return;
      item.fileName = newFileName;
      if (newData && newMediaType) {
        item.data = newData;
        item.mediaType = newMediaType;
      } else {
        item.text = newFileContent;
        item.isCSV = newIsCSV;
        item.includePlaceholders = newIsCSV ? newIncludePlaceholders : undefined;
      }
    } else {
      if (!newText.trim()) return;
      item.text = newText.trim();
      if (newTag === "data" && newIncludePlaceholders) {
        item.includePlaceholders = true;
      }
    }
    onUpdate("contextItems", [...contextItems, item]);
    resetAddForm();
  }

  function removeItem(i: number) {
    onUpdate("contextItems", contextItems.filter((_, idx) => idx !== i));
  }

  async function runResearch() {
    if (!researchPrompt.trim() || researching) return;
    setResearching(true);
    setResearchError("");
    try {
      const res = await fetch("/api/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: researchPrompt.trim(),
          topic: intake?.topic ?? undefined,
          angle: intake?.angle ?? undefined,
          contentType: overrideType ?? intake?.contentType ?? undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Research failed");
      onUpdate("contextItems", [
        ...contextItems,
        { tag: "research" as const, text: data.brief, instructions: researchPrompt.trim() },
      ]);
      resetAddForm();
    } catch (err) {
      setResearchError(err instanceof Error ? err.message : "Research failed. Please try again.");
    } finally {
      setResearching(false);
    }
  }

  const canCommit =
    sourceType === "url" ? !!newUrl.trim() :
    sourceType === "file" ? !!(newFileContent || newData) :
    sourceType === "research" ? false :
    !!newText.trim();

  return (
    <div className="space-y-6">
      {/* Grade badge */}
      <GradeBadge result={gradeResult} />

      {/* Context items */}
      <div className="space-y-3">
        <p className="text-[11px] text-black/[0.35] dark:text-white/[0.35] uppercase tracking-wide font-medium">
          Context &amp; materials
          <span className="ml-1.5 normal-case font-normal">— optional</span>
        </p>

        {/* Existing items */}
        {contextItems.map((item, i) => {
          const meta = tagMeta(item.tag);
          const label =
            item.url ?? item.fileName ??
            (item.tag === "research" && item.instructions
              ? item.instructions.slice(0, 60) + (item.instructions.length > 60 ? "\u2026" : "")
              : item.text ? item.text.slice(0, 50) + (item.text.length > 50 ? "\u2026" : "") : "item");
          return (
            <div key={i} className="flex items-center justify-between gap-3 py-2 border-b border-black/[0.06] dark:border-white/[0.05]">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ color: meta.color, backgroundColor: meta.color + "22" }}>
                  {meta.label}
                </span>
                <span className="text-xs text-black/[0.40] dark:text-white/[0.40] truncate">{label}</span>
              </div>
              <button type="button" onClick={() => removeItem(i)} className="text-black/[0.28] dark:text-white/[0.28] hover:text-black/55 dark:hover:text-white/55 text-xs shrink-0">&#10005;</button>
            </div>
          );
        })}

        {/* Add form */}
        {showAddForm ? (
          <div className="space-y-3 pt-1">
            {/* Source type */}
            <div className="flex gap-1 flex-wrap">
              {(["url", "file", "text", "research"] as SourceType[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => { setSourceType(t); if (t === "research") setNewTag("research"); }}
                  className={`px-3 py-1 text-xs rounded-md transition-colors ${sourceType === t ? "bg-black/[0.08] dark:bg-[#2a2a2a] text-black/90 dark:text-white" : "text-black/[0.35] dark:text-white/[0.35] hover:text-black/55 dark:hover:text-white/55"}`}
                >
                  {t === "url" ? "URL" : t === "file" ? "File" : t === "text" ? "Text" : "AI Research"}
                </button>
              ))}
            </div>

            {/* Tag selector */}
            <div className={`flex gap-1 flex-wrap ${sourceType === "research" ? "hidden" : ""}`}>
              {TAGS.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setNewTag(t.value)}
                  className={`text-[10px] font-bold px-2 py-0.5 rounded transition-all ${newTag === t.value ? "opacity-100" : "opacity-40 hover:opacity-70"}`}
                  style={{ color: t.color, backgroundColor: t.color + "22" }}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {sourceType === "url" && (
              <input type="url" value={newUrl} onChange={(e) => setNewUrl(e.target.value)} placeholder="https://..." className="w-full bg-black/[0.05] dark:bg-[#0a0a0a] border border-black/[0.10] dark:border-[#2a2a2a] rounded-lg px-3 py-2 text-xs text-black/90 dark:text-white placeholder-black/[0.28] dark:placeholder-white/[0.28] focus:outline-none focus:border-black/[0.22] dark:focus:border-white/[0.22]" />
            )}

            {sourceType === "file" && (
              <div>
                <input ref={fileInputRef} type="file" accept=".txt,.md,.csv,.pdf,.docx,.png,.jpg,.jpeg,.gif,.webp" onChange={handleFileChange} className="hidden" />
                <button type="button" onClick={() => fileInputRef.current?.click()} className="w-full border border-dashed border-black/[0.10] dark:border-[#2a2a2a] rounded-lg py-4 text-xs text-black/[0.35] dark:text-white/[0.35] hover:border-black/[0.17] dark:hover:border-white/[0.17] hover:text-black/55 dark:hover:text-white/55 transition-colors">
                  {newFileName ? newFileName : "Click to choose file"}
                </button>
                {(newIsCSV || newTag === "data") && (
                  <label className="flex items-center gap-2 mt-2 text-xs text-black/[0.40] dark:text-white/[0.40] cursor-pointer">
                    <input type="checkbox" checked={newIncludePlaceholders} onChange={(e) => setNewIncludePlaceholders(e.target.checked)} className="accent-white" />
                    Include chart / table / figure placeholders
                  </label>
                )}
              </div>
            )}

            {sourceType === "text" && (
              <div>
                <textarea value={newText} onChange={(e) => setNewText(e.target.value)} placeholder="Paste text, notes, or data..." rows={4} className="w-full bg-black/[0.05] dark:bg-[#0a0a0a] border border-black/[0.10] dark:border-[#2a2a2a] rounded-lg px-3 py-2 text-xs text-black/90 dark:text-white placeholder-black/[0.28] dark:placeholder-white/[0.28] focus:outline-none focus:border-black/[0.22] dark:focus:border-white/[0.22] resize-none" />
                {newTag === "data" && (
                  <label className="flex items-center gap-2 mt-2 text-xs text-black/[0.40] dark:text-white/[0.40] cursor-pointer">
                    <input type="checkbox" checked={newIncludePlaceholders} onChange={(e) => setNewIncludePlaceholders(e.target.checked)} className="accent-white" />
                    Include chart / table / figure placeholders
                  </label>
                )}
              </div>
            )}

            {sourceType === "research" && (
              <div className="space-y-2">
                <textarea value={researchPrompt} onChange={(e) => setResearchPrompt(e.target.value)} placeholder='Describe what to research — e.g. "Find recent statistics on remote work productivity"' rows={3} className="w-full bg-black/[0.05] dark:bg-[#0a0a0a] border border-black/[0.10] dark:border-[#2a2a2a] rounded-lg px-3 py-2 text-xs text-black/90 dark:text-white placeholder-black/[0.28] dark:placeholder-white/[0.28] focus:outline-none focus:border-black/[0.22] dark:focus:border-white/[0.22] resize-none" autoFocus />
                {researchError && <p className="text-xs text-red-400">{researchError}</p>}
              </div>
            )}

            {sourceType !== "research" && (
              <input type="text" value={newInstructions} onChange={(e) => setNewInstructions(e.target.value)} placeholder="Usage instructions (optional)" className="w-full bg-black/[0.05] dark:bg-[#0a0a0a] border border-black/[0.10] dark:border-[#2a2a2a] rounded-lg px-3 py-2 text-xs text-black/90 dark:text-white placeholder-black/[0.28] dark:placeholder-white/[0.28] focus:outline-none focus:border-black/[0.22] dark:focus:border-white/[0.22]" />
            )}

            <div className="flex gap-2 pt-1">
              {sourceType === "research" ? (
                <>
                  <button type="button" onClick={runResearch} disabled={!researchPrompt.trim() || researching} className="px-3 py-1.5 bg-black/[0.88] text-white dark:bg-white dark:text-black text-xs font-medium rounded-lg hover:bg-black/75 dark:hover:bg-white/90 transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
                    {researching ? "Researching..." : "Research \u2192"}
                  </button>
                  <button type="button" onClick={resetAddForm} disabled={researching} className="px-3 py-1.5 text-xs text-black/[0.35] dark:text-white/[0.35] hover:text-black/90 dark:hover:text-white transition-colors disabled:opacity-30">
                    Cancel
                  </button>
                </>
              ) : (
                <>
                  <button type="button" onClick={commitItem} disabled={!canCommit} className="px-3 py-1.5 bg-black/[0.88] text-white dark:bg-white dark:text-black text-xs font-medium rounded-lg hover:bg-black/75 dark:hover:bg-white/90 transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
                    Add
                  </button>
                  <button type="button" onClick={resetAddForm} className="px-3 py-1.5 text-xs text-black/[0.35] dark:text-white/[0.35] hover:text-black/90 dark:hover:text-white transition-colors">
                    Cancel
                  </button>
                </>
              )}
            </div>
          </div>
        ) : (
          <button type="button" onClick={() => setShowAddForm(true)} className="text-xs text-black/[0.35] dark:text-white/[0.35] hover:text-black/90 dark:hover:text-white transition-colors">
            + Add item
          </button>
        )}
      </div>

      {/* Starting draft */}
      <div className="space-y-3">
        <p className="text-[11px] text-black/[0.35] dark:text-white/[0.35] uppercase tracking-wide font-medium">
          Starting draft
          <span className="ml-1.5 normal-case font-normal">— optional</span>
        </p>
        <textarea
          value={draftText}
          onChange={(e) => {
            onUpdate("draftText", e.target.value);
            onUpdate("draftData", "");
            onUpdate("draftFileName", "");
          }}
          placeholder="Paste a draft, outline, or rough notes..."
          rows={5}
          className="w-full bg-black/[0.05] dark:bg-[#0a0a0a] border border-black/[0.10] dark:border-[#2a2a2a] rounded-lg px-3 py-2 text-xs text-black/90 dark:text-white placeholder-black/[0.28] dark:placeholder-white/[0.28] focus:outline-none focus:border-black/[0.22] dark:focus:border-white/[0.22] resize-none font-mono"
        />
        <div className="flex items-center gap-3">
          <span className="text-xs text-black/[0.28] dark:text-white/[0.28]">or</span>
          <input ref={draftFileRef} type="file" accept=".txt,.md,.pdf,.docx" onChange={handleDraftFileChange} className="hidden" />
          <button type="button" onClick={() => draftFileRef.current?.click()} className="text-xs text-black/[0.35] dark:text-white/[0.35] hover:text-black/90 dark:hover:text-white transition-colors">
            {draftFileName ? `\u{1F4C4} ${draftFileName}` : "Upload .txt, .md, or .pdf"}
          </button>
          {(draftText.trim() || draftData) && (
            <button
              type="button"
              onClick={() => { onUpdate("draftText", ""); onUpdate("draftData", ""); onUpdate("draftFileName", ""); onUpdate("draftMediaType", ""); }}
              className="text-xs text-black/[0.28] dark:text-white/[0.28] hover:text-black/55 dark:hover:text-white/55"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Signature picker */}
      {signatures.length > 0 && (
        <div className="space-y-2">
          <p className="text-[11px] text-black/[0.35] dark:text-white/[0.35] uppercase tracking-wide font-medium">
            Signature
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onUpdate("selectedSigId", null)}
              className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${selectedSigId === null ? "border-black dark:border-white text-black/90 dark:text-white bg-black/[0.07] dark:bg-[#1e1e1e]" : "border-black/[0.09] dark:border-white/[0.07] text-black/[0.35] dark:text-white/[0.35] hover:border-black/[0.14] dark:hover:border-white/[0.14]"}`}
            >
              None
            </button>
            {signatures.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => onUpdate("selectedSigId", s.id)}
                className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${selectedSigId === s.id ? "border-black dark:border-white text-black/90 dark:text-white bg-black/[0.07] dark:bg-[#1e1e1e]" : "border-black/[0.09] dark:border-white/[0.07] text-black/[0.35] dark:text-white/[0.35] hover:border-black/[0.14] dark:hover:border-white/[0.14]"}`}
              >
                {s.name}
              </button>
            ))}
          </div>
        </div>
      )}

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
