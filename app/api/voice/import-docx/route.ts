export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import mammoth from "mammoth";

/** Max DOCX size: 20MB base64 ≈ ~15MB binary */
const MAX_DOCX_BASE64_LENGTH = 20 * 1024 * 1024;

export async function POST(req: NextRequest) {
  const { data } = await req.json();
  if (!data) {
    return NextResponse.json({ error: "data (base64 DOCX) required" }, { status: 400 });
  }
  if (typeof data !== "string" || data.length > MAX_DOCX_BASE64_LENGTH) {
    return NextResponse.json({ error: "File too large (max ~15MB)" }, { status: 400 });
  }

  try {
    const buffer = Buffer.from(data, "base64");
    const result = await mammoth.extractRawText({ buffer });
    const text = result.value.trim();

    if (result.messages.length > 0) {
      console.warn("[import-docx] mammoth warnings:", result.messages.map((m) => m.message).join("; "));
    }

    if (!text) {
      return NextResponse.json({ error: "Could not extract text from this document." }, { status: 400 });
    }

    return NextResponse.json({ text });
  } catch (err) {
    console.error("[import-docx] Extraction failed:", err);
    return NextResponse.json({ error: "Failed to read this document. It may be corrupted or in an unsupported format." }, { status: 400 });
  }
}
