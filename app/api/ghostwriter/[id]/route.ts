export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUserId } from "@/lib/session";

// GET — fetch a single job
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });

  const job = await prisma.ghostwriterJob.findFirst({ where: { id, userId } });
  if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(job);
}

// PATCH — update a job (archive, edit brief, change status, update draft)
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });

  const body = await req.json();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: Record<string, any> = {};

  // Archive / unarchive
  if (typeof body.archived === "boolean") {
    data.archivedAt = body.archived ? new Date() : null;
  }
  // Update final draft text
  if (typeof body.finalDraft === "string") {
    data.finalDraft = body.finalDraft;
  }
  // Update brief data (for editing saved ideas)
  if (typeof body.brief === "string") {
    data.brief = body.brief;
  }
  // Update metadata fields
  if (typeof body.topic === "string") {
    data.topic = body.topic;
  }
  if (typeof body.title === "string") {
    data.title = body.title;
  }
  if (typeof body.contentType === "string") {
    data.contentType = body.contentType;
  }
  if (typeof body.summaryText === "string") {
    data.summaryText = body.summaryText;
  }
  // Change status (only allow specific transitions)
  if (typeof body.status === "string") {
    // draft → queued (send to ghostwriter)
    if (body.status === "queued") {
      data.status = "queued";
    }
  }

  const job = await prisma.ghostwriterJob.updateMany({ where: { id, userId }, data });
  return NextResponse.json(job);
}

// DELETE — delete a job
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });

  await prisma.ghostwriterJob.deleteMany({ where: { id, userId } }).catch(() => null);
  return NextResponse.json({ ok: true });
}
