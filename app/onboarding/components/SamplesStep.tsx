import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { CONTENT_TYPE_GROUPS, CONTENT_TYPE_LABELS } from "@/lib/content-types";
import { detectCategory } from "@/lib/detectCategory";
import StepIndicator from "./StepIndicator";
import type { AddedSample, AccountType, Step } from "../types";

function wordCount(text: string) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export default function SamplesStep({
  selectedTypes,
  samples,
  setSamples,
  accountType,
  setStep,
  stepIndex,
  steps,
  questionCount,
}: {
  selectedTypes: string[];
  samples: AddedSample[];
  setSamples: (fn: (prev: AddedSample[]) => AddedSample[]) => void;
  accountType: AccountType;
  setStep: (s: Step) => void;
  stepIndex: number;
  steps: string[];
  questionCount: number;
}) {
  const [activeCat, setActiveCat] = useState(selectedTypes[0] ?? "");
  const [inputMode, setInputMode] = useState<"paste" | "url" | "file">("paste");
  const [pasteText, setPasteText] = useState("");
  const [sampleNotes, setSampleNotes] = useState("");
  const [sampleTitle, setSampleTitle] = useState("");
  const [urlInput, setUrlInput] = useState("");
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!activeCat && selectedTypes.length > 0) setActiveCat(selectedTypes[0]);
  }, [activeCat, selectedTypes]);

  const allTypes = CONTENT_TYPE_GROUPS.flatMap((g) => g.types);
  const typesToShow = selectedTypes.length > 0 ? selectedTypes : allTypes;

  function samplesForCat(cat: string) {
    return samples.filter((s) => s.category === cat);
  }

  function resetForm() {
    setPasteText("");
    setSampleNotes("");
    setSampleTitle("");
    setUrlInput("");
    setError("");
    setFetching(false);
  }

  async function addSampleFromText(text: string, title: string) {
    const wc = wordCount(text);
    if (wc < 50) {
      setError("Too short \u2014 paste something with at least 50 words.");
      return;
    }
    setError("");

    const cat = activeCat || detectCategory(text);

    const res = await fetch("/api/voice", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: text.trim(),
        category: cat,
        title: title || `Sample ${samples.length + 1}`,
        notes: sampleNotes.trim(),
      }),
    });

    if (!res.ok) {
      setError("Failed to save sample. Please try again.");
      return;
    }

    setSamples((prev) => [
      ...prev,
      {
        title: title || `Sample ${prev.length + 1}`,
        content: text.trim(),
        wordCount: wc,
        category: cat,
        notes: sampleNotes.trim(),
        inputMethod: inputMode,
      },
    ]);
    resetForm();
  }

  async function handlePasteAdd() {
    if (!pasteText.trim()) return;
    setFetching(true);
    await addSampleFromText(pasteText.trim(), sampleTitle);
    setFetching(false);
  }

  async function handleUrlImport() {
    if (!urlInput.trim()) return;
    setFetching(true);
    setError("");
    try {
      const res = await fetch("/api/voice/import-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: urlInput.trim() }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setError(data.error || "Could not fetch URL.");
        setFetching(false);
        return;
      }
      await addSampleFromText(data.text, data.title || urlInput.trim());
    } catch {
      setError("Fetch failed. Check the URL and try again.");
    }
    setFetching(false);
  }

  function handleFileUpload(file: File) {
    setError("");
    const inferredTitle = file.name.replace(/\.[^.]+$/, "").replace(/[-_]/g, " ");

    if (file.type === "application/pdf") {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const dataUrl = e.target?.result as string;
        const [, base64] = dataUrl.split(",");
        setFetching(true);
        try {
          const res = await fetch("/api/voice/import-pdf", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ data: base64, fileName: file.name }),
          });
          const data = await res.json();
          if (!res.ok || data.error) setError(data.error || "PDF extraction failed.");
          else await addSampleFromText(data.text, inferredTitle);
        } catch { setError("PDF extraction failed. Try again."); }
        setFetching(false);
      };
      reader.readAsDataURL(file);
      return;
    }

    if (file.name.endsWith(".docx") || file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const dataUrl = e.target?.result as string;
        const [, base64] = dataUrl.split(",");
        setFetching(true);
        try {
          const res = await fetch("/api/voice/import-docx", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ data: base64 }),
          });
          const data = await res.json();
          if (!res.ok || data.error) setError(data.error || "DOCX extraction failed.");
          else await addSampleFromText(data.text, inferredTitle);
        } catch { setError("DOCX extraction failed. Try again."); }
        setFetching(false);
      };
      reader.readAsDataURL(file);
      return;
    }

    const reader = new FileReader();
    reader.onload = async (e) => {
      const text = (e.target?.result as string) || "";
      if (!text.trim()) { setError("File appears empty."); return; }
      setFetching(true);
      await addSampleFromText(text, inferredTitle);
      setFetching(false);
    };
    reader.readAsText(file);
  }

  const wc = wordCount(pasteText);
  const catSamples = samplesForCat(activeCat);
  const emptyCats = typesToShow.filter((t) => samplesForCat(t).length === 0);

  return (
    <div className="max-w-2xl mx-auto space-y-6 pt-6 px-4">
      <StepIndicator current={stepIndex} steps={steps} />

      <div className="space-y-2">
        <h1 className="text-[22px] font-semibold text-black/90 dark:text-white tracking-tight">
          Train your ghostwriter
        </h1>
        {accountType === "individual" && (
          <div className="space-y-1.5">
            <p className="text-[14px] text-black/55 dark:text-white/45 leading-relaxed">
              We want the <span className="font-medium text-black/75 dark:text-white/65">raw stuff</span> &mdash; imperfect, half-baked, human text is gold. The ghostwriter handles editing and polish. Unedited writing is the best window into how your brain works.
            </p>
            <p className="text-[13px] text-black/40 dark:text-white/30 leading-relaxed">
              Finalized text is great too &mdash; just nothing touched by AI. The more we can get, the better.
            </p>
          </div>
        )}
        {accountType === "brand" && (
          <p className="text-[14px] text-black/45 dark:text-white/35 leading-relaxed">
            Upload writing samples that represent your brand voice. The more variety, the better.
          </p>
        )}
      </div>

      {/* Per-category progress cards */}
      {typesToShow.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {typesToShow.map((type) => {
            const count = samplesForCat(type).length;
            const isActive = activeCat === type;
            const color = count === 0 ? "bg-black/[0.04] dark:bg-white/[0.04]" :
                          count < 3 ? "bg-amber-400/15 dark:bg-amber-400/10" :
                                      "bg-emerald-400/15 dark:bg-emerald-400/10";
            const borderColor = isActive
              ? "border-black/25 dark:border-white/25 ring-1 ring-black/10 dark:ring-white/10"
              : "border-black/[0.08] dark:border-white/[0.07]";
            return (
              <button
                key={type}
                type="button"
                onClick={() => setActiveCat(type)}
                className={`px-3 py-2 rounded-xl text-[12px] font-medium border transition-all duration-150 ${color} ${borderColor}`}
              >
                <span className="text-black/70 dark:text-white/60">
                  {CONTENT_TYPE_LABELS[type] ?? type}
                </span>
                <span className={`ml-1.5 tabular-nums ${
                  count === 0 ? "text-black/30 dark:text-white/20" :
                  count < 3 ? "text-amber-600 dark:text-amber-400" :
                              "text-emerald-600 dark:text-emerald-400"
                }`}>
                  {count}/5
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Active category label */}
      {activeCat && (
        <p className="text-[11px] tracking-[0.12em] uppercase text-black/35 dark:text-white/25 font-semibold">
          Adding samples for: {CONTENT_TYPE_LABELS[activeCat] ?? activeCat}
        </p>
      )}

      {/* Samples added for this category */}
      {catSamples.length > 0 && (
        <div className="space-y-1.5">
          {catSamples.map((s, i) => (
            <div key={i} className="bg-black/[0.03] dark:bg-white/[0.03] border border-black/[0.08] dark:border-white/[0.07] rounded-lg px-3 py-2 flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-400/80 shrink-0" />
              <span className="text-[12px] text-black/60 dark:text-white/50 truncate flex-1">{s.title}</span>
              <span className="text-[10px] text-black/35 dark:text-white/25 shrink-0">{s.wordCount.toLocaleString()} words</span>
            </div>
          ))}
        </div>
      )}

      {/* Input area */}
      {catSamples.length < 5 && (
        <div className="bg-black/[0.03] dark:bg-white/[0.03] border border-black/[0.09] dark:border-white/[0.08] rounded-xl p-5 space-y-4">
          <div className="flex gap-1 border-b border-black/[0.09] dark:border-white/[0.08] pb-1">
            {(["paste", "url", "file"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => { setInputMode(mode); setError(""); }}
                className={`text-[11px] px-3 py-1 rounded-t transition-colors ${
                  inputMode === mode
                    ? "bg-black/[0.08] dark:bg-white/[0.09] text-black/90 dark:text-white"
                    : "text-black/40 dark:text-white/30 hover:text-black/60 dark:hover:text-white/50"
                }`}
              >
                {mode === "paste" ? "Paste text" : mode === "url" ? "Import from URL" : "Upload file"}
              </button>
            ))}
          </div>

          {inputMode === "paste" && (
            <div className="space-y-3">
              <textarea
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                placeholder={`Paste a ${CONTENT_TYPE_LABELS[activeCat] ?? "writing sample"} you've written\u2026`}
                rows={7}
                className="w-full bg-black/[0.02] dark:bg-white/[0.02] border border-black/[0.08] dark:border-white/[0.07] rounded-xl px-4 py-3 text-[14px] text-black/85 dark:text-white/80 placeholder-black/30 dark:placeholder-white/20 focus:outline-none focus:border-black/[0.18] dark:focus:border-white/[0.18] resize-none transition-colors"
              />
              {pasteText.trim() && (
                <p className="text-[11px] text-black/35 dark:text-white/25">{wc.toLocaleString()} words</p>
              )}
            </div>
          )}

          {inputMode === "url" && (
            <div className="flex gap-2">
              <input
                type="url"
                placeholder="https://your-blog.com/post-title"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleUrlImport(); }}
                className="flex-1 bg-black/[0.02] dark:bg-white/[0.02] border border-black/[0.09] dark:border-white/[0.08] rounded-lg px-3 py-2 text-[13px] text-black/85 dark:text-white/80 placeholder-black/30 dark:placeholder-white/20 focus:outline-none focus:border-black/[0.22] dark:focus:border-white/[0.22] transition-colors"
              />
              <Button type="button" variant="ghost" size="sm" onClick={handleUrlImport} disabled={!urlInput.trim() || fetching}>
                {fetching ? "Importing\u2026" : "Import"}
              </Button>
            </div>
          )}

          {inputMode === "file" && (
            <label className="flex flex-col items-center justify-center gap-2 py-8 border-2 border-dashed border-black/10 dark:border-white/[0.08] rounded-xl cursor-pointer hover:border-black/20 dark:hover:border-white/15 transition-colors">
              <svg className="w-6 h-6 text-black/30 dark:text-white/20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
              </svg>
              <span className="text-[13px] text-black/40 dark:text-white/30">Drop a file or click to browse</span>
              <span className="text-[11px] text-black/25 dark:text-white/15">.txt, .md, .pdf, .docx</span>
              <input
                type="file"
                accept=".txt,.md,.pdf,.docx"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFileUpload(f);
                  e.target.value = "";
                }}
              />
            </label>
          )}

          <textarea
            value={sampleNotes}
            onChange={(e) => setSampleNotes(e.target.value)}
            placeholder="What did you like about this piece? Why does it sound like you? (optional but helpful)"
            rows={2}
            className="w-full bg-black/[0.02] dark:bg-white/[0.02] border border-black/[0.08] dark:border-white/[0.07] rounded-xl px-4 py-2.5 text-[13px] text-black/70 dark:text-white/60 placeholder-black/25 dark:placeholder-white/15 focus:outline-none focus:border-black/[0.15] dark:focus:border-white/[0.15] resize-none transition-colors"
          />

          {error && <p className="text-[12px] text-red-400/80">{error}</p>}

          {inputMode === "paste" && (
            <Button type="button" variant="ghost" onClick={handlePasteAdd} disabled={!pasteText.trim() || fetching}>
              {fetching ? "Saving\u2026" : "+ Add sample"}
            </Button>
          )}
        </div>
      )}

      {catSamples.length >= 5 && (
        <p className="text-[12px] text-emerald-500 dark:text-emerald-400">
          Maximum reached for this format. Select another format above to continue adding.
        </p>
      )}

      {/* Continue */}
      <div className="flex items-center justify-between pt-4 border-t border-black/[0.07] dark:border-white/[0.06]">
        <button
          type="button"
          onClick={() => setStep("questions")}
          className="text-[12px] text-black/35 dark:text-white/25 hover:text-black/60 dark:hover:text-white/50 transition-colors"
        >
          &larr; Back
        </button>
        <div className="flex items-center gap-3">
          {emptyCats.length > 0 && samples.length > 0 && (
            <span className="text-[11px] text-black/30 dark:text-white/20">
              {emptyCats.length} format{emptyCats.length !== 1 ? "s" : ""} still empty
            </span>
          )}
          <Button type="button" onClick={() => setStep("words")}>
            {samples.length === 0 ? "Skip to next" : "Continue"}
          </Button>
        </div>
      </div>
    </div>
  );
}
