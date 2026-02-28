/**
 * Client-side export utilities for ghostwriter drafts.
 * No server-only imports — safe for "use client" components.
 */

import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } from "docx";

/** Sanitize a topic string into a safe filename stem */
export function safeFilename(topic: string): string {
  return topic.slice(0, 60).replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "draft";
}

/** Trigger a browser download for a Blob */
function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Download as .txt */
export function downloadTxt(topic: string, draft: string) {
  const blob = new Blob([draft], { type: "text/plain" });
  downloadBlob(blob, `${safeFilename(topic)}.txt`);
}

/** Download as .md */
export function downloadMarkdown(topic: string, draft: string) {
  const blob = new Blob([draft], { type: "text/markdown" });
  downloadBlob(blob, `${safeFilename(topic)}.md`);
}

/** Download as .html — wraps rendered markdown in a styled HTML document */
export function downloadHtml(topic: string, draft: string, renderMarkdown: (md: string) => string) {
  const htmlBody = renderMarkdown(draft);
  const escaped = topic.replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const fullHtml = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${escaped}</title>
<style>
  body{font-family:Georgia,serif;font-size:15px;line-height:1.75;max-width:680px;margin:48px auto;color:#111;padding:0 24px}
  h1{font-size:2em;margin-bottom:.4em}h2{font-size:1.4em}h3{font-size:1.2em}
  p{margin:0 0 1em}ul{margin:0 0 1em;padding-left:1.4em}li{margin-bottom:.3em}
  code{font-family:monospace;background:#f2f2f2;padding:0 .3em}
  hr{border:none;border-top:1px solid #ccc;margin:1.5em 0}
  strong{font-weight:700}em{font-style:italic}
</style>
</head>
<body>${htmlBody}</body>
</html>`;
  const blob = new Blob([fullHtml], { type: "text/html" });
  downloadBlob(blob, `${safeFilename(topic)}.html`);
}

/** Parse **bold**, *italic*, and `code` into TextRun children */
function parseInlineFormatting(text: string): TextRun[] {
  const runs: TextRun[] = [];
  const regex = /(\*\*\*(.+?)\*\*\*|\*\*(.+?)\*\*|\*(.+?)\*|`([^`]+)`)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      runs.push(new TextRun(text.slice(lastIndex, match.index)));
    }
    if (match[2]) {
      runs.push(new TextRun({ text: match[2], bold: true, italics: true }));
    } else if (match[3]) {
      runs.push(new TextRun({ text: match[3], bold: true }));
    } else if (match[4]) {
      runs.push(new TextRun({ text: match[4], italics: true }));
    } else if (match[5]) {
      runs.push(new TextRun({ text: match[5], font: "Courier New" }));
    }
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    runs.push(new TextRun(text.slice(lastIndex)));
  }
  if (runs.length === 0) {
    runs.push(new TextRun(text));
  }
  return runs;
}

/** Download as .docx — parses markdown into Word document */
export async function downloadDocx(topic: string, draft: string) {
  const paragraphs: Paragraph[] = [];
  const lines = draft.split("\n");

  for (const line of lines) {
    if (line.match(/^### (.+)/)) {
      paragraphs.push(new Paragraph({
        text: line.replace(/^### /, ""),
        heading: HeadingLevel.HEADING_3,
      }));
    } else if (line.match(/^## (.+)/)) {
      paragraphs.push(new Paragraph({
        text: line.replace(/^## /, ""),
        heading: HeadingLevel.HEADING_2,
      }));
    } else if (line.match(/^# (.+)/)) {
      paragraphs.push(new Paragraph({
        text: line.replace(/^# /, ""),
        heading: HeadingLevel.HEADING_1,
      }));
    } else if (line.match(/^---+$/)) {
      paragraphs.push(new Paragraph({ text: "" }));
    } else if (line.match(/^[-*] (.+)/)) {
      const text = line.replace(/^[-*] /, "");
      paragraphs.push(new Paragraph({
        children: parseInlineFormatting(text),
        bullet: { level: 0 },
      }));
    } else if (line.match(/^\d+\. (.+)/)) {
      const text = line.replace(/^\d+\. /, "");
      paragraphs.push(new Paragraph({
        children: parseInlineFormatting(text),
        numbering: { reference: "default-numbering", level: 0 },
      }));
    } else if (line.trim() === "") {
      paragraphs.push(new Paragraph({ text: "" }));
    } else {
      paragraphs.push(new Paragraph({
        children: parseInlineFormatting(line),
      }));
    }
  }

  const doc = new Document({
    numbering: {
      config: [{
        reference: "default-numbering",
        levels: [{
          level: 0,
          format: "decimal" as const,
          text: "%1.",
          alignment: AlignmentType.START,
        }],
      }],
    },
    sections: [{ children: paragraphs }],
  });

  const blob = await Packer.toBlob(doc);
  downloadBlob(blob, `${safeFilename(topic)}.docx`);
}

/** Open print dialog for PDF (browser-native) */
export function printAsPdf(topic: string, draft: string, renderMarkdown: (md: string) => string) {
  const win = window.open("", "_blank", "width=800,height=900");
  if (!win) return;
  const escaped = topic.replace(/</g, "&lt;").replace(/>/g, "&gt;");
  win.document.write(`<!DOCTYPE html><html><head>
<meta charset="utf-8">
<title>${escaped}</title>
<style>
  body{font-family:Georgia,serif;font-size:15px;line-height:1.75;max-width:680px;margin:48px auto;color:#111}
  h1{font-size:2em;margin-bottom:.4em}h2{font-size:1.4em}h3{font-size:1.2em}
  p{margin:0 0 1em}ul{margin:0 0 1em;padding-left:1.4em}li{margin-bottom:.3em}
  code{font-family:monospace;background:#f2f2f2;padding:0 .3em}
  hr{border:none;border-top:1px solid #ccc;margin:1.5em 0}
  strong{font-weight:700}em{font-style:italic}
  @media print{body{margin:0}}
</style>
</head><body>${renderMarkdown(draft)}</body></html>`);
  win.document.close();
  win.focus();
  win.print();
}
