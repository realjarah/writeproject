export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import mammoth from "mammoth";

export async function POST(req: NextRequest) {
  const { data } = await req.json();
  if (!data) {
    return NextResponse.json({ error: "data (base64 DOCX) required" }, { status: 400 });
  }

  const buffer = Buffer.from(data, "base64");
  const result = await mammoth.extractRawText({ buffer });
  const text = result.value.trim();

  if (!text) {
    return NextResponse.json({ error: "Could not extract text from this document." }, { status: 400 });
  }

  return NextResponse.json({ text });
}
