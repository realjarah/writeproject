export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

let _anthropic: Anthropic;
function getAnthropic() {
  if (!_anthropic) _anthropic = new Anthropic();
  return _anthropic;
}
const FILES_API_BETA = "files-api-2025-04-14";

export async function POST(req: NextRequest) {
  const { data, fileName } = await req.json();
  if (!data) {
    return NextResponse.json({ error: "data (base64 PDF) required" }, { status: 400 });
  }

  let fileId: string | null = null;

  try {
    // Upload PDF to Files API once, reference by file_id
    const buf = Buffer.from(data, "base64");
    const name = fileName || "document.pdf";
    const blob = new Blob([buf], { type: "application/pdf" });
    const file = new File([blob], name, { type: "application/pdf" });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const uploaded = await (getAnthropic().beta as any).files.upload({ file });
    fileId = uploaded.id;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const message = await (getAnthropic().messages.create as any)(
      {
        model: "claude-sonnet-4-6",
        max_tokens: 8000,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "document",
                source: { type: "file", file_id: fileId },
                ...(fileName ? { title: fileName } : {}),
              },
              {
                type: "text",
                text: "Extract and return ONLY the clean prose text from this document. Preserve paragraph breaks with double newlines. Remove page numbers, headers, footers, figure captions, and any non-content elements. Return nothing but the clean text — no preamble, no commentary.",
              },
            ],
          },
        ],
      },
      { headers: { "anthropic-beta": FILES_API_BETA } }
    );

    const text = (message.content as Anthropic.TextBlock[])
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();

    if (!text) {
      return NextResponse.json({ error: "Could not extract text from this PDF." }, { status: 400 });
    }

    return NextResponse.json({ text });
  } finally {
    // Clean up uploaded file
    if (fileId) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (getAnthropic().beta as any).files.delete(fileId);
      } catch {
        // Best-effort cleanup
      }
    }
  }
}
