export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  const history = await prisma.generatedContent.findMany({
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
  const { id } = await req.json();
  await prisma.generatedContent.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
