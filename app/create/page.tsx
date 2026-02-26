"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { type ContextLink, type ContextFile, type LinkTag } from "@/lib/claude";

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
  { value: "blog", label: "Blog post / Article", desc: "Long-form written piece" },
  { value: "social", label: "Social media post", desc: "Twitter/X, LinkedIn, etc." },
  { value: "caption", label: "Caption", desc: "Short-form — Instagram, TikTok" },
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
  {
    key: "topic",
    label: "What is this piece about?",
    placeholder: "e.g. Why most productivity advice is wrong for creators",
    required: true,
  },
  {
    key: "angle",
    label: "What's your angle or main argument?",
    placeholder: "e.g. Productivity advice assumes consistent work, but creative work is inherently unpredictable",
    required: true,
    multiline: true,
  },
  {
    key: "keyPoints",
    label: "Key points, ideas, or structure to cover",
    placeholder: "e.g.\n- The myth of the 'deep work' schedule\n- How I actually write: in bursts\n- What actually works: environment design not time blocks",
    required: true,
    multiline: true,
  },
  {
    key: "sourcesOrData",
    label: "Any sources, data, or references to include?",
    placeholder: "e.g. Cal Newport's Deep Work framework, my own experience writing 200+ posts",
    required: false,
    multiline: true,
    hint: "Optional — leave blank if none",
  },
  {
    key: "targetAudience",
    label: "Who is the audience?",
    placeholder: "e.g. Indie creators, solopreneurs, people who feel guilty about not working enough",
    required: false,
    hint: "Optional — defaults to your usual audience",
  },
  {
    key: "toneNotes",
    label: "Any specific tone notes for this piece?",
    placeholder: "e.g. A bit more vulnerable than usual, less polished, more raw",
    required: false,
    hint: "Optional — leave blank to match your normal voice",
  },
  {
    key: "wordCountTarget",
    label: "Target length?",
    placeholder: "e.g. 800 words, or leave blank for default",
    required: false,
    showFor: ["blog"],
    hint: "Optional",
  },
];

const LINK_TAGS: { value: LinkTag; label: string; color: string }[] = [
  { value: "data",      label: "Data",      color: "#facc15" },
  { value: "example",   label: "Example",   color: "#60a5fa" },
  { value: "research",  label: "Research",  color: "#a78bfa" },
  { value: "reference", label: "Reference", color: "#9ca3af" },
];

const FILE_SIZE_LIMIT = 50 * 1024; // 50KB

export default function CreatePage() {
  const router = useRouter();

  // Form
  const [form, setForm] = useState<FormState>({
    contentType: "blog",
    topic: "",
    angle: "",
    keyPoints: "",
    sourcesOrData: "",
    targetAudience: "",
    toneNotes: "",
    wordCountTarget: "",
  });

  // Context panel
  const [showContext, setShowContext] = useState(false);
  const [links, setLinks] = useState<ContextLink[]>([]);
  const [newLinkUrl, setNewLinkUrl] = useState("");
  const [newLinkTag, setNewLinkTag] = useState<LinkTag>("reference");
  const [files, setFiles] = useState<ContextFile[]>([]);
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

  function addLink() {
    if (!newLinkUrl.trim()) return;
    setLinks((l) => [...l, { url: newLinkUrl.trim(), tag: newLinkTag }]);
    setNewLinkUrl("");
    setNewLinkTag("reference");
  }

  function removeLink(i: number) {
    setLinks((l) => l.filter((_, idx) => idx !== i));
  }

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? []);
    picked.forEach((file) => {
      if (file.size > FILE_SIZE_LIMIT) {
        alert(`${file.name} is too large (max 50KB).`);
        return;
      }
      const isCSV = file.name.toLowerCase().endsWith(".csv");
      const reader = new FileReader();
      reader.onload = (ev) => {
        const content = ev.target?.result as string;
        setFiles((prev) => [
          ...prev,
          { name: file.name, type: isCSV ? "csv" : "text", content, includePlaceholders: false },
        ]);
      };
      reader.readAsText(file);
    });
    // reset input so the same file can be re-picked
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function removeFile(i: number) {
    setFiles((f) => f.filter((_, idx) => idx !== i));
  }

  function togglePlaceholders(i: number) {
    setFiles((prev) =>
      prev.map((f, idx) =>
        idx === i ? { ...f, includePlaceholders: !f.includePlaceholders } : f
      )
    );
  }

  const selectedSig = signatures.find((s) => s.id === selectedSigId) ?? null;

  const hasContext =
    links.length > 0 || files.length > 0;

  async function generate() {
    if (!form.topic.trim() || !form.angle.trim() || !form.keyPoints.trim()) {
      setError("Please fill in the topic, angle, and key points.");
      return;
    }
    setError("");
    setGenerating(true);
    setOutput("");

    const context =
      links.length > 0 || files.length > 0
        ? { links, files }
        : undefined;

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

    // Append signature client-side after stream completes
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
              <button
                key={value}
                onClick={() => set("contentType", value)}
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
              <textarea
                value={form[q.key]}
                onChange={(e) => set(q.key, e.target.value)}
                placeholder={q.placeholder}
                rows={4}
                className="w-full bg-[#111] border border-[#2a2a2a] rounded-lg px-3 py-2.5 text-sm text-white placeholder-[#444] focus:outline-none focus:border-[#444] resize-y"
              />
            ) : (
              <input
                type="text"
                value={form[q.key]}
                onChange={(e) => set(q.key, e.target.value)}
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
              <span className="text-sm font-medium text-[#aaa]">Add context</span>
              {hasContext && (
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-white/10 text-white">
                  {links.length + files.length} item{links.length + files.length !== 1 ? "s" : ""}
                </span>
              )}
            </div>
            <span className="text-xs text-[#555]">
              {showContext ? "Hide" : "Links, files, data"}
            </span>
          </button>

          {showContext && (
            <div className="px-4 pb-4 pt-3 space-y-5 bg-[#111] border-t border-[#222]">
              {/* Links */}
              <div className="space-y-3">
                <div className="text-xs font-semibold text-[#555] uppercase tracking-widest">
                  Referenced links
                </div>

                {links.length > 0 && (
                  <div className="space-y-2">
                    {links.map((l, i) => {
                      const meta = LINK_TAGS.find((t) => t.value === l.tag)!;
                      return (
                        <div
                          key={i}
                          className="flex items-center gap-2 bg-[#161616] border border-[#222] rounded-lg px-3 py-2"
                        >
                          <span
                            className="text-[10px] font-bold px-1.5 py-0.5 rounded border shrink-0"
                            style={{ color: meta.color, borderColor: meta.color + "55", backgroundColor: meta.color + "15" }}
                          >
                            {meta.label}
                          </span>
                          <span className="text-xs text-[#888] truncate flex-1">{l.url}</span>
                          <button
                            onClick={() => removeLink(i)}
                            className="text-[#444] hover:text-red-400 text-xs transition-colors shrink-0"
                          >
                            ✕
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}

                <div className="flex gap-2">
                  <div className="flex gap-1">
                    {LINK_TAGS.map(({ value, label, color }) => (
                      <button
                        key={value}
                        onClick={() => setNewLinkTag(value)}
                        className="px-2.5 py-1.5 rounded-lg text-[10px] font-semibold border transition-all"
                        style={
                          newLinkTag === value
                            ? { color, borderColor: color, backgroundColor: color + "18" }
                            : { color: "#555", borderColor: "#2a2a2a", backgroundColor: "transparent" }
                        }
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex gap-2">
                  <input
                    type="url"
                    value={newLinkUrl}
                    onChange={(e) => setNewLinkUrl(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && addLink()}
                    placeholder="https://..."
                    className="flex-1 bg-[#0f0f0f] border border-[#2a2a2a] rounded-lg px-3 py-2 text-sm text-white placeholder-[#444] focus:outline-none focus:border-[#444]"
                  />
                  <button
                    onClick={addLink}
                    disabled={!newLinkUrl.trim()}
                    className="bg-[#222] text-[#ccc] text-sm px-3 py-2 rounded-lg hover:bg-[#2a2a2a] transition-colors disabled:opacity-40"
                  >
                    Add
                  </button>
                </div>
              </div>

              {/* Files */}
              <div className="space-y-3">
                <div className="text-xs font-semibold text-[#555] uppercase tracking-widest">
                  Uploaded files
                </div>
                <p className="text-xs text-[#555]">
                  .txt, .md, .csv — max 50KB each. Content is included as context for Claude.
                </p>

                {files.length > 0 && (
                  <div className="space-y-2">
                    {files.map((f, i) => (
                      <div
                        key={i}
                        className="bg-[#161616] border border-[#222] rounded-lg px-3 py-2.5 space-y-2"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-white font-medium">{f.name}</span>
                            <span className="text-[10px] text-[#555]">
                              {(f.content.length / 1024).toFixed(1)}KB
                            </span>
                            {f.type === "csv" && (
                              <span className="text-[10px] font-semibold text-amber-400 border border-amber-400/30 bg-amber-400/10 px-1.5 py-0.5 rounded">
                                CSV
                              </span>
                            )}
                          </div>
                          <button
                            onClick={() => removeFile(i)}
                            className="text-[#444] hover:text-red-400 text-xs transition-colors"
                          >
                            ✕
                          </button>
                        </div>
                        {f.type === "csv" && (
                          <label className="flex items-center gap-2 cursor-pointer select-none">
                            <div
                              onClick={() => togglePlaceholders(i)}
                              className={`w-7 h-3.5 rounded-full transition-colors relative ${
                                f.includePlaceholders ? "bg-white" : "bg-[#333]"
                              }`}
                            >
                              <div
                                className={`absolute top-0.5 w-2.5 h-2.5 rounded-full bg-black transition-transform ${
                                  f.includePlaceholders ? "translate-x-3.5" : "translate-x-0.5"
                                }`}
                              />
                            </div>
                            <span className="text-xs text-[#666]">
                              Include chart / table placeholders
                            </span>
                          </label>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".txt,.md,.csv"
                  multiple
                  onChange={handleFileUpload}
                  className="hidden"
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="text-sm text-[#666] border border-[#2a2a2a] rounded-lg px-4 py-2 hover:text-[#aaa] hover:border-[#444] transition-colors"
                >
                  + Upload file
                </button>
              </div>
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
                <button
                  key={sig.id}
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
                <button
                  onClick={copyOutput}
                  className="text-xs text-[#666] hover:text-white transition-colors border border-[#333] rounded-md px-3 py-1.5"
                >
                  {copied ? "Copied!" : "Copy"}
                </button>
                <button
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
