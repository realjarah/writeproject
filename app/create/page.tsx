"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { type ContextItem, type ContextItemTag } from "@/lib/claude";

type ContentType = "blog" | "social" | "caption";
type SourceType = "url" | "file" | "text";
type SectionId = "format" | "brief" | "details" | "draft" | "context" | "signature";

interface FormState {
  contentType: ContentType;
  topic: string;
  angle: string;
  keyPoints: string;
  sourcesOrData: string;
  targetAudience: string;
  toneNotes: string;
  wordCountTarget: string;
}

interface Signature {
  id: number;
  name: string;
  content: string;
  isDefault: boolean;
}

const contentTypeOptions: { value: ContentType; label: string; desc: string }[] = [
  { value: "blog",    label: "Blog post / Article", desc: "Long-form written piece" },
  { value: "social",  label: "Social media post",   desc: "Twitter/X, LinkedIn, etc." },
  { value: "caption", label: "Caption",             desc: "Short-form — Instagram, TikTok" },
];

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
  pdf:   10 * 1024 * 1024,
  text:  50 * 1024,
};

function fileKind(name: string): "image" | "pdf" | "text" {
  if (/\.(png|jpe?g|gif|webp)$/i.test(name)) return "image";
  if (/\.pdf$/i.test(name)) return "pdf";
  return "text";
}

// ── Section card (defined outside component to avoid reconciliation issues) ──
function SectionCard({
  isOpen,
  isComplete,
  step,
  label,
  summary,
  optional = false,
  onToggle,
  children,
}: {
  isOpen: boolean;
  isComplete: boolean;
  step: number;
  label: string;
  summary: string;
  optional?: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className={`border rounded-xl overflow-hidden ${isComplete ? "border-[#2a2a2a]" : "border-[#222]"}`}>
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-3.5 bg-[#161616] hover:bg-[#1a1a1a] transition-colors text-left"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 text-[11px] font-bold transition-all ${
            isComplete ? "bg-white text-black" : "bg-[#222] text-[#555]"
          }`}>
            {isComplete ? "✓" : step}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-white">{label}</span>
              {optional && <span className="text-[10px] text-[#444]">optional</span>}
            </div>
            {!isOpen && summary && (
              <p className="text-xs text-[#555] truncate mt-0.5">{summary}</p>
            )}
          </div>
        </div>
        <svg
          className={`w-4 h-4 text-[#444] shrink-0 transition-transform ml-3 ${isOpen ? "rotate-180" : ""}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {isOpen && (
        <div className="bg-[#111] border-t border-[#1e1e1e] p-4">
          {children}
        </div>
      )}
    </div>
  );
}

export default function CreatePage() {
  const router = useRouter();

  const [form, setForm] = useState<FormState>({
    contentType: "blog", topic: "", angle: "", keyPoints: "",
    sourcesOrData: "", targetAudience: "", toneNotes: "", wordCountTarget: "",
  });

  const [openSections, setOpenSections] = useState<Set<SectionId>>(
    new Set<SectionId>(["format", "brief"])
  );

  // Draft
  const [draftText, setDraftText] = useState("");
  const [draftFileName, setDraftFileName] = useState("");
  const draftFileRef = useRef<HTMLInputElement>(null);

  // Context items
  const [contextItems, setContextItems] = useState<ContextItem[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);

  // Add-item form state
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

  // Signatures
  const [signatures, setSignatures] = useState<Signature[]>([]);
  const [selectedSigId, setSelectedSigId] = useState<number | null>(null);

  // Generation
  const [generating, setGenerating] = useState(false);
  const [output, setOutput] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch("/api/signatures")
      .then((r) => r.json())
      .then((sigs: Signature[]) => {
        setSignatures(sigs);
        const def = sigs.find((s) => s.isDefault);
        if (def) setSelectedSigId(def.id);
      });
  }, []);

  function setField(key: keyof FormState, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function toggleSection(id: SectionId) {
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const selectedSig = signatures.find((s) => s.id === selectedSigId) ?? null;

  // Section completion
  const sectionComplete: Record<SectionId, boolean> = {
    format: true,
    brief: !!(form.topic.trim() && form.angle.trim() && form.keyPoints.trim()),
    details: !!(
      form.sourcesOrData.trim() ||
      form.targetAudience.trim() ||
      form.toneNotes.trim() ||
      (form.contentType === "blog" && form.wordCountTarget.trim())
    ),
    draft: !!(draftText.trim() || draftFileName),
    context: contextItems.length > 0,
    signature: true,
  };

  // Progress: required fields only (format always done + topic + angle + keyPoints)
  const requiredDone = [
    true,
    !!form.topic.trim(),
    !!form.angle.trim(),
    !!form.keyPoints.trim(),
  ].filter(Boolean).length;
  const progress = Math.round((requiredDone / 4) * 100);

  const progressColor =
    progress === 100 ? "#10b981" :
    progress >= 75   ? "#22c55e" :
    progress >= 50   ? "#f59e0b" :
    progress > 0     ? "#f97316" : "#374151";

  const progressLabel =
    progress === 100 ? "Ready to generate" :
    progress >= 75   ? "Almost there — fill in the last field" :
    progress >= 50   ? "Add your key points to finish the brief" :
    progress >= 25   ? "Add your angle and key points" :
    "Fill in the brief to get started";

  function collapsedSummary(id: SectionId): string {
    switch (id) {
      case "format":
        return contentTypeOptions.find((o) => o.value === form.contentType)?.label ?? "";
      case "brief": {
        if (!form.topic.trim()) return "Topic, angle & key points required";
        const filledExtra = [form.angle.trim(), form.keyPoints.trim()].filter(Boolean).length;
        const topic = form.topic.length > 55 ? form.topic.slice(0, 55) + "…" : form.topic;
        return filledExtra === 2 ? topic : `${topic} (${2 - filledExtra} more required)`;
      }
      case "details": {
        const count = [
          form.sourcesOrData,
          form.targetAudience,
          form.toneNotes,
          form.contentType === "blog" ? form.wordCountTarget : "",
        ].filter((s) => s.trim()).length;
        return count ? `${count} field${count !== 1 ? "s" : ""} filled` : "Add optional context";
      }
      case "draft":
        if (draftText.trim()) return draftFileName ? `From file: ${draftFileName}` : "Draft pasted";
        return "Paste or upload an existing draft";
      case "context":
        return contextItems.length
          ? `${contextItems.length} item${contextItems.length !== 1 ? "s" : ""} added`
          : "Add links, files, or notes";
      case "signature":
        return selectedSig ? selectedSig.name : "None selected";
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const kind = fileKind(file.name);
    const limit = SIZE_LIMITS[kind];
    if (file.size > limit) {
      alert(`${file.name} is too large. Limit: ${kind === "image" ? "5MB" : kind === "pdf" ? "10MB" : "50KB"}.`);
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
        if (kind === "pdf"   && newTag === "reference") setNewTag("research");
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
    if (fileKind(file.name) !== "text") {
      alert("Draft files must be plain text (.txt or .md).");
      if (draftFileRef.current) draftFileRef.current.value = "";
      return;
    }
    if (file.size > SIZE_LIMITS.text) {
      alert("File too large. Max 50KB.");
      if (draftFileRef.current) draftFileRef.current.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      setDraftText(ev.target?.result as string);
      setDraftFileName(file.name);
    };
    reader.readAsText(file);
    if (draftFileRef.current) draftFileRef.current.value = "";
  }

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
    setShowAddForm(false);
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
    }
    setContextItems((prev) => [...prev, item]);
    resetAddForm();
  }

  function removeItem(i: number) {
    setContextItems((prev) => prev.filter((_, idx) => idx !== i));
  }

  const canCommit =
    sourceType === "url"  ? !!newUrl.trim() :
    sourceType === "file" ? !!(newFileContent || newData) :
    !!newText.trim();

  async function generate() {
    if (!form.topic.trim() || !form.angle.trim() || !form.keyPoints.trim()) {
      setError("Please fill in the topic, angle, and key points.");
      return;
    }
    setError("");
    setGenerating(true);
    setOutput("");

    const allItems: ContextItem[] = [...contextItems];
    if (draftText.trim()) {
      allItems.push({
        tag: "note",
        text: draftText.trim(),
        instructions:
          "This is an existing draft the user has already started writing. Rewrite and refine it in the author's voice — preserve their ideas and intent, but elevate the writing to fully match their style.",
      });
    }
    const context = allItems.length > 0 ? { items: allItems } : undefined;

    const res = await fetch("/api/generate/stream", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        context,
        signatureContent: selectedSig?.content ?? undefined,
      }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Generation failed. Make sure your voice profile is set up.");
      setGenerating(false);
      return;
    }

    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      setOutput((prev) => prev + decoder.decode(value, { stream: true }));
    }
    if (selectedSig) {
      setOutput((prev) => `${prev}\n\n${selectedSig.content}`);
    }
    setGenerating(false);
  }

  async function copyOutput() {
    await navigator.clipboard.writeText(output);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const sections: { id: SectionId; label: string; optional?: boolean }[] = [
    { id: "format",    label: "Format" },
    { id: "brief",     label: "Brief" },
    { id: "details",   label: "Details",        optional: true },
    { id: "draft",     label: "Starting Draft", optional: true },
    { id: "context",   label: "Context",        optional: true },
    ...(signatures.length > 0
      ? [{ id: "signature" as SectionId, label: "Signature", optional: true }]
      : []),
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Create</h1>
        <p className="text-[#666] text-sm mt-1">Brief the piece and your voice will write it.</p>
      </div>

      {/* Progress bar */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs">
          <span className="text-[#555]">{progressLabel}</span>
          <span className="text-[#444]">{progress}%</span>
        </div>
        <div className="h-1 bg-[#1e1e1e] rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: `${progress}%`, backgroundColor: progressColor }}
          />
        </div>
      </div>

      {/* Sections */}
      <div className="space-y-2">
        {sections.map(({ id, label, optional }, idx) => (
          <SectionCard
            key={id}
            isOpen={openSections.has(id)}
            isComplete={sectionComplete[id]}
            step={idx + 1}
            label={label}
            summary={collapsedSummary(id)}
            optional={optional}
            onToggle={() => toggleSection(id)}
          >
            {/* ── Format ── */}
            {id === "format" && (
              <div className="grid grid-cols-3 gap-2">
                {contentTypeOptions.map(({ value, label: optLabel, desc }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setField("contentType", value)}
                    className={`border rounded-xl p-3 text-left transition-all ${
                      form.contentType === value
                        ? "border-white bg-[#1e1e1e]"
                        : "border-[#222] bg-[#161616] hover:border-[#333]"
                    }`}
                  >
                    <div className="text-sm font-medium text-white">{optLabel}</div>
                    <div className="text-xs text-[#555] mt-0.5">{desc}</div>
                  </button>
                ))}
              </div>
            )}

            {/* ── Brief ── */}
            {id === "brief" && (
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-[#aaa]">
                    What is this piece about? <span className="text-[#555]">*</span>
                  </label>
                  <input
                    type="text"
                    value={form.topic}
                    onChange={(e) => setField("topic", e.target.value)}
                    placeholder="e.g. Why most productivity advice is wrong for creators"
                    className="w-full bg-[#0f0f0f] border border-[#2a2a2a] rounded-lg px-3 py-2.5 text-sm text-white placeholder-[#444] focus:outline-none focus:border-[#444]"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-[#aaa]">
                    What&apos;s your angle or main argument? <span className="text-[#555]">*</span>
                  </label>
                  <textarea
                    value={form.angle}
                    onChange={(e) => setField("angle", e.target.value)}
                    placeholder="e.g. Productivity advice assumes consistent work, but creative work is inherently unpredictable"
                    rows={3}
                    className="w-full bg-[#0f0f0f] border border-[#2a2a2a] rounded-lg px-3 py-2.5 text-sm text-white placeholder-[#444] focus:outline-none focus:border-[#444] resize-y"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-[#aaa]">
                    Key points, ideas, or structure to cover <span className="text-[#555]">*</span>
                  </label>
                  <textarea
                    value={form.keyPoints}
                    onChange={(e) => setField("keyPoints", e.target.value)}
                    placeholder={"e.g.\n- The myth of the 'deep work' schedule\n- How I actually write: in bursts\n- What actually works: environment design not time blocks"}
                    rows={4}
                    className="w-full bg-[#0f0f0f] border border-[#2a2a2a] rounded-lg px-3 py-2.5 text-sm text-white placeholder-[#444] focus:outline-none focus:border-[#444] resize-y"
                  />
                </div>
              </div>
            )}

            {/* ── Details ── */}
            {id === "details" && (
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-[#aaa]">Sources, data, or references to include?</label>
                  <p className="text-xs text-[#555]">Optional — leave blank if none</p>
                  <textarea
                    value={form.sourcesOrData}
                    onChange={(e) => setField("sourcesOrData", e.target.value)}
                    placeholder="e.g. Cal Newport's Deep Work framework, my own experience writing 200+ posts"
                    rows={3}
                    className="w-full bg-[#0f0f0f] border border-[#2a2a2a] rounded-lg px-3 py-2.5 text-sm text-white placeholder-[#444] focus:outline-none focus:border-[#444] resize-y"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-[#aaa]">Who is the audience?</label>
                  <p className="text-xs text-[#555]">Optional — defaults to your usual audience</p>
                  <input
                    type="text"
                    value={form.targetAudience}
                    onChange={(e) => setField("targetAudience", e.target.value)}
                    placeholder="e.g. Indie creators, solopreneurs"
                    className="w-full bg-[#0f0f0f] border border-[#2a2a2a] rounded-lg px-3 py-2.5 text-sm text-white placeholder-[#444] focus:outline-none focus:border-[#444]"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-[#aaa]">Any specific tone notes?</label>
                  <p className="text-xs text-[#555]">Optional — leave blank to match your normal voice</p>
                  <input
                    type="text"
                    value={form.toneNotes}
                    onChange={(e) => setField("toneNotes", e.target.value)}
                    placeholder="e.g. A bit more vulnerable than usual, less polished, more raw"
                    className="w-full bg-[#0f0f0f] border border-[#2a2a2a] rounded-lg px-3 py-2.5 text-sm text-white placeholder-[#444] focus:outline-none focus:border-[#444]"
                  />
                </div>
                {form.contentType === "blog" && (
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-[#aaa]">Target length?</label>
                    <p className="text-xs text-[#555]">Optional</p>
                    <input
                      type="text"
                      value={form.wordCountTarget}
                      onChange={(e) => setField("wordCountTarget", e.target.value)}
                      placeholder="e.g. 800 words, or leave blank for default"
                      className="w-full bg-[#0f0f0f] border border-[#2a2a2a] rounded-lg px-3 py-2.5 text-sm text-white placeholder-[#444] focus:outline-none focus:border-[#444]"
                    />
                  </div>
                )}
              </div>
            )}

            {/* ── Starting Draft ── */}
            {id === "draft" && (
              <div className="space-y-3">
                <p className="text-xs text-[#555]">
                  Already started writing? Paste your draft here and the ghostwriter will rewrite it in your voice.
                </p>
                <textarea
                  value={draftText}
                  onChange={(e) => {
                    setDraftText(e.target.value);
                    if (!e.target.value) setDraftFileName("");
                  }}
                  placeholder={"Paste your draft here...\n\nOr use the upload button below to load a .txt or .md file."}
                  rows={6}
                  className="w-full bg-[#0f0f0f] border border-[#2a2a2a] rounded-lg px-3 py-2.5 text-sm text-white placeholder-[#444] focus:outline-none focus:border-[#444] resize-y font-mono"
                />
                <div className="flex items-center gap-3 flex-wrap">
                  <input
                    ref={draftFileRef}
                    type="file"
                    accept=".txt,.md"
                    onChange={handleDraftFileChange}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => draftFileRef.current?.click()}
                    className="text-xs text-[#555] border border-[#2a2a2a] rounded-lg px-3 py-1.5 hover:text-[#888] hover:border-[#444] transition-colors"
                  >
                    Upload file (.txt .md)
                  </button>
                  {draftFileName && (
                    <span className="text-xs text-[#555]">Loaded: {draftFileName}</span>
                  )}
                  {draftText.trim() && (
                    <button
                      type="button"
                      onClick={() => { setDraftText(""); setDraftFileName(""); }}
                      className="text-xs text-[#444] hover:text-red-400 transition-colors ml-auto"
                    >
                      Clear draft
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* ── Context ── */}
            {id === "context" && (
              <div className="space-y-3">
                {contextItems.map((item, i) => {
                  const meta = tagMeta(item.tag);
                  const isImage = item.mediaType?.startsWith("image/");
                  const isPDF = item.mediaType === "application/pdf";
                  const sourceLabel = item.url
                    ? item.url
                    : item.fileName
                    ? item.fileName
                    : (item.text ?? "").slice(0, 80) + ((item.text ?? "").length > 80 ? "…" : "");
                  return (
                    <div key={i} className="bg-[#161616] border border-[#222] rounded-lg p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-2.5 min-w-0">
                          {isImage && item.data && (
                            <img
                              src={`data:${item.mediaType};base64,${item.data}`}
                              alt={item.fileName}
                              className="w-12 h-12 object-cover rounded shrink-0"
                            />
                          )}
                          <div className="min-w-0 space-y-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span
                                className="shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded border"
                                style={{ color: meta.color, borderColor: meta.color + "55", backgroundColor: meta.color + "15" }}
                              >
                                {meta.label.toUpperCase()}
                              </span>
                              {isPDF   && <span className="text-[10px] font-bold text-red-400 border border-red-400/30 bg-red-400/10 px-1.5 py-0.5 rounded">PDF</span>}
                              {isImage && <span className="text-[10px] font-bold text-sky-400 border border-sky-400/30 bg-sky-400/10 px-1.5 py-0.5 rounded">IMG</span>}
                              {item.isCSV && <span className="text-[10px] font-bold text-amber-400 border border-amber-400/30 bg-amber-400/10 px-1.5 py-0.5 rounded">CSV</span>}
                            </div>
                            <p className="text-xs text-[#888] break-all leading-relaxed">{sourceLabel}</p>
                            {item.isCSV && item.includePlaceholders && (
                              <span className="text-[10px] text-amber-400">chart/table placeholders on</span>
                            )}
                            {item.instructions && (
                              <p className="text-xs text-[#555] italic">↳ {item.instructions}</p>
                            )}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeItem(i)}
                          className="text-[#444] hover:text-red-400 text-xs transition-colors shrink-0"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  );
                })}

                {showAddForm ? (
                  <div className="bg-[#0f0f0f] border border-[#2a2a2a] rounded-lg p-4 space-y-4">
                    {/* Source type toggle */}
                    <div className="flex gap-1.5">
                      {(["url", "file", "text"] as SourceType[]).map((t) => (
                        <button
                          key={t}
                          type="button"
                          onClick={() => {
                            setSourceType(t);
                            setNewFileName(""); setNewFileContent(""); setNewData(""); setNewMediaType(""); setNewIsCSV(false);
                          }}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                            sourceType === t
                              ? "border-[#555] bg-[#1e1e1e] text-white"
                              : "border-[#222] text-[#555] hover:border-[#333]"
                          }`}
                        >
                          {t === "url" ? "URL" : t === "file" ? "File upload" : "Text / note"}
                        </button>
                      ))}
                    </div>

                    {sourceType === "url" && (
                      <input
                        type="url"
                        value={newUrl}
                        onChange={(e) => setNewUrl(e.target.value)}
                        placeholder="https://..."
                        className="w-full bg-[#111] border border-[#2a2a2a] rounded-lg px-3 py-2 text-sm text-white placeholder-[#444] focus:outline-none focus:border-[#444]"
                      />
                    )}

                    {sourceType === "file" && (
                      <div className="space-y-2">
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept=".txt,.md,.csv,.pdf,.png,.jpg,.jpeg,.gif,.webp"
                          onChange={handleFileChange}
                          className="hidden"
                        />
                        {newFileName ? (
                          <div className="flex items-start gap-3 bg-[#111] border border-[#2a2a2a] rounded-lg px-3 py-2.5">
                            {newMediaType?.startsWith("image/") && newData && (
                              <img
                                src={`data:${newMediaType};base64,${newData}`}
                                alt={newFileName}
                                className="w-14 h-14 object-cover rounded shrink-0"
                              />
                            )}
                            <div className="flex-1 min-w-0 space-y-0.5">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="text-xs text-white font-medium truncate">{newFileName}</span>
                                {newMediaType === "application/pdf" && <span className="text-[10px] font-bold text-red-400 border border-red-400/30 bg-red-400/10 px-1.5 py-0.5 rounded shrink-0">PDF</span>}
                                {newIsCSV && <span className="text-[10px] font-bold text-amber-400 border border-amber-400/30 bg-amber-400/10 px-1.5 py-0.5 rounded shrink-0">CSV</span>}
                                {newMediaType?.startsWith("image/") && <span className="text-[10px] font-bold text-sky-400 border border-sky-400/30 bg-sky-400/10 px-1.5 py-0.5 rounded shrink-0">IMG</span>}
                              </div>
                              <span className="text-[10px] text-[#555]">
                                {((newData ? newData.length * 0.75 : newFileContent.length) / 1024).toFixed(1)} KB
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() => { setNewFileName(""); setNewFileContent(""); setNewData(""); setNewMediaType(""); setNewIsCSV(false); }}
                              className="text-[#444] hover:text-red-400 text-xs shrink-0"
                            >
                              ✕
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            className="text-sm text-[#666] border border-[#2a2a2a] rounded-lg px-4 py-2 hover:text-[#aaa] hover:border-[#444] transition-colors"
                          >
                            Choose file (.txt .md .csv .pdf .png .jpg — PDF 10MB, images 5MB, text 50KB)
                          </button>
                        )}
                        {newIsCSV && newFileName && (
                          <label className="flex items-center gap-2 cursor-pointer select-none">
                            <div
                              onClick={() => setNewIncludePlaceholders(!newIncludePlaceholders)}
                              className={`w-7 h-3.5 rounded-full transition-colors relative ${newIncludePlaceholders ? "bg-white" : "bg-[#333]"}`}
                            >
                              <div className={`absolute top-0.5 w-2.5 h-2.5 rounded-full bg-black transition-transform ${newIncludePlaceholders ? "translate-x-3.5" : "translate-x-0.5"}`} />
                            </div>
                            <span className="text-xs text-[#666]">Include chart / table placeholders</span>
                          </label>
                        )}
                      </div>
                    )}

                    {sourceType === "text" && (
                      <textarea
                        value={newText}
                        onChange={(e) => setNewText(e.target.value)}
                        placeholder="Paste raw text, data, or notes here..."
                        rows={4}
                        className="w-full bg-[#111] border border-[#2a2a2a] rounded-lg px-3 py-2 text-sm text-white placeholder-[#444] focus:outline-none focus:border-[#444] resize-y"
                      />
                    )}

                    <div className="space-y-1.5">
                      <label className="text-xs text-[#555]">Tag</label>
                      <div className="flex flex-wrap gap-1.5">
                        {TAGS.map(({ value, label: tagLabel, color }) => (
                          <button
                            key={value}
                            type="button"
                            onClick={() => setNewTag(value)}
                            className="px-2.5 py-1.5 rounded-lg text-[10px] font-bold border transition-all"
                            style={
                              newTag === value
                                ? { color, borderColor: color, backgroundColor: color + "18" }
                                : { color: "#555", borderColor: "#2a2a2a", backgroundColor: "transparent" }
                            }
                          >
                            {tagLabel}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs text-[#555]">
                        How should this be used? <span className="text-[#444]">(optional but powerful)</span>
                      </label>
                      <textarea
                        value={newInstructions}
                        onChange={(e) => setNewInstructions(e.target.value)}
                        placeholder="e.g. Reference the ferritin levels from January vs April to show improvement over the protocol."
                        rows={3}
                        className="w-full bg-[#111] border border-[#2a2a2a] rounded-lg px-3 py-2 text-sm text-white placeholder-[#444] focus:outline-none focus:border-[#444] resize-y"
                      />
                    </div>

                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={commitItem}
                        disabled={!canCommit}
                        className="bg-white text-black text-sm font-medium px-4 py-2 rounded-lg hover:bg-[#e8e8e8] transition-colors disabled:opacity-40"
                      >
                        Add item
                      </button>
                      <button
                        type="button"
                        onClick={resetAddForm}
                        className="text-[#666] text-sm hover:text-[#999] transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowAddForm(true)}
                    className="text-sm text-[#666] border border-[#2a2a2a] rounded-lg px-4 py-2 hover:text-[#aaa] hover:border-[#444] transition-colors w-full"
                  >
                    + Add context item
                  </button>
                )}
              </div>
            )}

            {/* ── Signature ── */}
            {id === "signature" && (
              <div className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedSigId(null)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                      selectedSigId === null
                        ? "border-[#555] bg-[#1e1e1e] text-white"
                        : "border-[#222] text-[#555] hover:border-[#333]"
                    }`}
                  >
                    None
                  </button>
                  {signatures.map((sig) => (
                    <button
                      key={sig.id}
                      type="button"
                      onClick={() => setSelectedSigId(sig.id)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                        selectedSigId === sig.id
                          ? "border-emerald-400/60 bg-emerald-400/10 text-emerald-400"
                          : "border-[#222] text-[#555] hover:border-[#333] hover:text-[#888]"
                      }`}
                    >
                      {sig.name}
                    </button>
                  ))}
                </div>
                {selectedSig && (
                  <div className="bg-[#0f0f0f] border border-[#1e1e1e] rounded-lg px-3 py-2.5">
                    <pre className="text-xs text-[#555] whitespace-pre-wrap font-sans leading-relaxed">
                      {selectedSig.content}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </SectionCard>
        ))}
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      <button
        type="button"
        onClick={generate}
        disabled={generating}
        className="w-full bg-white text-black font-medium py-3 rounded-xl hover:bg-[#e8e8e8] transition-colors disabled:opacity-40 text-sm"
      >
        {generating ? "Writing..." : "Generate in my voice"}
      </button>

      {/* Output */}
      {(output || generating) && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-medium text-white text-sm">Output</h2>
            {output && (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={copyOutput}
                  className="text-xs text-[#666] hover:text-white transition-colors border border-[#333] rounded-md px-3 py-1.5"
                >
                  {copied ? "Copied!" : "Copy"}
                </button>
                <button
                  type="button"
                  onClick={() => router.push("/history")}
                  className="text-xs text-[#666] hover:text-white transition-colors"
                >
                  View history
                </button>
              </div>
            )}
          </div>
          <div className="bg-[#111] border border-[#1e1e1e] rounded-xl p-5">
            {generating && !output && (
              <div className="flex items-center gap-2 text-[#555] text-sm">
                <span className="inline-block w-1.5 h-1.5 bg-[#555] rounded-full animate-pulse" />
                Writing...
              </div>
            )}
            <pre className="text-sm text-[#ccc] whitespace-pre-wrap font-sans leading-relaxed">
              {output}
              {generating && output && (
                <span className="inline-block w-0.5 h-4 bg-[#555] ml-0.5 animate-pulse align-middle" />
              )}
            </pre>
          </div>
          {output && !generating && (
            <button
              type="button"
              onClick={generate}
              className="text-xs text-[#555] hover:text-[#888] transition-colors"
            >
              Regenerate
            </button>
          )}
        </div>
      )}
    </div>
  );
}
