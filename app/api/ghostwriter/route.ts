export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

const JOB_SELECT = {
  id: true,
  contentType: true,
  topic: true,
  status: true,
  stepLabel: true,
  finalDraft: true,
  errorMsg: true,
  archivedAt: true,
  createdAt: true,
  updatedAt: true,
};

// GET — list active jobs (not archived) or archived jobs with ?archived=true
export async function GET(req: NextRequest) {
  const archived = req.nextUrl.searchParams.get("archived") === "true";
  const jobs = await prisma.ghostwriterJob.findMany({
    where: archived ? { archivedAt: { not: null } } : { archivedAt: null },
    orderBy: { createdAt: "desc" },
    select: JOB_SELECT,
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
