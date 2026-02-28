"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { type ContextItem, type ContextItemTag, CONTENT_TYPE_LABELS, CONTENT_TYPE_GROUPS } from "@/lib/content-types";
import { extractTemplateBrief, defaultTemplateName, type TemplateBrief } from "@/lib/template-utils";

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

interface QueuedJob {
  id: number;
  contentType: string;
  topic: string;
  title: string;
  summaryText: string;
  status: string;
  createdAt: string;
}

interface SavedBrief {
  id: number;
  contentType: string;
  topic: string;
  title: string;
  summaryText: string;
  brief: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

interface Template {
  id: number;
  name: string;
  contentType: string;
  brief: string;
  createdAt: string;
  updatedAt: string;
}

function timeAgoCreate(iso: string) {
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 60)    return `${secs}s ago`;
  if (secs < 3600)  return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return `${Math.floor(secs / 86400)}d ago`;
}

type Phase = "describe" | "analyzing" | "followup" | "sent" | "saved";
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
  pdf:   10 * 1024 * 1024,
  docx:  15 * 1024 * 1024,
  text:  50 * 1024,
};

function fileKind(name: string): "image" | "pdf" | "docx" | "text" {
  if (/\.(png|jpe?g|gif|webp)$/i.test(name)) return "image";
  if (/\.pdf$/i.test(name)) return "pdf";
  if (/\.docx$/i.test(name)) return "docx";
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
  const [researchPrompt, setResearchPrompt] = useState("");
  const [researching, setResearching] = useState(false);
  const [researchError, setResearchError] = useState("");

  // Custom content types
  const [customTypes, setCustomTypes] = useState<{ id: number; name: string; slug: string; sampleCount: number }[]>([]);

  // Signatures
  const [signatures, setSignatures] = useState<Signature[]>([]);
  const [selectedSigId, setSelectedSigId] = useState<number | null>(null);

  // Title
  const [titleInput, setTitleInput]           = useState("");
  const [suggestedTitles, setSuggestedTitles] = useState<string[]>([]);
  const [suggestingTitles, setSuggestingTitles] = useState(false);

  // Word count target
  const [wordCountTarget, setWordCountTarget] = useState("");

  // Send to ghostwriter / save for later
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  // Saved (queued) briefs visible on this page
  const [queuedJobs, setQueuedJobs] = useState<QueuedJob[]>([]);

  // Saved ideas (draft status — not yet sent to ghostwriter)
  const [savedBriefs, setSavedBriefs] = useState<SavedBrief[]>([]);
  const [editingBriefId, setEditingBriefId] = useState<number | null>(null);

  // Templates
  const [templates, setTemplates] = useState<Template[]>([]);
  const [showSaveTemplate, setShowSaveTemplate] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState("");
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [editingTemplateId, setEditingTemplateId] = useState<number | null>(null);
  const [editTemplateName, setEditTemplateName] = useState("");

  function loadQueuedJobs() {
    fetch("/api/ghostwriter")
      .then((r) => r.json())
      .then((jobs: QueuedJob[]) => setQueuedJobs(jobs.filter((j) => j.status === "queued")))
      .catch(() => {});
  }

  function loadSavedBriefs() {
    fetch("/api/ghostwriter?status=draft")
      .then((r) => r.json())
      .then((briefs: SavedBrief[]) => setSavedBriefs(briefs))
      .catch(() => {});
  }

  useEffect(() => {
    loadQueuedJobs();
    loadSavedBriefs();
    fetch("/api/signatures")
      .then((r) => r.json())
      .then((sigs: Signature[]) => {
        setSignatures(sigs);
        const def = sigs.find((s) => s.isDefault);
        if (def) setSelectedSigId(def.id);
      });
    fetch("/api/custom-types")
      .then((r) => r.json())
      .then(setCustomTypes)
      .catch(() => {});
    fetch("/api/templates")
      .then((r) => r.json())
      .then((t: Template[]) => setTemplates(t))
      .catch(() => {});
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
    setError("");
    setContextItems([]);
    setDraftText("");
    setDraftData("");
    setDraftFileName("");
    setDraftMediaType("");
    setOverrideType(null);
    setContextOpen(false);
    setDraftOpen(false);
    setTitleInput("");
    setSuggestedTitles([]);
    setWordCountTarget("");
  }

  async function suggestTitles() {
    if (!intake || suggestingTitles) return;
    setSuggestingTitles(true);
    try {
      const res = await fetch("/api/intake/suggest-titles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contentType: overrideType ?? intake.contentType ?? "blog",
          topic:       intake.topic      ?? answers.topic      ?? "",
          angle:       intake.angle      ?? answers.angle      ?? "",
          keyPoints:   intake.keyPoints  ?? answers.keyPoints  ?? "",
        }),
      });
      const data = await res.json();
      if (Array.isArray(data.titles)) setSuggestedTitles(data.titles);
    } catch { /* ignore */ }
    finally { setSuggestingTitles(false); }
  }

  // ── File handlers ────────────────────────────────────────────────────────

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const kind = fileKind(file.name);
    const limit = SIZE_LIMITS[kind];
    if (file.size > limit) {
      const limitLabel = kind === "image" ? "5MB" : kind === "pdf" ? "10MB" : kind === "docx" ? "15MB" : "50KB";
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
        if (kind === "pdf"   && newTag === "reference") setNewTag("research");
      };
      reader.readAsDataURL(file);
    } else if (kind === "docx") {
      // DOCX is binary (ZIP) — extract text via server API, store as text context
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
      const limitLabel = kind === "pdf" ? "10MB" : kind === "docx" ? "15MB" : "50KB";
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
        setDraftFileName(file.name);
        setDraftData(base64);
        setDraftMediaType(mime);
        setDraftText("");
      };
      reader.readAsDataURL(file);
    } else if (kind === "docx") {
      // DOCX is binary — extract text via server API
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
          setDraftText(result.text);
          setDraftFileName(file.name);
          setDraftData("");
          setDraftMediaType("");
        } catch {
          alert("Failed to process DOCX file. Please try again.");
        }
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
    setResearchPrompt("");
    setResearching(false);
    setResearchError("");
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
      if (newTag === "data" && newIncludePlaceholders) {
        item.includePlaceholders = true;
      }
    }
    setContextItems((prev) => [...prev, item]);
    resetAddForm();
  }

  function removeItem(i: number) {
    setContextItems((prev) => prev.filter((_, idx) => idx !== i));
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
      // Commit as a research context item; prompt stored as instructions so
      // the writer knows what was researched and generation gets that framing
      setContextItems((prev) => [
        ...prev,
        {
          tag: "research" as const,
          text: data.brief,
          instructions: researchPrompt.trim(),
        },
      ]);
      resetAddForm();
    } catch (err) {
      setResearchError(err instanceof Error ? err.message : "Research failed. Please try again.");
    } finally {
      setResearching(false);
    }
  }

  const canCommit =
    sourceType === "url"      ? !!newUrl.trim() :
    sourceType === "file"     ? !!(newFileContent || newData) :
    sourceType === "research" ? false : // research uses its own button
    !!newText.trim();

  // ── Build brief ──────────────────────────────────────────────────────────

  const canSend =
    intake !== null &&
    !sending &&
    (intake.questions ?? []).every((q) => !!answers[q.id]?.trim());

  function buildBrief() {
    if (!intake) return null;
    const resolvedType = overrideType ?? intake.contentType ?? "blog";
    const customType = resolvedType.startsWith("custom_")
      ? customTypes.find((ct) => ct.slug === resolvedType)
      : undefined;
    const interview = {
      contentType:      resolvedType,
      contentTypeLabel: customType?.name || undefined,
      topic:       intake.topic      ?? answers.topic      ?? "",
      angle:       intake.angle      ?? answers.angle      ?? "",
      keyPoints:   intake.keyPoints  ?? answers.keyPoints  ?? "",
      targetAudience: intake.targetAudience ?? answers.targetAudience ?? undefined,
      toneNotes:        intake.toneNotes      ?? answers.toneNotes      ?? undefined,
      title:            titleInput.trim()     || undefined,
      wordCountTarget:  wordCountTarget.trim() || undefined,
    };

    const allItems: ContextItem[] = [];
    if (description.trim()) {
      allItems.push({
        tag: "note",
        text: description.trim(),
        instructions: "Author's original brief — use any specific details, examples, or context from it.",
      });
    }
    allItems.push(...contextItems);

    if (draftText.trim() || draftData) {
      const draftInstructions =
        "User provided existing material. Assess it — full draft, outline, or rough notes — and write the piece in the author's voice accordingly.";
      if (draftData && draftMediaType) {
        allItems.push({ tag: "note", fileName: draftFileName || "draft.pdf", data: draftData, mediaType: draftMediaType, instructions: draftInstructions });
      } else {
        allItems.push({ tag: "note", text: draftText.trim(), instructions: draftInstructions });
      }
    }

    return {
      interview,
      context: allItems.length > 0 ? { items: allItems } : undefined,
      signatureContent: selectedSig?.content ?? undefined,
    };
  }

  async function createJob(): Promise<number | null> {
    if (!intake) return null;
    const brief = buildBrief();
    if (!brief) return null;
    const res = await fetch("/api/ghostwriter", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contentType:  brief.interview.contentType,
        topic:        brief.interview.topic,
        title:        titleInput.trim(),
        summaryText:  intake.summary ?? "",
        brief:        JSON.stringify(brief),
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Failed to create job");
    return data.id as number;
  }

  async function sendToGhostwriter() {
    setError("");
    setSending(true);
    try {
      await createJob();
      router.push("/ghostwriter");
    } catch {
      setError("Failed to send to ghostwriter. Please try again.");
      setSending(false);
    }
  }

  async function saveForLater() {
    setError("");
    setSending(true);
    try {
      if (!intake) return;
      const brief = buildBrief();
      if (!brief) return;
      const isEditing = editingBriefId !== null;
      if (isEditing) {
        // Update existing saved brief
        await fetch(`/api/ghostwriter/${editingBriefId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contentType: brief.interview.contentType,
            topic: brief.interview.topic,
            title: titleInput.trim(),
            summaryText: intake.summary ?? "",
            brief: JSON.stringify(brief),
          }),
        });
      } else {
        // Create new saved brief with draft status
        await fetch("/api/ghostwriter", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contentType: brief.interview.contentType,
            topic: brief.interview.topic,
            title: titleInput.trim(),
            summaryText: intake.summary ?? "",
            brief: JSON.stringify(brief),
            status: "draft",
          }),
        });
      }
      setEditingBriefId(null);
      loadSavedBriefs();
      startOver();
    } catch {
      setError("Failed to save. Please try again.");
    } finally {
      setSending(false);
    }
  }

  async function deleteQueuedJob(id: number) {
    await fetch(`/api/ghostwriter/${id}`, { method: "DELETE" });
    setQueuedJobs((prev) => prev.filter((j) => j.id !== id));
  }

  async function deleteSavedBrief(id: number) {
    await fetch(`/api/ghostwriter/${id}`, { method: "DELETE" });
    setSavedBriefs((prev) => prev.filter((b) => b.id !== id));
  }

  async function sendSavedBrief(id: number) {
    await fetch(`/api/ghostwriter/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "queued" }),
    });
    setSavedBriefs((prev) => prev.filter((b) => b.id !== id));
    router.push("/ghostwriter");
  }

  function editSavedBrief(brief: SavedBrief) {
    try {
      const parsed = JSON.parse(brief.brief) as {
        interview: Record<string, string | undefined>;
        context?: { items: ContextItem[] };
        signatureContent?: string;
      };
      const iv = parsed.interview;

      // Reconstruct the intake
      const syntheticIntake: IntakeResult = {
        contentType: iv.contentType ?? "blog",
        topic: iv.topic ?? null,
        angle: iv.angle ?? null,
        keyPoints: iv.keyPoints ?? null,
        targetAudience: iv.targetAudience ?? null,
        toneNotes: iv.toneNotes ?? null,
        summary: brief.summaryText,
        questions: [],
      };

      setIntake(syntheticIntake);
      setAnswers({});
      setOverrideType(iv.contentType ?? null);
      setDescription(brief.summaryText || iv.topic || "");
      setTitleInput(iv.title ?? brief.title ?? "");
      setWordCountTarget(iv.wordCountTarget ?? "");

      // Restore context items (skip the first "note" which is the description)
      const items = parsed.context?.items ?? [];
      const contextOnly = items.filter(
        (it) => !(it.tag === "note" && it.instructions?.includes("Author's original brief"))
      );
      setContextItems(contextOnly);
      if (contextOnly.length > 0) setContextOpen(true);

      // Restore signature
      if (parsed.signatureContent) {
        const matchingSig = signatures.find((s) => s.content === parsed.signatureContent);
        if (matchingSig) setSelectedSigId(matchingSig.id);
      }

      setEditingBriefId(brief.id);
      setPhase("followup");
    } catch {
      setError("Failed to load saved brief.");
    }
  }

  // ── Templates ──────────────────────────────────────────────────────────

  function applyTemplate(template: Template) {
    const tBrief: TemplateBrief = JSON.parse(template.brief);
    const interview = tBrief.interview;

    // Build questions for fields the template doesn't provide
    const questions: IntakeQuestion[] = [
      { id: "topic", label: "What's the topic?", placeholder: "The specific subject for this piece" },
    ];
    if (!interview.angle) {
      questions.push({ id: "angle", label: "Angle or perspective", placeholder: "What's your unique take?" });
    }
    if (!interview.keyPoints) {
      questions.push({ id: "keyPoints", label: "Key points to cover", placeholder: "Main ideas, arguments, or sections" });
    }

    const syntheticIntake: IntakeResult = {
      contentType: interview.contentType,
      topic: null,
      angle: interview.angle ?? null,
      keyPoints: interview.keyPoints ?? null,
      targetAudience: interview.targetAudience ?? null,
      toneNotes: interview.toneNotes ?? null,
      summary: `Template: ${template.name}`,
      questions,
    };

    setIntake(syntheticIntake);
    setAnswers({});
    setOverrideType(interview.contentType);
    setPhase("followup");
    setDescription("");
    setError("");
    if (interview.wordCountTarget) setWordCountTarget(interview.wordCountTarget);
    if (tBrief.context?.items?.length) {
      setContextItems(tBrief.context.items);
      setContextOpen(true);
    } else {
      setContextItems([]);
    }
    if (tBrief.signatureId) {
      setSelectedSigId(tBrief.signatureId);
    }
  }

  async function deleteTemplate(id: number) {
    await fetch("/api/templates", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    setTemplates((prev) => prev.filter((t) => t.id !== id));
  }

  async function renameTemplate() {
    if (!editingTemplateId || !editTemplateName.trim()) return;
    await fetch("/api/templates", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: editingTemplateId, name: editTemplateName.trim() }),
    });
    setTemplates((prev) =>
      prev.map((t) => t.id === editingTemplateId ? { ...t, name: editTemplateName.trim() } : t),
    );
    setEditingTemplateId(null);
  }

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="space-y-8">

      {/* ── Phase: describe ── */}
      {phase === "describe" && (
        <div className="space-y-8">
          {/* Compact input with gradient glow */}
          <div className="relative">
            <div className="absolute -inset-[1px] rounded-2xl bg-gradient-to-br from-white/[0.15] via-white/[0.05] to-white/[0.12] dark:from-white/[0.08] dark:via-white/[0.02] dark:to-white/[0.06] pointer-events-none" />
            <div className="absolute -inset-[1px] rounded-2xl opacity-50 blur-sm bg-gradient-to-r from-blue-500/[0.08] via-purple-500/[0.06] to-blue-500/[0.08] dark:from-blue-400/[0.10] dark:via-purple-400/[0.08] dark:to-blue-400/[0.10] pointer-events-none animate-pulse" style={{ animationDuration: "4s" }} />
            <div className="relative bg-white dark:bg-[#0e0e0e] rounded-2xl p-5 space-y-3">
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && description.trim().length >= 5) {
                    e.preventDefault();
                    analyze();
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
                      {templates.slice(0, 3).map((t) => (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => applyTemplate(t)}
                          className="text-[10px] px-2 py-0.5 rounded-md border border-black/[0.07] dark:border-white/[0.06] text-black/[0.35] dark:text-white/[0.30] hover:text-black/90 dark:hover:text-white hover:border-black/[0.15] dark:hover:border-white/[0.15] transition-colors"
                        >
                          {t.name}
                        </button>
                      ))}
                      {templates.length > 3 && (
                        <span className="text-[10px] text-black/[0.22] dark:text-white/[0.22]">+{templates.length - 3}</span>
                      )}
                    </div>
                  )}
                  <span className="text-[10px] text-black/[0.18] dark:text-white/[0.18]">⌘↵</span>
                </div>
                <button
                  type="button"
                  onClick={analyze}
                  disabled={description.trim().length < 5}
                  className="px-4 py-1.5 bg-black/[0.88] text-white dark:bg-white dark:text-black text-xs font-medium rounded-lg hover:bg-black/75 dark:hover:bg-white/90 transition-colors disabled:opacity-20 disabled:cursor-not-allowed"
                >
                  Continue →
                </button>
              </div>
            </div>
          </div>

          {/* ── Saved ideas mosaic ── */}
          {savedBriefs.length > 0 && (
            <div className="space-y-3">
              <p className="text-[11px] text-black/[0.28] dark:text-white/[0.28] uppercase tracking-widest font-semibold">
                Saved ideas
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {savedBriefs.map((brief) => (
                  <div
                    key={brief.id}
                    className="group relative bg-black/[0.03] dark:bg-[#111] border border-black/[0.07] dark:border-white/[0.06] rounded-xl p-4 hover:border-black/[0.14] dark:hover:border-white/[0.12] transition-colors"
                  >
                    <div className="space-y-2 min-h-[72px]">
                      <span className="text-[10px] font-medium text-black/[0.28] dark:text-white/[0.28] bg-black/[0.05] dark:bg-white/[0.05] rounded px-1.5 py-0.5">
                        {CONTENT_TYPE_LABELS[brief.contentType] ?? brief.contentType}
                      </span>
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
                        {timeAgoCreate(brief.updatedAt || brief.createdAt)}
                      </span>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          type="button"
                          onClick={() => editSavedBrief(brief)}
                          className="w-7 h-7 flex items-center justify-center rounded-md text-black/[0.30] dark:text-white/[0.30] hover:text-black/90 dark:hover:text-white hover:bg-black/[0.06] dark:hover:bg-white/[0.06] transition-colors"
                          title="Edit"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                          </svg>
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteSavedBrief(brief.id)}
                          className="w-7 h-7 flex items-center justify-center rounded-md text-black/[0.30] dark:text-white/[0.30] hover:text-red-500 dark:hover:text-red-400 hover:bg-red-500/[0.06] transition-colors"
                          title="Delete"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                        <button
                          type="button"
                          onClick={() => sendSavedBrief(brief.id)}
                          className="w-7 h-7 flex items-center justify-center rounded-md text-black/[0.30] dark:text-white/[0.30] hover:text-black/90 dark:hover:text-white hover:bg-black/[0.06] dark:hover:bg-white/[0.06] transition-colors"
                          title="Send to Ghostwriter"
                        >
                          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-2-3.5l6-4.5-6-4.5v9z" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Queued jobs (already sent to ghostwriter) */}
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
                    <button
                      type="button"
                      onClick={() => router.push("/ghostwriter")}
                      className="text-[10px] text-black/[0.55] dark:text-white/[0.55] hover:text-black/90 dark:hover:text-white transition-colors"
                    >
                      Open →
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteQueuedJob(job.id)}
                      className="text-[10px] text-black/[0.22] dark:text-white/[0.22] hover:text-red-500 dark:hover:text-red-400 transition-colors"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Phase: analyzing ── */}
      {phase === "analyzing" && (
        <div className="flex items-center gap-3 py-12">
          <span className="inline-block w-1.5 h-1.5 bg-black/[0.35] dark:bg-white/[0.35] rounded-full animate-pulse" />
          <span className="text-sm text-black/[0.35] dark:text-white/[0.35]">Analyzing your brief...</span>
        </div>
      )}

      {/* ── Phase: followup ── */}
      {phase === "followup" && intake && (
        <div className="space-y-6">
          {/* Summary + type selector + back */}
          <div className="flex items-start justify-between gap-4">
            <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-1">
              <span className="text-sm text-black/90 dark:text-white">✓</span>
              <span className="text-sm text-black/[0.35] dark:text-white/[0.35]">Writing</span>
              {/* Inline type selector */}
              <select
                value={overrideType ?? intake.contentType ?? "blog"}
                onChange={(e) => setOverrideType(e.target.value)}
                className="bg-black/[0.06] dark:bg-[#1a1a1a] border border-black/[0.10] dark:border-[#2a2a2a] rounded text-xs text-black/90 dark:text-white px-2 py-0.5 focus:outline-none focus:border-black/[0.25] dark:focus:border-white/[0.25] cursor-pointer"
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
                {customTypes.length > 0 && (
                  <optgroup label="My Custom Types">
                    {customTypes.map((ct) => (
                      <option key={ct.slug} value={ct.slug}>
                        {ct.name}{ct.sampleCount === 0 ? " (no examples yet)" : ""}
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
              {intake.topic && (
                <span className="text-sm text-black/[0.35] dark:text-white/[0.35]">
                  about <span className="text-black/[0.55] dark:text-white/[0.55]">{intake.topic}</span>
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={() => setPhase("describe")}
              className="text-xs text-black/[0.28] dark:text-white/[0.28] hover:text-black/55 dark:hover:text-white/55 transition-colors shrink-0 mt-0.5"
            >
              ← Edit brief
            </button>
          </div>

          {/* Follow-up questions — only missing fields */}
          {intake.questions.length > 0 && (
            <div className="space-y-4">
              {intake.questions.map((q) => (
                <div key={q.id} className="space-y-1.5">
                  <label className="text-sm text-black/[0.68] dark:text-white/[0.68]">{q.label}</label>
                  {q.id === "angle" || q.id === "keyPoints" ? (
                    <textarea
                      value={answers[q.id] ?? ""}
                      onChange={(e) => setAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))}
                      placeholder={q.placeholder}
                      rows={3}
                      className="w-full bg-black/[0.04] dark:bg-[#111] border border-black/[0.09] dark:border-white/[0.07] rounded-xl px-4 py-3 text-sm text-black/90 dark:text-white placeholder-black/[0.25] dark:placeholder-white/[0.22] focus:outline-none focus:border-black/[0.22] dark:focus:border-white/[0.22] resize-none"
                    />
                  ) : (
                    <input
                      type="text"
                      value={answers[q.id] ?? ""}
                      onChange={(e) => setAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))}
                      placeholder={q.placeholder}
                      className="w-full bg-black/[0.04] dark:bg-[#111] border border-black/[0.09] dark:border-white/[0.07] rounded-xl px-4 py-3 text-sm text-black/90 dark:text-white placeholder-black/[0.25] dark:placeholder-white/[0.22] focus:outline-none focus:border-black/[0.22] dark:focus:border-white/[0.22]"
                    />
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Title */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm text-black/[0.68] dark:text-white/[0.68]">
                Title <span className="text-black/[0.28] dark:text-white/[0.28] font-normal">— optional</span>
              </label>
              <button
                type="button"
                onClick={suggestTitles}
                disabled={suggestingTitles}
                className="text-xs text-black/[0.35] dark:text-white/[0.35] hover:text-black/90 dark:hover:text-white transition-colors disabled:opacity-40"
              >
                {suggestingTitles ? "Suggesting…" : "Suggest titles →"}
              </button>
            </div>
            <input
              type="text"
              value={titleInput}
              onChange={(e) => setTitleInput(e.target.value)}
              placeholder="Leave blank to let the ghost choose"
              className="w-full bg-black/[0.04] dark:bg-[#111] border border-black/[0.09] dark:border-white/[0.07] rounded-xl px-4 py-3 text-sm text-black/90 dark:text-white placeholder-black/[0.25] dark:placeholder-white/[0.22] focus:outline-none focus:border-black/[0.22] dark:focus:border-white/[0.22]"
            />
            {suggestedTitles.length > 0 && (
              <div className="flex flex-wrap gap-2 pt-1">
                {suggestedTitles.map((t, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setTitleInput(t)}
                    className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                      titleInput === t
                        ? "border-black dark:border-white text-black/90 dark:text-white bg-black/[0.07] dark:bg-[#1e1e1e]"
                        : "border-black/[0.09] dark:border-white/[0.07] text-black/[0.55] dark:text-white/[0.55] hover:border-black/[0.18] dark:hover:border-white/[0.18] hover:text-black/90 dark:hover:text-white"
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Target length */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-black/[0.45] dark:text-white/[0.40] uppercase tracking-wide">
              Target length <span className="normal-case font-normal text-black/[0.28] dark:text-white/[0.25]">optional</span>
            </label>
            <input
              type="text"
              value={wordCountTarget}
              onChange={(e) => setWordCountTarget(e.target.value)}
              placeholder="e.g. 800 words, 10,000 words, short"
              className="w-full bg-black/[0.04] dark:bg-[#111] border border-black/[0.09] dark:border-white/[0.07] rounded-xl px-4 py-3 text-sm text-black/90 dark:text-white placeholder-black/[0.25] dark:placeholder-white/[0.22] focus:outline-none focus:border-black/[0.22] dark:focus:border-white/[0.22]"
            />
          </div>

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
                const label =
                  item.url ?? item.fileName ??
                  (item.tag === "research" && item.instructions
                    ? item.instructions.slice(0, 60) + (item.instructions.length > 60 ? "…" : "")
                    : item.text ? item.text.slice(0, 50) + (item.text.length > 50 ? "…" : "") : "item");
                return (
                  <div key={i} className="flex items-center justify-between gap-3 py-2 border-b border-black/[0.06] dark:border-white/[0.05]">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ color: meta.color, backgroundColor: meta.color + "22" }}>
                        {meta.label}
                      </span>
                      <span className="text-xs text-black/[0.40] dark:text-white/[0.40] truncate">{label}</span>
                    </div>
                    <button type="button" onClick={() => removeItem(i)} className="text-black/[0.28] dark:text-white/[0.28] hover:text-black/55 dark:hover:text-white/55 text-xs shrink-0">✕</button>
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
                        onClick={() => {
                          setSourceType(t);
                          if (t === "research") setNewTag("research");
                        }}
                        className={`px-3 py-1 text-xs rounded-md transition-colors ${sourceType === t ? "bg-black/[0.08] dark:bg-[#2a2a2a] text-black/90 dark:text-white" : "text-black/[0.35] dark:text-white/[0.35] hover:text-black/55 dark:hover:text-white/55"}`}
                      >
                        {t === "url" ? "URL" : t === "file" ? "File" : t === "text" ? "Text" : "AI Research"}
                      </button>
                    ))}
                  </div>

                  {/* Tag — hidden when research (auto-set) */}
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
                    <input
                      type="url"
                      value={newUrl}
                      onChange={(e) => setNewUrl(e.target.value)}
                      placeholder="https://..."
                      className="w-full bg-black/[0.05] dark:bg-[#0a0a0a] border border-black/[0.10] dark:border-[#2a2a2a] rounded-lg px-3 py-2 text-xs text-black/90 dark:text-white placeholder-black/[0.28] dark:placeholder-white/[0.28] focus:outline-none focus:border-black/[0.22] dark:focus:border-white/[0.22]"
                    />
                  )}

                  {sourceType === "file" && (
                    <div>
                      <input ref={fileInputRef} type="file" accept=".txt,.md,.csv,.pdf,.docx,.png,.jpg,.jpeg,.gif,.webp" onChange={handleFileChange} className="hidden" />
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="w-full border border-dashed border-black/[0.10] dark:border-[#2a2a2a] rounded-lg py-4 text-xs text-black/[0.35] dark:text-white/[0.35] hover:border-black/[0.17] dark:hover:border-white/[0.17] hover:text-black/55 dark:hover:text-white/55 transition-colors"
                      >
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
                      <textarea
                        value={newText}
                        onChange={(e) => setNewText(e.target.value)}
                        placeholder="Paste text, notes, or data..."
                        rows={4}
                        className="w-full bg-black/[0.05] dark:bg-[#0a0a0a] border border-black/[0.10] dark:border-[#2a2a2a] rounded-lg px-3 py-2 text-xs text-black/90 dark:text-white placeholder-black/[0.28] dark:placeholder-white/[0.28] focus:outline-none focus:border-black/[0.22] dark:focus:border-white/[0.22] resize-none"
                      />
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
                      <textarea
                        value={researchPrompt}
                        onChange={(e) => setResearchPrompt(e.target.value)}
                        placeholder="Describe what to research — e.g. &quot;Find recent statistics on remote work productivity and key arguments for and against&quot;"
                        rows={3}
                        className="w-full bg-black/[0.05] dark:bg-[#0a0a0a] border border-black/[0.10] dark:border-[#2a2a2a] rounded-lg px-3 py-2 text-xs text-black/90 dark:text-white placeholder-black/[0.28] dark:placeholder-white/[0.28] focus:outline-none focus:border-black/[0.22] dark:focus:border-white/[0.22] resize-none"
                        autoFocus
                      />
                      {researchError && (
                        <p className="text-xs text-red-400">{researchError}</p>
                      )}
                    </div>
                  )}

                  {sourceType !== "research" && (
                    <input
                      type="text"
                      value={newInstructions}
                      onChange={(e) => setNewInstructions(e.target.value)}
                      placeholder="Usage instructions (optional)"
                      className="w-full bg-black/[0.05] dark:bg-[#0a0a0a] border border-black/[0.10] dark:border-[#2a2a2a] rounded-lg px-3 py-2 text-xs text-black/90 dark:text-white placeholder-black/[0.28] dark:placeholder-white/[0.28] focus:outline-none focus:border-black/[0.22] dark:focus:border-white/[0.22]"
                    />
                  )}

                  <div className="flex gap-2 pt-1">
                    {sourceType === "research" ? (
                      <>
                        <button
                          type="button"
                          onClick={runResearch}
                          disabled={!researchPrompt.trim() || researching}
                          className="px-3 py-1.5 bg-black/[0.88] text-white dark:bg-white dark:text-black text-xs font-medium rounded-lg hover:bg-black/75 dark:hover:bg-white/90 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                          {researching ? "Researching..." : "Research →"}
                        </button>
                        <button type="button" onClick={resetAddForm} disabled={researching} className="px-3 py-1.5 text-xs text-black/[0.35] dark:text-white/[0.35] hover:text-black/90 dark:hover:text-white transition-colors disabled:opacity-30">
                          Cancel
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={commitItem}
                          disabled={!canCommit}
                          className="px-3 py-1.5 bg-black/[0.88] text-white dark:bg-white dark:text-black text-xs font-medium rounded-lg hover:bg-black/75 dark:hover:bg-white/90 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                        >
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
                <button
                  type="button"
                  onClick={() => setShowAddForm(true)}
                  className="text-xs text-black/[0.35] dark:text-white/[0.35] hover:text-black/90 dark:hover:text-white transition-colors"
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
                className="w-full bg-black/[0.05] dark:bg-[#0a0a0a] border border-black/[0.10] dark:border-[#2a2a2a] rounded-lg px-3 py-2 text-xs text-black/90 dark:text-white placeholder-black/[0.28] dark:placeholder-white/[0.28] focus:outline-none focus:border-black/[0.22] dark:focus:border-white/[0.22] resize-none font-mono"
              />
              <div className="flex items-center gap-3">
                <span className="text-xs text-black/[0.28] dark:text-white/[0.28]">or</span>
                <input ref={draftFileRef} type="file" accept=".txt,.md,.pdf,.docx" onChange={handleDraftFileChange} className="hidden" />
                <button
                  type="button"
                  onClick={() => draftFileRef.current?.click()}
                  className="text-xs text-black/[0.35] dark:text-white/[0.35] hover:text-black/90 dark:hover:text-white transition-colors"
                >
                  {draftFileName ? `📄 ${draftFileName}` : "Upload .txt, .md, or .pdf"}
                </button>
                {(draftText.trim() || draftData) && (
                  <button type="button" onClick={() => { setDraftText(""); setDraftData(""); setDraftFileName(""); setDraftMediaType(""); }} className="text-xs text-black/[0.28] dark:text-white/[0.28] hover:text-black/55 dark:hover:text-white/55">
                    Clear
                  </button>
                )}
              </div>
            </div>
          </Collapsible>

          {/* Signature */}
          {signatures.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs text-black/[0.35] dark:text-white/[0.35]">Signature</p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedSigId(null)}
                  className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${selectedSigId === null ? "border-black dark:border-white text-black/90 dark:text-white bg-black/[0.07] dark:bg-[#1e1e1e]" : "border-black/[0.09] dark:border-white/[0.07] text-black/[0.35] dark:text-white/[0.35] hover:border-black/[0.14] dark:hover:border-white/[0.14]"}`}
                >
                  None
                </button>
                {signatures.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setSelectedSigId(s.id)}
                    className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${selectedSigId === s.id ? "border-black dark:border-white text-black/90 dark:text-white bg-black/[0.07] dark:bg-[#1e1e1e]" : "border-black/[0.09] dark:border-white/[0.07] text-black/[0.35] dark:text-white/[0.35] hover:border-black/[0.14] dark:hover:border-white/[0.14]"}`}
                  >
                    {s.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Error */}
          {error && <p className="text-xs text-red-400">{error}</p>}

          {/* Send to Ghostwriter / Save for later / Save as Template */}
          <div className="space-y-3 pt-1">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={sendToGhostwriter}
                disabled={!canSend}
                className="flex-1 py-3 bg-black/[0.88] text-white dark:bg-white dark:text-black text-sm font-medium rounded-xl hover:bg-black/75 dark:hover:bg-white/90 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                {sending ? "Sending…" : "Send to Ghostwriter →"}
              </button>
              <button
                type="button"
                onClick={saveForLater}
                disabled={!canSend}
                className="py-3 px-5 bg-transparent text-black/[0.55] dark:text-white/[0.55] border border-black/[0.12] dark:border-white/[0.12] text-sm font-medium rounded-xl hover:text-black/90 dark:hover:text-white hover:border-black/[0.21] dark:hover:border-white/[0.22] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                Save for later
              </button>
              <button
                type="button"
                onClick={() => {
                  const brief = buildBrief();
                  if (!brief) return;
                  const tBrief = extractTemplateBrief(JSON.stringify(brief), selectedSigId);
                  setNewTemplateName(defaultTemplateName(tBrief));
                  setShowSaveTemplate(true);
                }}
                disabled={!intake}
                className="py-3 px-5 bg-transparent text-black/[0.40] dark:text-white/[0.40] border border-black/[0.09] dark:border-white/[0.07] text-sm rounded-xl hover:text-black/90 dark:hover:text-white hover:border-black/[0.21] dark:hover:border-white/[0.22] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                Save as Template
              </button>
            </div>
            {showSaveTemplate && (
              <div className="flex items-center gap-3">
                <input
                  type="text"
                  value={newTemplateName}
                  onChange={(e) => setNewTemplateName(e.target.value)}
                  placeholder="Template name"
                  className="flex-1 bg-black/[0.04] dark:bg-[#111] border border-black/[0.10] dark:border-[#2a2a2a] rounded-lg px-3 py-2 text-sm text-black/90 dark:text-white placeholder-black/[0.23] dark:placeholder-white/[0.23] focus:outline-none focus:border-black/[0.22] dark:focus:border-white/[0.22]"
                  autoFocus
                  onKeyDown={(e) => { if (e.key === "Escape") setShowSaveTemplate(false); }}
                />
                <button
                  type="button"
                  onClick={async () => {
                    setSavingTemplate(true);
                    const brief = buildBrief();
                    if (!brief) { setSavingTemplate(false); return; }
                    const tBrief = extractTemplateBrief(JSON.stringify(brief), selectedSigId);
                    const res = await fetch("/api/templates", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        name: newTemplateName.trim() || defaultTemplateName(tBrief),
                        contentType: tBrief.interview.contentType,
                        brief: JSON.stringify(tBrief),
                      }),
                    });
                    if (res.ok) {
                      const created = await res.json();
                      setTemplates((prev) => [created, ...prev]);
                    }
                    setSavingTemplate(false);
                    setShowSaveTemplate(false);
                  }}
                  disabled={savingTemplate || !newTemplateName.trim()}
                  className="bg-black/[0.88] text-white dark:bg-white dark:text-black text-sm font-medium px-4 py-2 rounded-xl hover:bg-black/75 dark:hover:bg-white/90 transition-colors disabled:opacity-40"
                >
                  {savingTemplate ? "Saving..." : "Save Template"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowSaveTemplate(false)}
                  className="text-sm text-black/[0.35] dark:text-white/[0.35] hover:text-black/55 dark:hover:text-white/55"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Saved confirmation ── */}
      {phase === "saved" && (
        <div className="bg-black/[0.04] dark:bg-[#161616] border border-black/[0.10] dark:border-[#2a2a2a] rounded-xl p-8 text-center space-y-4">
          <div className="flex items-center justify-center gap-2 text-emerald-400">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            <span className="text-sm font-medium">Saved to Ghostwriter</span>
          </div>
          <p className="text-black/[0.35] dark:text-white/[0.35] text-sm">Your brief is queued. Head to the Ghostwriter tab when you're ready to run it.</p>
          <div className="flex items-center justify-center gap-4">
            <button
              type="button"
              onClick={() => router.push("/ghostwriter")}
              className="bg-black/[0.88] text-white dark:bg-white dark:text-black text-sm font-medium px-4 py-2 rounded-lg hover:bg-black/75 dark:hover:bg-white/90 transition-colors"
            >
              Go to Ghostwriter
            </button>
            <button
              type="button"
              onClick={startOver}
              className="text-black/[0.35] dark:text-white/[0.35] text-sm hover:text-black/55 dark:hover:text-white/55 transition-colors"
            >
              Write another
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
