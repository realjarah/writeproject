export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUserId } from "@/lib/session";

export async function GET() {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const history = await prisma.generatedContent.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      contentType: true,
      topic: true,
      content: true,
      createdAt: true,
    },
  });
  return NextResponse.json(history);
}

export async function DELETE(req: NextRequest) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await req.json();
  await prisma.generatedContent.deleteMany({ where: { id, userId } });
  return NextResponse.json({ success: true });
}
