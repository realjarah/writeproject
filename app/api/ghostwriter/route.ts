export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUserId } from "@/lib/session";

const JOB_SELECT = {
  id: true,
  contentType: true,
  topic: true,
  title: true,
  summaryText: true,
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
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const archived = req.nextUrl.searchParams.get("archived") === "true";
  const jobs = await prisma.ghostwriterJob.findMany({
    where: archived
      ? { userId, archivedAt: { not: null } }
      : { userId, archivedAt: null },
    orderBy: { createdAt: "desc" },
    select: JOB_SELECT,
  });
  return NextResponse.json(jobs);
}

// Maximum brief size (50 MB — generous, accommodates large PDFs/images as base64)
const MAX_BRIEF_BYTES = 50 * 1024 * 1024;

// POST — create a new job
export async function POST(req: NextRequest) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { contentType, topic, title, summaryText, brief } = await req.json();
  if (!contentType || !topic || !brief) {
    return NextResponse.json({ error: "contentType, topic, and brief are required" }, { status: 400 });
  }

  // Validate brief size to prevent DB overflow
  const briefSize = typeof brief === "string" ? Buffer.byteLength(brief, "utf-8") : 0;
  if (briefSize > MAX_BRIEF_BYTES) {
    return NextResponse.json(
      { error: `Brief is too large (${Math.round(briefSize / 1024 / 1024)}MB). Try reducing attached files.` },
      { status: 413 }
    );
  }
  if (briefSize > 10 * 1024 * 1024) {
    console.warn(`[ghostwriter] Large brief for user ${userId}: ${Math.round(briefSize / 1024 / 1024)}MB`);
  }

  const job = await prisma.ghostwriterJob.create({
    data: { userId, contentType, topic, title: title ?? "", summaryText: summaryText ?? "", brief, status: "queued" },
  });
  return NextResponse.json({ id: job.id });
}
