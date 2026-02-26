export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

const DEFAULT_SIGNATURE = {
  name: "Ghostwrite Default",
  content: "---\n\n*Written by me, powered by [Ghostwrite](https://ghostwrite.you)*",
  isDefault: true,
};

async function ensureDefaults() {
  const count = await prisma.signature.count();
  if (count === 0) {
    await prisma.signature.create({ data: DEFAULT_SIGNATURE });
  }
}

export async function GET() {
  await ensureDefaults();
  const signatures = await prisma.signature.findMany({
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
  });
  return NextResponse.json(signatures);
}

export async function POST(req: NextRequest) {
  const { name, content, isDefault } = await req.json();
  if (!name?.trim() || !content?.trim()) {
    return NextResponse.json({ error: "Name and content are required." }, { status: 400 });
  }

  // If this one is being set as default, clear all others
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
  await prisma.signature.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
