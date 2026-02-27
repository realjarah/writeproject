export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

const DEFAULT_SIGNATURE = {
  name: "Ghostwrite Attribution",
  content: "---\n\n*Written by me, powered by [Ghostwrite](https://ghostwrite.you)*",
  isDefault: true,
  isSystem: true,
};

async function ensureDefaults() {
  // Ensure the system attribution exists and is marked as system
  const system = await prisma.signature.findFirst({ where: { isSystem: true } });
  if (!system) {
    // Check if the old "Ghostwrite Default" exists and migrate it
    const legacy = await prisma.signature.findFirst({ where: { name: "Ghostwrite Default" } });
    if (legacy) {
      await prisma.signature.update({
        where: { id: legacy.id },
        data: { name: DEFAULT_SIGNATURE.name, isSystem: true, isDefault: true },
      });
    } else {
      await prisma.signature.create({ data: DEFAULT_SIGNATURE });
    }
  }
}

export async function GET() {
  await ensureDefaults();
  const signatures = await prisma.signature.findMany({
    orderBy: [{ isSystem: "desc" }, { isDefault: "desc" }, { createdAt: "asc" }],
  });
  return NextResponse.json(signatures);
}

export async function POST(req: NextRequest) {
  const { name, content, isDefault } = await req.json();
  if (!name?.trim() || !content?.trim()) {
    return NextResponse.json({ error: "Name and content are required." }, { status: 400 });
  }

  if (isDefault) {
    await prisma.signature.updateMany({ data: { isDefault: false } });
  }

  const sig = await prisma.signature.create({
    data: { name: name.trim(), content: content.trim(), isDefault: !!isDefault },
  });
  return NextResponse.json(sig);
}

export async function PUT(req: NextRequest) {
  const { id, name, content, isDefault } = await req.json();
  if (!id) return NextResponse.json({ error: "ID required." }, { status: 400 });

  // Block edits to system signatures
  const existing = await prisma.signature.findUnique({ where: { id } });
  if (existing?.isSystem) {
    return NextResponse.json({ error: "System signatures cannot be modified." }, { status: 403 });
  }

  if (isDefault) {
    await prisma.signature.updateMany({ data: { isDefault: false } });
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
  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "ID required." }, { status: 400 });

  // Block deletion of system signatures
  const existing = await prisma.signature.findUnique({ where: { id } });
  if (existing?.isSystem) {
    return NextResponse.json({ error: "System signatures cannot be deleted." }, { status: 403 });
  }

  await prisma.signature.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
