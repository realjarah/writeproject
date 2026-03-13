export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { extractPdfText } from "@/lib/parse-pdf";

/** Max PDF size: 60MB base64 ≈ ~45MB binary */
const MAX_PDF_BASE64_LENGTH = 60 * 1024 * 1024;

export async function POST(req: NextRequest) {
  const { data, fileName } = await req.json();
  if (!data) {
    return NextResponse.json({ error: "data (base64 PDF) required" }, { status: 400 });
  }
  if (typeof data !== "string" || data.length > MAX_PDF_BASE64_LENGTH) {
    return NextResponse.json({ error: "PDF too large (max ~45MB)" }, { status: 400 });
  }

  try {
    const buf = Buffer.from(data, "base64");
    const text = await extractPdfText(buf);

    if (!text) {
      return NextResponse.json({ error: "Could not extract text from this PDF." }, { status: 400 });
    }

    return NextResponse.json({ text });
  } catch (err) {
    console.error(`[import-pdf] Failed to parse ${fileName ?? "PDF"}:`, err);
    return NextResponse.json({ error: "Failed to parse PDF. The file may be corrupted or image-only." }, { status: 400 });
  }
}
