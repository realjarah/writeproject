export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { detectCategory, type SampleCategory } from "@/lib/detectCategory";

export async function GET() {
  const samples = await prisma.voiceSample.findMany({
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(samples);
}

export async function POST(req: NextRequest) {
  const { title, content, category } = await req.json();

  if (!content?.trim()) {
    return NextResponse.json({ error: "Content is required" }, { status: 400 });
  }

  const wordCount = content.trim().split(/\s+/).length;
  const resolvedCategory: SampleCategory = category || detectCategory(content);

  const sample = await prisma.voiceSample.create({
    data: {
      title: title?.trim() || `Sample ${new Date().toLocaleDateString()}`,
      content: content.trim(),
      wordCount,
      category: resolvedCategory,
    },
  });

  return NextResponse.json(sample);
}

export async function DELETE(req: NextRequest) {
  const { id } = await req.json();
  await prisma.voiceSample.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
