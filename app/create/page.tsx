"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

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
    multiline: false,
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
    placeholder: "e.g. Cal Newport's Deep Work framework, my own experience writing 200+ posts, stat: 80% of creators report irregular output",
    required: false,
    multiline: true,
    hint: "Optional — leave blank if none",
  },
  {
    key: "targetAudience",
    label: "Who is the audience?",
    placeholder: "e.g. Indie creators, solopreneurs, people who feel guilty about not working enough",
    required: false,
    multiline: false,
    hint: "Optional — defaults to your usual audience",
  },
  {
    key: "toneNotes",
    label: "Any specific tone notes for this piece?",
    placeholder: "e.g. A bit more vulnerable than usual, less polished, more raw",
    required: false,
    multiline: false,
    hint: "Optional — leave blank to match your normal voice",
  },
  {
    key: "wordCountTarget",
    label: "Target length?",
    placeholder: "e.g. 800 words, or leave blank for default",
    required: false,
    multiline: false,
    showFor: ["blog"],
    hint: "Optional",
  },
];

export default function CreatePage() {
  const router = useRouter();
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
  const [generating, setGenerating] = useState(false);
  const [output, setOutput] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  function set(key: keyof FormState, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function generate() {
    if (!form.topic.trim() || !form.angle.trim() || !form.keyPoints.trim()) {
      setError("Please fill in the topic, angle, and key points.");
      return;
    }
    setError("");
    setGenerating(true);
    setOutput("");

    const res = await fetch("/api/generate/stream", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
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
        <p className="text-[#666] text-sm mt-1">
          Brief the piece and your voice will write it.
        </p>
      </div>

      <div className="space-y-6">
        {/* Content type */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-[#aaa]">
            Content type
          </label>
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
