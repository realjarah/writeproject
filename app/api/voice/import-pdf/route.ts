export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic();

export async function POST(req: NextRequest) {
  const { data, fileName } = await req.json();
  if (!data) {
    return NextResponse.json({ error: "data (base64 PDF) required" }, { status: 400 });
  }

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 8000,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "document",
            source: { type: "base64", media_type: "application/pdf", data },
            ...(fileName ? { title: fileName } : {}),
          } as Anthropic.DocumentBlockParam,
          {
            type: "text",
            text: "Extract and return ONLY the clean prose text from this document. Preserve paragraph breaks with double newlines. Remove page numbers, headers, footers, figure captions, and any non-content elements. Return nothing but the clean text — no preamble, no commentary.",
          },
        ],
      },
    ],
  });

  const text = message.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();

  if (!text) {
    return NextResponse.json({ error: "Could not extract text from this PDF." }, { status: 400 });
  }

  return NextResponse.json({ text });
}
