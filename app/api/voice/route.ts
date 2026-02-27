export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { detectCategory, type SampleCategory } from "@/lib/detectCategory";
import { getUserId } from "@/lib/session";
import { extractTopics } from "@/lib/claude";

export async function GET() {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const samples = await prisma.voiceSample.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(samples);
}

export async function POST(req: NextRequest) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { title, content, category } = await req.json();
  if (!content?.trim()) {
    return NextResponse.json({ error: "Content is required" }, { status: 400 });
  }

  const wordCount = content.trim().split(/\s+/).length;
  const resolvedCategory: SampleCategory = category || detectCategory(content);

  const sample = await prisma.voiceSample.create({
    data: {
      userId,
      title: title?.trim() || `Sample ${new Date().toLocaleDateString()}`,
      content: content.trim(),
      wordCount,
      category: resolvedCategory,
    },
  });

  // Extract topics async — don't block the response
  extractTopics(content.trim()).then(async (topics) => {
    if (topics.length > 0) {
      await prisma.voiceSample.update({
        where: { id: sample.id },
        data: { topics: JSON.stringify(topics) },
      });
    }
  }).catch(() => {});

  return NextResponse.json(sample);
}

export async function DELETE(req: NextRequest) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await req.json();
  await prisma.voiceSample.deleteMany({ where: { id, userId } });
  return NextResponse.json({ success: true });
}
