"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { type ContextItem, type ContextItemTag } from "@/lib/claude";

type ContentType = "blog" | "social" | "caption";

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

const questions: {
  key: keyof FormState;
  label: string;
  placeholder: string;
  required: boolean;
  showFor?: ContentType[];
  multiline?: boolean;
  hint?: string;
}[] = [
  { key: "topic",          label: "What is this piece about?",              placeholder: "e.g. Why most productivity advice is wrong for creators",                                                  required: true },
  { key: "angle",          label: "What's your angle or main argument?",    placeholder: "e.g. Productivity advice assumes consistent work, but creative work is inherently unpredictable",          required: true,  multiline: true },
  { key: "keyPoints",      label: "Key points, ideas, or structure to cover", placeholder: "e.g.\n- The myth of the 'deep work' schedule\n- How I actually write: in bursts\n- What actually works: environment design not time blocks", required: true, multiline: true },
  { key: "sourcesOrData",  label: "Any sources, data, or references to include?", placeholder: "e.g. Cal Newport's Deep Work framework, my own experience writing 200+ posts", required: false, multiline: true, hint: "Optional — leave blank if none" },
  { key: "targetAudience", label: "Who is the audience?",                   placeholder: "e.g. Indie creators, solopreneurs, people who feel guilty about not working enough",                     required: false, hint: "Optional — defaults to your usual audience" },
  { key: "toneNotes",      label: "Any specific tone notes for this piece?", placeholder: "e.g. A bit more vulnerable than usual, less polished, more raw",                                        required: false, hint: "Optional — leave blank to match your normal voice" },
  { key: "wordCountTarget", label: "Target length?",                        placeholder: "e.g. 800 words, or leave blank for default",                                                             required: false, showFor: ["blog"], hint: "Optional" },
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
  image: 5 * 1024 * 1024,  // 5MB
  pdf:   10 * 1024 * 1024, // 10MB
  text:  50 * 1024,        // 50KB
};

function fileKind(name: string): "image" | "pdf" | "text" {
  if (/\.(png|jpe?g|gif|webp)$/i.test(name)) return "image";
  if (/\.pdf$/i.test(name)) return "pdf";
  return "text";
}

type SourceType = "url" | "file" | "text";

export default function CreatePage() {
  const router = useRouter();

  const [form, setForm] = useState<FormState>({
    contentType: "blog", topic: "", angle: "", keyPoints: "",
    sourcesOrData: "", targetAudience: "", toneNotes: "", wordCountTarget: "",
  });

  // Unified context items
  const [contextItems, setContextItems] = useState<ContextItem[]>([]);
  const [showContext, setShowContext] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);

  // Add-item form state
  const [sourceType, setSourceType] = useState<SourceType>("url");
  const [newTag, setNewTag] = useState<ContextItemTag>("reference");
  const [newUrl, setNewUrl] = useState("");
  const [newText, setNewText] = useState("");
  const [newFileName, setNewFileName] = useState("");
  const [newFileContent, setNewFileContent] = useState(""); // text files
  const [newData, setNewData] = useState("");               // binary (base64)
  const [newMediaType, setNewMediaType] = useState("");     // MIME type for binary
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

  function set(key: keyof FormState, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
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
        // Auto-tag images as "example", PDFs as "research"
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
    const item: ContextItem = {
      tag: newTag,
      instructions: newInstructions.trim() || undefined,
    };

    if (sourceType === "url") {
      if (!newUrl.trim()) return;
      item.url = newUrl.trim();
    } else if (sourceType === "file") {
      if (!newFileName) return;
      item.fileName = newFileName;
      if (newData && newMediaType) {
        // Binary file (image or PDF)
        item.data = newData;
        item.mediaType = newMediaType;
      } else {
        // Text-based file (txt, md, csv)
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

  const selectedSig = signatures.find((s) => s.id === selectedSigId) ?? null;

  async function generate() {
    if (!form.topic.trim() || !form.angle.trim() || !form.keyPoints.trim()) {
      setError("Please fill in the topic, angle, and key points.");
      return;
    }
    setError("");
    setGenerating(true);
    setOutput("");

    const context = contextItems.length > 0 ? { items: contextItems } : undefined;

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

  const visibleQuestions = questions.filter(
    (q) => !q.showFor || q.showFor.includes(form.contentType)
  );

  // ── add-item form validation ──
  const canCommit =
    sourceType === "url"  ? !!newUrl.trim() :
    sourceType === "file" ? !!(newFileContent || newData) :
    !!newText.trim();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white">Create</h1>
        <p className="text-[#666] text-sm mt-1">Brief the piece and your voice will write it.</p>
      </div>

      <div className="space-y-6">
        {/* Content type */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-[#aaa]">Content type</label>
          <div className="grid grid-cols-3 gap-2">
            {contentTypeOptions.map(({ value, label, desc }) => (
              <button key={value} onClick={() => set("contentType", value)}
                className={`border rounded-xl p-3 text-left transition-all ${
                  form.contentType === value
                    ? "border-white bg-[#1e1e1e]"
                    : "border-[#222] bg-[#161616] hover:border-[#333]"
                }`}
              >
                <div className="text-sm font-medium text-white">{label}</div>
                <div className="text-xs text-[#555] mt-0.5">{desc}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Interview questions */}
        {visibleQuestions.map((q) => (
          <div key={q.key} className="space-y-1.5">
            <label className="text-sm font-medium text-[#aaa]">
              {q.label}
              {q.required && <span className="text-[#555] ml-1">*</span>}
            </label>
            {q.hint && <p className="text-xs text-[#555]">{q.hint}</p>}
            {q.multiline ? (
              <textarea value={form[q.key]} onChange={(e) => set(q.key, e.target.value)}
                placeholder={q.placeholder} rows={4}
                className="w-full bg-[#111] border border-[#2a2a2a] rounded-lg px-3 py-2.5 text-sm text-white placeholder-[#444] focus:outline-none focus:border-[#444] resize-y"
              />
            ) : (
              <input type="text" value={form[q.key]} onChange={(e) => set(q.key, e.target.value)}
                placeholder={q.placeholder}
                className="w-full bg-[#111] border border-[#2a2a2a] rounded-lg px-3 py-2.5 text-sm text-white placeholder-[#444] focus:outline-none focus:border-[#444]"
              />
            )}
          </div>
        ))}

        {/* ── Context panel ── */}
        <div className="border border-[#222] rounded-xl overflow-hidden">
          <button
            onClick={() => setShowContext(!showContext)}
            className="w-full flex items-center justify-between px-4 py-3 bg-[#161616] hover:bg-[#1a1a1a] transition-colors"
          >
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-[#aaa]">Context</span>
              {contextItems.length > 0 && (
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-white/10 text-white">
                  {contextItems.length} item{contextItems.length !== 1 ? "s" : ""}
                </span>
              )}
            </div>
            <span className="text-xs text-[#555]">
              {showContext ? "Hide" : "Links, files, notes + usage instructions"}
            </span>
          </button>

          {showContext && (
            <div className="bg-[#111] border-t border-[#222] p-4 space-y-3">

              {/* Existing items */}
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
                  <div key={i} className="bg-[#161616] border border-[#222] rounded-lg p-3 space-y-2">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-2.5 min-w-0">
                        {/* Image thumbnail */}
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
                            {isPDF  && <span className="text-[10px] font-bold text-red-400 border border-red-400/30 bg-red-400/10 px-1.5 py-0.5 rounded">PDF</span>}
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
                      <button onClick={() => removeItem(i)} className="text-[#444] hover:text-red-400 text-xs transition-colors shrink-0">
                        ✕
                      </button>
                    </div>
                  </div>
                );
              })}

              {/* Add-item form */}
              {showAddForm ? (
                <div className="bg-[#0f0f0f] border border-[#2a2a2a] rounded-lg p-4 space-y-4">

                  {/* Source type toggle */}
                  <div className="flex gap-1.5">
                    {(["url", "file", "text"] as SourceType[]).map((t) => (
                      <button
                        key={t}
                        onClick={() => { setSourceType(t); setNewFileName(""); setNewFileContent(""); setNewData(""); setNewMediaType(""); setNewIsCSV(false); }}
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

                  {/* Source content input */}
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
                      <input ref={fileInputRef} type="file" accept=".txt,.md,.csv,.pdf,.png,.jpg,.jpeg,.gif,.webp" onChange={handleFileChange} className="hidden" />
                      {newFileName ? (
                        <div className="space-y-2">
                          <div className="flex items-start gap-3 bg-[#111] border border-[#2a2a2a] rounded-lg px-3 py-2.5">
                            {/* Image thumbnail */}
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
                                {newMediaType === "application/pdf" && (
                                  <span className="text-[10px] font-bold text-red-400 border border-red-400/30 bg-red-400/10 px-1.5 py-0.5 rounded shrink-0">PDF</span>
                                )}
                                {newIsCSV && (
                                  <span className="text-[10px] font-bold text-amber-400 border border-amber-400/30 bg-amber-400/10 px-1.5 py-0.5 rounded shrink-0">CSV</span>
                                )}
                                {newMediaType?.startsWith("image/") && (
                                  <span className="text-[10px] font-bold text-sky-400 border border-sky-400/30 bg-sky-400/10 px-1.5 py-0.5 rounded shrink-0">IMG</span>
                                )}
                              </div>
                              <span className="text-[10px] text-[#555]">
                                {((newData ? newData.length * 0.75 : newFileContent.length) / 1024).toFixed(1)} KB
                              </span>
                            </div>
                            <button onClick={() => { setNewFileName(""); setNewFileContent(""); setNewData(""); setNewMediaType(""); setNewIsCSV(false); }} className="text-[#444] hover:text-red-400 text-xs shrink-0">✕</button>
                          </div>
                        </div>
                      ) : (
                        <button
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

                  {/* Tag selector */}
                  <div className="space-y-1.5">
                    <label className="text-xs text-[#555]">Tag</label>
                    <div className="flex flex-wrap gap-1.5">
                      {TAGS.map(({ value, label, color }) => (
                        <button
                          key={value}
                          onClick={() => setNewTag(value)}
                          className="px-2.5 py-1.5 rounded-lg text-[10px] font-bold border transition-all"
                          style={
                            newTag === value
                              ? { color, borderColor: color, backgroundColor: color + "18" }
                              : { color: "#555", borderColor: "#2a2a2a", backgroundColor: "transparent" }
                          }
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Usage instructions */}
                  <div className="space-y-1.5">
                    <label className="text-xs text-[#555]">How should this be used? <span className="text-[#444]">(optional but powerful)</span></label>
                    <textarea
                      value={newInstructions}
                      onChange={(e) => setNewInstructions(e.target.value)}
                      placeholder="e.g. Reference the ferritin levels from January vs April to show improvement over the protocol. Also flag the B12 trend as a secondary point."
                      rows={3}
                      className="w-full bg-[#111] border border-[#2a2a2a] rounded-lg px-3 py-2 text-sm text-white placeholder-[#444] focus:outline-none focus:border-[#444] resize-y"
                    />
                  </div>

                  <div className="flex items-center gap-3">
                    <button
                      onClick={commitItem}
                      disabled={!canCommit}
                      className="bg-white text-black text-sm font-medium px-4 py-2 rounded-lg hover:bg-[#e8e8e8] transition-colors disabled:opacity-40"
                    >
                      Add item
                    </button>
                    <button onClick={resetAddForm} className="text-[#666] text-sm hover:text-[#999] transition-colors">
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setShowAddForm(true)}
                  className="text-sm text-[#666] border border-[#2a2a2a] rounded-lg px-4 py-2 hover:text-[#aaa] hover:border-[#444] transition-colors w-full"
                >
                  + Add context item
                </button>
              )}
            </div>
          )}
        </div>

        {/* ── Signature selector ── */}
        {signatures.length > 0 && (
          <div className="space-y-2">
            <label className="text-sm font-medium text-[#aaa]">Signature</label>
            <div className="flex flex-wrap gap-2">
              <button
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
                <button key={sig.id} onClick={() => setSelectedSigId(sig.id)}
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

        {error && <p className="text-sm text-red-400">{error}</p>}

        <button
          onClick={generate}
          disabled={generating}
          className="w-full bg-white text-black font-medium py-3 rounded-xl hover:bg-[#e8e8e8] transition-colors disabled:opacity-40 text-sm"
        >
          {generating ? "Writing..." : "Generate in my voice"}
        </button>
      </div>

      {/* Output */}
      {(output || generating) && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-medium text-white text-sm">Output</h2>
            {output && (
              <div className="flex gap-2">
                <button onClick={copyOutput}
                  className="text-xs text-[#666] hover:text-white transition-colors border border-[#333] rounded-md px-3 py-1.5"
                >
                  {copied ? "Copied!" : "Copy"}
                </button>
                <button onClick={() => router.push("/history")}
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
            <button onClick={generate} className="text-xs text-[#555] hover:text-[#888] transition-colors">
              Regenerate
            </button>
          )}
        </div>
      )}
    </div>
  );
}
