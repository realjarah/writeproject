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

// PATCH — archive / unarchive a job, or update finalDraft
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });

  const body = await req.json();
  const data: Record<string, unknown> = {};

  if (typeof body.archived === "boolean") {
    data.archivedAt = body.archived ? new Date() : null;
  }
  if (typeof body.finalDraft === "string") {
    data.finalDraft = body.finalDraft;
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
