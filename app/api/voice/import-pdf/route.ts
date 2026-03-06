export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

let _anthropic: Anthropic;
function getAnthropic() {
  if (!_anthropic) _anthropic = new Anthropic();
  return _anthropic;
}

/** Max PDF size: 30MB base64 ≈ ~22MB binary */
const MAX_PDF_BASE64_LENGTH = 30 * 1024 * 1024;

export async function POST(req: NextRequest) {
  const { data, fileName } = await req.json();
  if (!data) {
    return NextResponse.json({ error: "data (base64 PDF) required" }, { status: 400 });
  }
  if (typeof data !== "string" || data.length > MAX_PDF_BASE64_LENGTH) {
    return NextResponse.json({ error: "PDF too large (max ~22MB)" }, { status: 400 });
  }

  try {
    // Send PDF inline as base64 — no Files API needed, works on all SDK versions
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const message = await (getAnthropic().messages.create as any)({
      model: "claude-opus-4-6",
      max_tokens: 16000,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "document",
              source: {
                type: "base64",
                media_type: "application/pdf",
                data,
              },
              ...(fileName ? { title: fileName } : {}),
            },
            {
              type: "text",
              text: "Extract and return ONLY the clean prose text from this document. Preserve paragraph breaks with double newlines. Remove page numbers, headers, footers, figure captions, and any non-content elements. Return nothing but the clean text — no preamble, no commentary.",
            },
          ],
        },
      ],
    });

    const text = (message.content as Anthropic.TextBlock[])
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();

    if (!text) {
      return NextResponse.json({ error: "Could not extract text from this PDF." }, { status: 400 });
    }

    return NextResponse.json({ text });
  } catch (err) {
    console.error("import-pdf error:", err);
    return NextResponse.json(
      { error: "Failed to process PDF. It may be too large or corrupted." },
      { status: 500 },
    );
  }
}
