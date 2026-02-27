export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// GET — list all jobs, newest first
export async function GET() {
  const jobs = await prisma.ghostwriterJob.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      contentType: true,
      topic: true,
      status: true,
      stepLabel: true,
      finalDraft: true,
      errorMsg: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  return NextResponse.json(jobs);
}

// POST — create a new job
export async function POST(req: NextRequest) {
  const { contentType, topic, brief } = await req.json();
  if (!contentType || !topic || !brief) {
    return NextResponse.json({ error: "contentType, topic, and brief are required" }, { status: 400 });
  }
  const job = await prisma.ghostwriterJob.create({
    data: { contentType, topic, brief, status: "queued" },
  });
  return NextResponse.json({ id: job.id });
}
