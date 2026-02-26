"use client";

import { useState, useEffect, useRef, Fragment } from "react";
import { useRouter } from "next/navigation";
import { type ContextItem, type ContextItemTag, CONTENT_TYPE_LABELS, CONTENT_TYPE_GROUPS } from "@/lib/claude";

// ── Types ────────────────────────────────────────────────────────────────────

interface IntakeResult {
  contentType: string;
  topic: string | null;
  angle: string | null;
  keyPoints: string | null;
  targetAudience: string | null;
  toneNotes: string | null;
  summary: string;
  questions: IntakeQuestion[];
}

interface IntakeQuestion {
  id: string;
  label: string;
  placeholder: string;
}

interface Signature {
  id: number;
  name: string;
  content: string;
  isDefault: boolean;
}

type Phase = "describe" | "analyzing" | "followup";
type SourceType = "url" | "file" | "text";

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

// ── Collapsible section ───────────────────────────────────────────────────────

function Collapsible({
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
    <div className="border border-[#222] rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-3 bg-[#161616] hover:bg-[#1a1a1a] transition-colors text-left"
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-white">{label}</span>
          {badge && <span className="text-xs text-[#555]">{badge}</span>}
        </div>
        <svg
          className={`w-4 h-4 text-[#444] transition-transform ${open ? "rotate-180" : ""}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="bg-[#111] border-t border-[#1e1e1e] p-4">
          {children}
        </div>
      )}
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function CreatePage() {
  const router = useRouter();

  // Intake
  const [phase, setPhase] = useState<Phase>("describe");
  const [description, setDescription] = useState("");
  const [intake, setIntake] = useState<IntakeResult | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [overrideType, setOverrideType] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);

  // Draft
  const [draftOpen, setDraftOpen] = useState(false);
  const [draftText, setDraftText] = useState("");
  const [draftFileName, setDraftFileName] = useState("");
  const [draftData, setDraftData] = useState("");
  const [draftMediaType, setDraftMediaType] = useState("");
  const draftFileRef = useRef<HTMLInputElement>(null);

  // Context items
  const [contextOpen, setContextOpen] = useState(false);
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
  const [currentStage, setCurrentStage] = useState<{ step: number; total: number; label: string } | null>(null);
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

  const selectedSig = signatures.find((s) => s.id === selectedSigId) ?? null;

  // ── Intake analysis ──────────────────────────────────────────────────────

  async function analyze() {
    if (description.trim().length < 5) return;
    setAnalyzing(true);
    setPhase("analyzing");
    setError("");

    try {
      const res = await fetch("/api/intake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description }),
      });
      const data: IntakeResult = await res.json();
      setIntake(data);
      setAnswers({});
      setPhase("followup");
    } catch {
      setError("Analysis failed. Please try again.");
      setPhase("describe");
    } finally {
      setAnalyzing(false);
    }
  }

  function startOver() {
    setPhase("describe");
    setDescription("");
    setIntake(null);
    setAnswers({});
    setOutput("");
    setError("");
    setContextItems([]);
    setDraftText("");
    setDraftData("");
    setDraftFileName("");
    setDraftMediaType("");
    setOverrideType(null);
    setContextOpen(false);
    setDraftOpen(false);
  }

  // ── File handlers ────────────────────────────────────────────────────────

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
    const kind = fileKind(file.name);
    if (kind === "image") {
      alert("Draft files must be text (.txt, .md) or PDF.");
      if (draftFileRef.current) draftFileRef.current.value = "";
      return;
    }
    const limit = kind === "pdf" ? SIZE_LIMITS.pdf : SIZE_LIMITS.text;
    if (file.size > limit) {
      alert(`File too large. Max ${kind === "pdf" ? "10MB" : "50KB"}.`);
      if (draftFileRef.current) draftFileRef.current.value = "";
      return;
    }
    const reader = new FileReader();
    if (kind === "pdf") {
      reader.onload = (ev) => {
        const dataUrl = ev.target?.result as string;
        const [header, base64] = dataUrl.split(",");
        const mime = header.match(/data:([^;]+)/)?.[1] ?? "application/pdf";
        setDraftFileName(file.name);
        setDraftData(base64);
        setDraftMediaType(mime);
        setDraftText("");
      };
      reader.readAsDataURL(file);
    } else {
      reader.onload = (ev) => {
        setDraftText(ev.target?.result as string);
        setDraftFileName(file.name);
        setDraftData("");
        setDraftMediaType("");
      };
      reader.readAsText(file);
    }
    if (draftFileRef.current) draftFileRef.current.value = "";
  }

  // ── Context item helpers ─────────────────────────────────────────────────

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

  // ── Generation ───────────────────────────────────────────────────────────

  const canGenerate =
    intake !== null &&
    !generating &&
    (intake.questions ?? []).every((q) => !!answers[q.id]?.trim());

  async function generate() {
    if (!intake) return;

    const interview = {
      contentType: overrideType ?? intake.contentType ?? "blog",
      topic:       intake.topic      ?? answers.topic      ?? "",
      angle:       intake.angle      ?? answers.angle      ?? "",
      keyPoints:   intake.keyPoints  ?? answers.keyPoints  ?? "",
      targetAudience: intake.targetAudience ?? answers.targetAudience ?? undefined,
      toneNotes:      intake.toneNotes      ?? answers.toneNotes      ?? undefined,
    };

    setError("");
    setGenerating(true);
    setOutput("");
    setCurrentStage(null);

    // Build context — prepend original brief so all specifics feed in
    const allItems: ContextItem[] = [];
    if (description.trim().length > 80) {
      allItems.push({
        tag: "note",
        text: description.trim(),
        instructions: "This is the author's original brief. Use any specific details, examples, data points, or context from it.",
      });
    }
    allItems.push(...contextItems);

    if (draftText.trim() || draftData) {
      const draftInstructions =
        "The user has provided existing material for this piece. Assess what it is — a full or partial draft, an outline/structure, or rough notes/fragments — and handle it accordingly: if it's a draft, rewrite and refine it in the author's voice; if it's an outline, write a full piece following that structure; if it's rough notes, use them as source material and write the piece from scratch. Always write in the author's voice.";
      if (draftData && draftMediaType) {
        allItems.push({ tag: "note", fileName: draftFileName || "draft.pdf", data: draftData, mediaType: draftMediaType, instructions: draftInstructions });
      } else {
        allItems.push({ tag: "note", text: draftText.trim(), instructions: draftInstructions });
      }
    }

    const context = allItems.length > 0 ? { items: allItems } : undefined;

    const res = await fetch("/api/generate/stream", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...interview, context, signatureContent: selectedSig?.content ?? undefined }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Generation failed. Make sure your voice profile is set up.");
      setGenerating(false);
      return;
    }

    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        try {
          const data = JSON.parse(line.slice(6));
          if (data.type === "stage") {
            setCurrentStage({ step: data.step, total: data.total, label: data.label });
          } else if (data.type === "chunk") {
            setOutput((prev) => prev + data.text);
          } else if (data.type === "error") {
            setError(data.message);
          }
        } catch { /* ignore malformed lines */ }
      }
    }

    if (selectedSig) {
      setOutput((prev) => `${prev}\n\n${selectedSig.content}`);
    }
    setGenerating(false);
    setCurrentStage(null);
  }

  async function copyOutput() {
    await navigator.clipboard.writeText(output);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="space-y-8">

      {/* ── Phase: describe ── */}
      {phase === "describe" && !output && (
        <div className="space-y-6">
          <div>
            <h1 className="text-2xl font-bold text-white">What do you want to write?</h1>
            <p className="text-[#555] text-sm mt-1">
              Describe your idea — rough or detailed. The more context, the fewer follow-up questions.
            </p>
          </div>

          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && description.trim().length >= 5) {
                e.preventDefault();
                analyze();
              }
            }}
            placeholder={
              "A LinkedIn post about why most \"AI productivity\" articles miss the point — they measure output, not thinking. My angle: the real gain is in deciding faster, not writing faster. Key points: the cognitive offload argument, a specific example from our team, why this matters for knowledge workers."
            }
            className="w-full bg-[#111] border border-[#222] rounded-xl px-4 py-3.5 text-sm text-white placeholder-[#333] focus:outline-none focus:border-[#444] resize-none"
            rows={9}
            autoFocus
          />

          <div className="flex items-center justify-between">
            <span className="text-xs text-[#3a3a3a]">⌘↵ to continue</span>
            <button
              type="button"
              onClick={analyze}
              disabled={description.trim().length < 5}
              className="px-5 py-2.5 bg-white text-black text-sm font-medium rounded-xl hover:bg-[#e8e8e8] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              Continue →
            </button>
          </div>
        </div>
      )}

      {/* ── Phase: analyzing ── */}
      {phase === "analyzing" && !output && (
        <div className="flex items-center gap-3 py-12">
          <span className="inline-block w-1.5 h-1.5 bg-[#555] rounded-full animate-pulse" />
          <span className="text-sm text-[#555]">Analyzing your brief...</span>
        </div>
      )}

      {/* ── Phase: followup ── */}
      {phase === "followup" && intake && !output && !generating && (
        <div className="space-y-6">
          {/* Summary + type selector + back */}
          <div className="flex items-start justify-between gap-4">
            <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-1">
              <span className="text-sm text-white">✓</span>
              <span className="text-sm text-[#555]">Writing</span>
              {/* Inline type selector */}
              <select
                value={overrideType ?? intake.contentType ?? "blog"}
                onChange={(e) => setOverrideType(e.target.value)}
                className="bg-[#1a1a1a] border border-[#2a2a2a] rounded text-xs text-white px-2 py-0.5 focus:outline-none focus:border-[#555] cursor-pointer"
              >
                {CONTENT_TYPE_GROUPS.map((group) => (
                  <optgroup key={group.label} label={group.label}>
                    {group.types.map((type) => (
                      <option key={type} value={type}>
                        {CONTENT_TYPE_LABELS[type]}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
              {intake.topic && (
                <span className="text-sm text-[#555]">
                  about <span className="text-[#888]">{intake.topic}</span>
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={() => setPhase("describe")}
              className="text-xs text-[#444] hover:text-[#888] transition-colors shrink-0 mt-0.5"
            >
              ← Edit brief
            </button>
          </div>

          {/* Follow-up questions — only missing fields */}
          {intake.questions.length > 0 && (
            <div className="space-y-4">
              {intake.questions.map((q) => (
                <div key={q.id} className="space-y-1.5">
                  <label className="text-sm text-[#aaa]">{q.label}</label>
                  {q.id === "angle" || q.id === "keyPoints" ? (
                    <textarea
                      value={answers[q.id] ?? ""}
                      onChange={(e) => setAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))}
                      placeholder={q.placeholder}
                      rows={3}
                      className="w-full bg-[#111] border border-[#222] rounded-xl px-4 py-3 text-sm text-white placeholder-[#333] focus:outline-none focus:border-[#444] resize-none"
                    />
                  ) : (
                    <input
                      type="text"
                      value={answers[q.id] ?? ""}
                      onChange={(e) => setAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))}
                      placeholder={q.placeholder}
                      className="w-full bg-[#111] border border-[#222] rounded-xl px-4 py-3 text-sm text-white placeholder-[#333] focus:outline-none focus:border-[#444]"
                    />
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Context */}
          <Collapsible
            label="Add context"
            badge={contextItems.length ? `${contextItems.length} item${contextItems.length !== 1 ? "s" : ""}` : "optional"}
            open={contextOpen}
            onToggle={() => setContextOpen((v) => !v)}
          >
            <div className="space-y-3">
              {/* Existing items */}
              {contextItems.map((item, i) => {
                const meta = tagMeta(item.tag);
                const label = item.url ?? item.fileName ?? (item.text ? item.text.slice(0, 50) + (item.text.length > 50 ? "…" : "") : "item");
                return (
                  <div key={i} className="flex items-center justify-between gap-3 py-2 border-b border-[#1e1e1e]">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ color: meta.color, backgroundColor: meta.color + "22" }}>
                        {meta.label}
                      </span>
                      <span className="text-xs text-[#666] truncate">{label}</span>
                    </div>
                    <button type="button" onClick={() => removeItem(i)} className="text-[#444] hover:text-[#888] text-xs shrink-0">✕</button>
                  </div>
                );
              })}

              {/* Add form */}
              {showAddForm ? (
                <div className="space-y-3 pt-1">
                  {/* Source type */}
                  <div className="flex gap-1">
                    {(["url", "file", "text"] as SourceType[]).map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setSourceType(t)}
                        className={`px-3 py-1 text-xs rounded-md transition-colors ${sourceType === t ? "bg-[#2a2a2a] text-white" : "text-[#555] hover:text-[#888]"}`}
                      >
                        {t === "url" ? "URL" : t === "file" ? "File" : "Text"}
                      </button>
                    ))}
                  </div>

                  {/* Tag */}
                  <div className="flex gap-1 flex-wrap">
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
                    <input
                      type="url"
                      value={newUrl}
                      onChange={(e) => setNewUrl(e.target.value)}
                      placeholder="https://..."
                      className="w-full bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg px-3 py-2 text-xs text-white placeholder-[#444] focus:outline-none focus:border-[#444]"
                    />
                  )}

                  {sourceType === "file" && (
                    <div>
                      <input ref={fileInputRef} type="file" accept=".txt,.md,.csv,.pdf,.png,.jpg,.jpeg,.gif,.webp" onChange={handleFileChange} className="hidden" />
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="w-full border border-dashed border-[#2a2a2a] rounded-lg py-4 text-xs text-[#555] hover:border-[#444] hover:text-[#888] transition-colors"
                      >
                        {newFileName ? newFileName : "Click to choose file"}
                      </button>
                      {newIsCSV && (
                        <label className="flex items-center gap-2 mt-2 text-xs text-[#666] cursor-pointer">
                          <input type="checkbox" checked={newIncludePlaceholders} onChange={(e) => setNewIncludePlaceholders(e.target.checked)} className="accent-white" />
                          Include chart/table placeholders
                        </label>
                      )}
                    </div>
                  )}

                  {sourceType === "text" && (
                    <textarea
                      value={newText}
                      onChange={(e) => setNewText(e.target.value)}
                      placeholder="Paste text, notes, or data..."
                      rows={4}
                      className="w-full bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg px-3 py-2 text-xs text-white placeholder-[#444] focus:outline-none focus:border-[#444] resize-none"
                    />
                  )}

                  <input
                    type="text"
                    value={newInstructions}
                    onChange={(e) => setNewInstructions(e.target.value)}
                    placeholder="Usage instructions (optional)"
                    className="w-full bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg px-3 py-2 text-xs text-white placeholder-[#444] focus:outline-none focus:border-[#444]"
                  />

                  <div className="flex gap-2 pt-1">
                    <button
                      type="button"
                      onClick={commitItem}
                      disabled={!canCommit}
                      className="px-3 py-1.5 bg-white text-black text-xs font-medium rounded-lg hover:bg-[#e8e8e8] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      Add
                    </button>
                    <button type="button" onClick={resetAddForm} className="px-3 py-1.5 text-xs text-[#555] hover:text-white transition-colors">
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowAddForm(true)}
                  className="text-xs text-[#555] hover:text-white transition-colors"
                >
                  + Add item
                </button>
              )}
            </div>
          </Collapsible>

          {/* Draft */}
          <Collapsible
            label="Starting draft"
            badge={draftText.trim() || draftData ? (draftFileName || "added") : "optional"}
            open={draftOpen}
            onToggle={() => setDraftOpen((v) => !v)}
          >
            <div className="space-y-3">
              <textarea
                value={draftText}
                onChange={(e) => {
                  setDraftText(e.target.value);
                  setDraftData("");
                  setDraftFileName("");
                }}
                placeholder="Paste a draft, outline, or rough notes..."
                rows={5}
                className="w-full bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg px-3 py-2 text-xs text-white placeholder-[#444] focus:outline-none focus:border-[#444] resize-none font-mono"
              />
              <div className="flex items-center gap-3">
                <span className="text-xs text-[#444]">or</span>
                <input ref={draftFileRef} type="file" accept=".txt,.md,.pdf" onChange={handleDraftFileChange} className="hidden" />
                <button
                  type="button"
                  onClick={() => draftFileRef.current?.click()}
                  className="text-xs text-[#555] hover:text-white transition-colors"
                >
                  {draftFileName ? `📄 ${draftFileName}` : "Upload .txt, .md, or .pdf"}
                </button>
                {(draftText.trim() || draftData) && (
                  <button type="button" onClick={() => { setDraftText(""); setDraftData(""); setDraftFileName(""); setDraftMediaType(""); }} className="text-xs text-[#444] hover:text-[#888]">
                    Clear
                  </button>
                )}
              </div>
            </div>
          </Collapsible>

          {/* Signature */}
          {signatures.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs text-[#555]">Signature</p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedSigId(null)}
                  className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${selectedSigId === null ? "border-white text-white bg-[#1e1e1e]" : "border-[#222] text-[#555] hover:border-[#333]"}`}
                >
                  None
                </button>
                {signatures.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setSelectedSigId(s.id)}
                    className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${selectedSigId === s.id ? "border-white text-white bg-[#1e1e1e]" : "border-[#222] text-[#555] hover:border-[#333]"}`}
                  >
                    {s.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Error */}
          {error && <p className="text-xs text-red-400">{error}</p>}

          {/* Generate */}
          <button
            type="button"
            onClick={generate}
            disabled={!canGenerate}
            className="w-full py-3 bg-white text-black text-sm font-medium rounded-xl hover:bg-[#e8e8e8] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            Generate in my voice
          </button>
        </div>
      )}

      {/* ── Generating: stage progress (shown instead of followup form) ── */}
      {generating && (
        <div className="space-y-4">
          {/* Summary line */}
          {intake && (
            <p className="text-sm text-[#555]">{intake.summary}</p>
          )}

          {/* Stage dots */}
          <div className="flex items-center gap-1.5">
            {currentStage ? (
              <>
                {[1, 2, 3].map((step) => (
                  <Fragment key={step}>
                    <div className={`w-1.5 h-1.5 rounded-full shrink-0 transition-all duration-300 ${
                      step < currentStage.step ? "bg-white" :
                      step === currentStage.step ? "bg-white animate-pulse" :
                      "bg-[#333]"
                    }`} />
                    {step < 3 && (
                      <div className={`w-6 h-px transition-colors duration-300 ${step < currentStage.step ? "bg-[#555]" : "bg-[#2a2a2a]"}`} />
                    )}
                  </Fragment>
                ))}
                <span className="text-xs text-[#555] ml-2">{currentStage.label}</span>
              </>
            ) : (
              <span className="text-xs text-[#555]">Starting...</span>
            )}
          </div>

          {/* Streaming text — shown when stage 3 starts */}
          {(output || (currentStage && currentStage.step >= 3)) && (
            <div className="bg-[#111] border border-[#1e1e1e] rounded-xl p-5">
              {!output && (
                <div className="flex items-center gap-2 text-[#555] text-sm">
                  <span className="inline-block w-1.5 h-1.5 bg-[#555] rounded-full animate-pulse" />
                  Writing...
                </div>
              )}
              {output && (
                <pre className="text-sm text-[#ccc] whitespace-pre-wrap font-sans leading-relaxed">
                  {output}
                  <span className="inline-block w-0.5 h-4 bg-[#555] ml-0.5 animate-pulse align-middle" />
                </pre>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Output (post-generation) ── */}
      {output && !generating && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-medium text-white text-sm">Output</h2>
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
          </div>

          {error && <p className="text-xs text-red-400">{error}</p>}

          <div className="bg-[#111] border border-[#1e1e1e] rounded-xl p-5">
            <pre className="text-sm text-[#ccc] whitespace-pre-wrap font-sans leading-relaxed">{output}</pre>
          </div>

          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={generate}
              className="text-xs text-[#555] hover:text-[#888] transition-colors"
            >
              Regenerate
            </button>
            <button
              type="button"
              onClick={startOver}
              className="text-xs text-[#555] hover:text-[#888] transition-colors"
            >
              Start over
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
