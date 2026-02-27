export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUserId } from "@/lib/session";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  // Delete associated samples first (category stored as slug string)
  const slug = `custom_${id}`;
  await prisma.voiceSample.deleteMany({ where: { userId, category: slug } });
  await prisma.customContentType.deleteMany({ where: { id, userId } });

  return NextResponse.json({ ok: true });
}
