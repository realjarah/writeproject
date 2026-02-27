"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "tiptap-markdown";
import { useState, useRef, useCallback, KeyboardEvent } from "react";

// ── Helpers ───────────────────────────────────────────────────────────────────

function countWords(text: string) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function parseTweets(draft: string): string[] {
  return draft
    .split(/\n---\n|\n---$|^---\n/m)
    .map((t) => t.trim())
    .filter(Boolean);
}

function downloadFile(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Toolbar button ────────────────────────────────────────────────────────────

function TBtn({
  onClick,
  active,
  disabled,
  title,
  children,
}: {
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`h-6 px-1.5 rounded text-[11px] font-medium transition-colors disabled:opacity-25 select-none ${
        active
          ? "bg-black/[0.12] dark:bg-white/[0.14] text-black/90 dark:text-white"
          : "text-black/45 dark:text-white/35 hover:bg-black/[0.06] dark:hover:bg-white/[0.06] hover:text-black/75 dark:hover:text-white/65"
      }`}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <span className="w-px h-3.5 bg-black/[0.1] dark:bg-white/[0.1] mx-0.5 shrink-0" />;
}

// ── Main component ────────────────────────────────────────────────────────────

interface DraftEditorProps {
  jobId: number;
  initialDraft: string;
  contentType: string;
  jobTitle?: string;
  onDraftChange?: (draft: string) => void;
}

export default function DraftEditor({
  jobId,
  initialDraft,
  contentType,
  jobTitle,
  onDraftChange,
}: DraftEditorProps) {
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "unsaved">("saved");
  const [isRevising, setIsRevising]   = useState(false);
  const [streamPreview, setStreamPreview] = useState("");
  const [prompt, setPrompt]           = useState("");
  const [viewMode, setViewMode]       = useState<"editor" | "tweets">("editor");
  const [copied, setCopied]           = useState(false);

  const saveTimerRef    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentDraftRef = useRef(initialDraft);

  const isThread = contentType === "twitter_thread";

  // ── TipTap setup ─────────────────────────────────────────────────────────

  const editor = useEditor({
    extensions: [
      StarterKit,
      Markdown.configure({ html: false, transformCopiedText: true, transformPastedText: true }),
    ],
    content: initialDraft,
    onUpdate({ editor }) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const md: string = (editor.storage as any).markdown.getMarkdown();
      currentDraftRef.current = md;
      setSaveStatus("unsaved");
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => saveDraft(md), 1500);
    },
    editorProps: {
      attributes: {
        // Styling applied via wrapper div using [&_.ProseMirror] selectors below
        class: "focus:outline-none",
      },
    },
  });

  // ── Save ──────────────────────────────────────────────────────────────────

  const saveDraft = useCallback(
    async (markdown: string) => {
      setSaveStatus("saving");
      await fetch(`/api/ghostwriter/${jobId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ finalDraft: markdown }),
      }).catch(() => {});
      setSaveStatus("saved");
      onDraftChange?.(markdown);
    },
    [jobId, onDraftChange]
  );

  // ── AI revision ───────────────────────────────────────────────────────────

  async function applyAIRevision() {
    if (!prompt.trim() || isRevising || !editor) return;
    setIsRevising(true);
    setStreamPreview("");

    try {
      const res = await fetch(`/api/ghostwriter/${jobId}/revise`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feedback: prompt }),
      });
      if (!res.ok) return;

      const reader = res.body!.getReader();
      const dec    = new TextDecoder();
      let buf = "";
      let accumulated = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const msg = JSON.parse(line.slice(6));
            if (msg.type === "chunk") {
              accumulated += msg.text;
              setStreamPreview(accumulated);
            } else if (msg.type === "done") {
              // Parse and set new markdown content
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const newDoc = (editor.storage as any).markdown.parse(msg.finalDraft);
              editor.commands.setContent(newDoc);
              currentDraftRef.current = msg.finalDraft;
              onDraftChange?.(msg.finalDraft);
              setSaveStatus("saved");
              setPrompt("");
            }
          } catch { /* malformed SSE */ }
        }
      }
    } finally {
      setIsRevising(false);
      setStreamPreview("");
    }
  }

  function handlePromptKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); applyAIRevision(); }
  }

  // ── Clipboard / export ────────────────────────────────────────────────────

  function copyToClipboard() {
    navigator.clipboard.writeText(currentDraftRef.current);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleDownload() {
    const slug = (jobTitle || "draft").slice(0, 60).replace(/[^a-z0-9]+/gi, "-");
    downloadFile(`${slug}.md`, currentDraftRef.current);
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (!editor) return null;

  const wc = countWords(currentDraftRef.current);
  const tweets = isThread ? parseTweets(currentDraftRef.current) : [];

  return (
    <div className="flex flex-col border-t border-black/[0.06] dark:border-white/[0.05]">

      {/* ── Toolbar ──────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-2 px-3 py-1.5 border-b border-black/[0.06] dark:border-white/[0.05] bg-black/[0.02] dark:bg-black/30 flex-wrap">

        {/* Left: format controls */}
        <div className="flex items-center gap-0.5 flex-wrap">
          <TBtn onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()} title="Undo (⌘Z)">↩</TBtn>
          <TBtn onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()} title="Redo (⌘⇧Z)">↪</TBtn>

          <Divider />

          <TBtn onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive("bold")} title="Bold (⌘B)">
            <strong>B</strong>
          </TBtn>
          <TBtn onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive("italic")} title="Italic (⌘I)">
            <em>I</em>
          </TBtn>
          <TBtn onClick={() => editor.chain().focus().toggleStrike().run()} active={editor.isActive("strike")} title="Strikethrough">
            <s>S</s>
          </TBtn>

          <Divider />

          <TBtn onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} active={editor.isActive("heading", { level: 1 })} title="Heading 1">H1</TBtn>
          <TBtn onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} active={editor.isActive("heading", { level: 2 })} title="Heading 2">H2</TBtn>
          <TBtn onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} active={editor.isActive("heading", { level: 3 })} title="Heading 3">H3</TBtn>

          <Divider />

          <TBtn onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive("bulletList")} title="Bullet list">
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 6.75h12M8.25 12h12M8.25 17.25h12M3.75 6.75h.007v.008H3.75V6.75zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM3.75 12h.007v.008H3.75V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm-.375 5.25h.007v.008H3.75v-.008zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
            </svg>
          </TBtn>
          <TBtn onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive("orderedList")} title="Numbered list">
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 6.75h12M8.25 12h12M8.25 17.25h12M3 6.75h.75m-.75 0v.5m0-.5V6m.75.75V6M3 12h.75m-.75 0v.5m0-.5V11.5m.75.5v-.5" />
            </svg>
          </TBtn>
          <TBtn onClick={() => editor.chain().focus().toggleBlockquote().run()} active={editor.isActive("blockquote")} title="Blockquote">
            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
              <path d="M6 6a2 2 0 00-2 2v1a2 2 0 002 2 1 1 0 011 1v1a2 2 0 11-4 0v-1a4 4 0 014-4v1zm8 0a2 2 0 00-2 2v1a2 2 0 002 2 1 1 0 011 1v1a2 2 0 11-4 0v-1a4 4 0 014-4v1z" />
            </svg>
          </TBtn>

          {isThread && (
            <>
              <Divider />
              <TBtn onClick={() => editor.chain().focus().setHorizontalRule().run()} title="Tweet separator">
                <span className="text-[10px]">— sep</span>
              </TBtn>
            </>
          )}
        </div>

        {/* Right: view toggle + meta + actions */}
        <div className="flex items-center gap-2">
          {isThread && (
            <div className="flex items-center gap-0.5 bg-black/[0.04] dark:bg-white/[0.04] border border-black/[0.09] dark:border-white/[0.07] rounded-md p-0.5">
              <button
                type="button"
                onClick={() => setViewMode("editor")}
                className={`text-[10px] px-2 py-0.5 rounded transition-colors ${viewMode === "editor" ? "bg-black/[0.09] dark:bg-white/[0.10] text-black/90 dark:text-white" : "text-black/40 dark:text-white/35 hover:text-black/65"}`}
              >
                Editor
              </button>
              <button
                type="button"
                onClick={() => setViewMode("tweets")}
                className={`text-[10px] px-2 py-0.5 rounded transition-colors ${viewMode === "tweets" ? "bg-black/[0.09] dark:bg-white/[0.10] text-black/90 dark:text-white" : "text-black/40 dark:text-white/35 hover:text-black/65"}`}
              >
                Tweets
              </button>
            </div>
          )}

          <span className="text-[10px] text-black/25 dark:text-white/20 tabular-nums">{wc.toLocaleString()} words</span>

          <span className={`text-[10px] tabular-nums ${
            saveStatus === "saved"   ? "text-emerald-400/70" :
            saveStatus === "saving"  ? "text-amber-400/60 animate-pulse" :
                                       "text-black/30 dark:text-white/25"
          }`}>
            {saveStatus === "saved" ? "Saved" : saveStatus === "saving" ? "Saving…" : "Unsaved"}
          </span>

          <button
            type="button"
            onClick={copyToClipboard}
            className="text-[11px] text-black/40 dark:text-white/30 hover:text-black/70 dark:hover:text-white/60 border border-black/[0.1] dark:border-white/[0.08] rounded-md px-2.5 py-1 transition-colors"
          >
            {copied ? "Copied!" : "Copy"}
          </button>

          <button
            type="button"
            onClick={handleDownload}
            className="text-[11px] text-black/40 dark:text-white/30 hover:text-black/70 dark:hover:text-white/60 border border-black/[0.1] dark:border-white/[0.08] rounded-md px-2.5 py-1 transition-colors"
            title="Download as .md"
          >
            Download
          </button>
        </div>
      </div>

      {/* ── Editor / Tweet view ───────────────────────────────────────────── */}
      <div className="relative">

        {/* Tweet card view */}
        {isThread && viewMode === "tweets" ? (
          <div className="px-5 py-4 space-y-2">
            {tweets.map((tweet, idx, arr) => {
              const len  = tweet.length;
              const over = len > 280;
              return (
                <div
                  key={idx}
                  className={`bg-black/[0.04] dark:bg-[#111] border rounded-lg p-4 space-y-2 ${over ? "border-red-500/40" : "border-black/[0.09] dark:border-white/[0.07]"}`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-black/[0.28] dark:text-white/[0.28]">{idx + 1} / {arr.length}</span>
                    <span className={`text-[10px] tabular-nums font-medium ${over ? "text-red-400" : len > 240 ? "text-amber-400" : "text-black/[0.35] dark:text-white/[0.35]"}`}>
                      {len} / 280
                    </span>
                  </div>
                  <p className="text-sm text-black/[0.75] dark:text-[#ccc] leading-relaxed whitespace-pre-wrap">{tweet}</p>
                  {over && <p className="text-[10px] text-red-400">⚠ {len - 280} characters over limit</p>}
                </div>
              );
            })}
          </div>
        ) : (
          /* TipTap editor with prose styles via wrapper */
          <div className="
            [&_.ProseMirror]:min-h-[300px]
            [&_.ProseMirror]:px-6
            [&_.ProseMirror]:py-5
            [&_.ProseMirror]:text-[14px]
            [&_.ProseMirror]:leading-[1.82]
            [&_.ProseMirror]:text-black/85
            dark:[&_.ProseMirror]:text-white/80
            [&_.ProseMirror_h1]:text-[1.4em]
            [&_.ProseMirror_h1]:font-bold
            [&_.ProseMirror_h1]:mb-3
            [&_.ProseMirror_h1]:mt-5
            [&_.ProseMirror_h1]:text-black/90
            dark:[&_.ProseMirror_h1]:text-white/90
            [&_.ProseMirror_h2]:text-[1.2em]
            [&_.ProseMirror_h2]:font-semibold
            [&_.ProseMirror_h2]:mb-2
            [&_.ProseMirror_h2]:mt-4
            [&_.ProseMirror_h2]:text-black/90
            dark:[&_.ProseMirror_h2]:text-white/90
            [&_.ProseMirror_h3]:text-[1.05em]
            [&_.ProseMirror_h3]:font-semibold
            [&_.ProseMirror_h3]:mb-2
            [&_.ProseMirror_h3]:mt-3
            [&_.ProseMirror_h3]:text-black/85
            dark:[&_.ProseMirror_h3]:text-white/85
            [&_.ProseMirror_p]:mb-[0.9em]
            [&_.ProseMirror_ul]:pl-5
            [&_.ProseMirror_ul]:mb-3
            [&_.ProseMirror_ol]:pl-5
            [&_.ProseMirror_ol]:mb-3
            [&_.ProseMirror_li]:mb-1
            [&_.ProseMirror_li]:marker:text-black/35
            dark:[&_.ProseMirror_li]:marker:text-white/30
            [&_.ProseMirror_blockquote]:border-l-[2px]
            [&_.ProseMirror_blockquote]:border-black/[0.14]
            dark:[&_.ProseMirror_blockquote]:border-white/[0.14]
            [&_.ProseMirror_blockquote]:pl-4
            [&_.ProseMirror_blockquote]:italic
            [&_.ProseMirror_blockquote]:text-black/55
            dark:[&_.ProseMirror_blockquote]:text-white/45
            [&_.ProseMirror_blockquote]:my-3
            [&_.ProseMirror_hr]:border-none
            [&_.ProseMirror_hr]:border-t
            [&_.ProseMirror_hr]:border-black/[0.1]
            dark:[&_.ProseMirror_hr]:border-white/[0.08]
            [&_.ProseMirror_hr]:my-5
            [&_.ProseMirror_code]:font-mono
            [&_.ProseMirror_code]:text-[0.88em]
            [&_.ProseMirror_code]:bg-black/[0.06]
            dark:[&_.ProseMirror_code]:bg-white/[0.06]
            [&_.ProseMirror_code]:px-1
            [&_.ProseMirror_code]:py-0.5
            [&_.ProseMirror_code]:rounded
            [&_.ProseMirror_strong]:font-bold
            [&_.ProseMirror_em]:italic
            [&_.ProseMirror_s]:line-through
            [&_.ProseMirror_.is-editor-empty:first-child]:before:content-[attr(data-placeholder)]
            [&_.ProseMirror_.is-editor-empty:first-child]:before:text-black/25
            dark:[&_.ProseMirror_.is-editor-empty:first-child]:before:text-white/20
            [&_.ProseMirror_.is-editor-empty:first-child]:before:pointer-events-none
            [&_.ProseMirror_.is-editor-empty:first-child]:before:float-left
          ">
            <EditorContent editor={editor} />
          </div>
        )}

        {/* AI revision overlay */}
        {isRevising && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/85 dark:bg-[#0e0e0e]/90 backdrop-blur-[2px] z-10">
            <div className="space-y-4 text-center max-w-xs px-6 py-8">
              <div className="flex items-center justify-center gap-1.5">
                {[0, 130, 260].map((d) => (
                  <span
                    key={d}
                    className="w-2 h-2 rounded-full bg-amber-400 animate-pulse"
                    style={{ animationDelay: `${d}ms` }}
                  />
                ))}
              </div>
              <p className="text-[13px] text-black/50 dark:text-white/40">AI is editing your draft…</p>
              {streamPreview && (
                <p className="text-[11px] text-black/30 dark:text-white/25 leading-relaxed text-left line-clamp-5 font-mono">
                  {streamPreview.slice(-350)}
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── AI prompt bar ─────────────────────────────────────────────────── */}
      <div className="border-t border-black/[0.06] dark:border-white/[0.05] px-4 py-3 flex items-center gap-3 bg-black/[0.015] dark:bg-black/20">
        {/* Sparkle icon */}
        <svg
          className="w-3.5 h-3.5 text-amber-400/55 shrink-0"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.8}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456z" />
        </svg>

        <input
          type="text"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={handlePromptKey}
          disabled={isRevising}
          placeholder='Ask AI to edit — "Sharpen the intro", "Cut by 20%", "Add a closing CTA", "Make it less formal"'
          className="flex-1 min-w-0 bg-transparent text-[13px] text-black/80 dark:text-white/70 placeholder-black/20 dark:placeholder-white/15 focus:outline-none disabled:opacity-40"
        />

        {prompt.trim() && !isRevising && (
          <button
            type="button"
            onClick={() => setPrompt("")}
            className="text-[11px] text-black/20 dark:text-white/15 hover:text-black/45 dark:hover:text-white/40 transition-colors shrink-0"
          >
            ✕
          </button>
        )}

        <button
          type="button"
          onClick={applyAIRevision}
          disabled={!prompt.trim() || isRevising}
          className="shrink-0 text-[12px] font-medium text-black/60 dark:text-white/50 hover:text-black/90 dark:hover:text-white border border-black/[0.12] dark:border-white/[0.1] rounded-md px-3 py-1.5 disabled:opacity-25 transition-colors"
        >
          {isRevising ? "Editing…" : "Apply"}
        </button>
      </div>
    </div>
  );
}
