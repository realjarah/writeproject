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
  brief: true,
  status: true,
  stepLabel: true,
  finalDraft: true,
  errorMsg: true,
  archivedAt: true,
  createdAt: true,
  updatedAt: true,
};

// Lighter select for list views (excludes large brief/draft fields)
const JOB_LIST_SELECT = {
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

// GET — list jobs filtered by status or archive state
//   ?status=draft   → saved ideas (not yet sent to ghostwriter)
//   ?archived=true  → archived finished jobs
//   (default)       → active non-draft jobs
export async function GET(req: NextRequest) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const statusFilter = req.nextUrl.searchParams.get("status");
  const archived = req.nextUrl.searchParams.get("archived") === "true";

  let where;
  if (statusFilter === "draft") {
    where = { userId, status: "draft" };
  } else if (archived) {
    where = { userId, archivedAt: { not: null } };
  } else {
    where = { userId, archivedAt: null, NOT: { status: "draft" } };
  }

  const jobs = await prisma.ghostwriterJob.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    select: statusFilter === "draft" ? JOB_SELECT : JOB_LIST_SELECT,
  });
  return NextResponse.json(jobs);
}

// Maximum brief size (50 MB — generous, accommodates large PDFs/images as base64)
const MAX_BRIEF_BYTES = 50 * 1024 * 1024;

// POST — create a new job or saved draft
export async function POST(req: NextRequest) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { contentType, topic, title, summaryText, brief, status: reqStatus } = await req.json();
  if (!contentType || !brief) {
    return NextResponse.json({ error: "contentType and brief are required" }, { status: 400 });
  }

  // Only allow "queued" or "draft" status from client
  const status = reqStatus === "draft" ? "draft" : "queued";

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
    data: {
      userId,
      contentType,
      topic: topic ?? "",
      title: title ?? "",
      summaryText: summaryText ?? "",
      brief,
      status,
    },
  });
  return NextResponse.json({ id: job.id });
}
