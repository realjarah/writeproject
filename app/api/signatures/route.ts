export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUserId } from "@/lib/session";

const DEFAULT_SIGNATURE_CONTENT = {
  name: "Ghostwrite Attribution",
  content: "---\n\n*Written by me, powered by [Ghostwrite](https://ghostwrite.you)*",
  isDefault: true,
  isSystem: true,
};

async function ensureDefaults(userId: string) {
  const system = await prisma.signature.findFirst({ where: { isSystem: true, userId } });
  if (!system) {
    await prisma.signature.create({ data: { ...DEFAULT_SIGNATURE_CONTENT, userId } });
  }
}

export async function GET() {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await ensureDefaults(userId);
  const signatures = await prisma.signature.findMany({
    where: { userId },
    orderBy: [{ isSystem: "desc" }, { isDefault: "desc" }, { createdAt: "asc" }],
  });
  return NextResponse.json(signatures);
}

export async function POST(req: NextRequest) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { name, content, isDefault } = await req.json();
  if (!name?.trim() || !content?.trim()) {
    return NextResponse.json({ error: "Name and content are required." }, { status: 400 });
  }

  if (isDefault) {
    await prisma.signature.updateMany({ where: { userId }, data: { isDefault: false } });
  }

  const sig = await prisma.signature.create({
    data: { userId, name: name.trim(), content: content.trim(), isDefault: !!isDefault },
  });
  return NextResponse.json(sig);
}

export async function PUT(req: NextRequest) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, name, content, isDefault } = await req.json();
  if (!id) return NextResponse.json({ error: "ID required." }, { status: 400 });

  const existing = await prisma.signature.findFirst({ where: { id, userId } });
  if (!existing) return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (existing.isSystem) {
    return NextResponse.json({ error: "System signatures cannot be modified." }, { status: 403 });
  }

  if (isDefault) {
    await prisma.signature.updateMany({ where: { userId }, data: { isDefault: false } });
  }

  const sig = await prisma.signature.update({
    where: { id },
    data: {
      ...(name !== undefined && { name: name.trim() }),
      ...(content !== undefined && { content: content.trim() }),
      ...(isDefault !== undefined && { isDefault }),
    },
  });
  return NextResponse.json(sig);
}

export async function DELETE(req: NextRequest) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "ID required." }, { status: 400 });

  const existing = await prisma.signature.findFirst({ where: { id, userId } });
  if (!existing) return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (existing.isSystem) {
    return NextResponse.json({ error: "System signatures cannot be deleted." }, { status: 403 });
  }

  await prisma.signature.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
