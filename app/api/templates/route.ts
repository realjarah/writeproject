export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUserId } from "@/lib/session";

export async function GET() {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const templates = await prisma.template.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
  });
  return NextResponse.json(templates);
}

export async function POST(req: NextRequest) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { name, contentType, brief } = await req.json();
  if (!name?.trim()) {
    return NextResponse.json({ error: "Template name is required." }, { status: 400 });
  }
  if (!contentType?.trim()) {
    return NextResponse.json({ error: "Content type is required." }, { status: 400 });
  }
  if (!brief) {
    return NextResponse.json({ error: "Brief is required." }, { status: 400 });
  }

  const template = await prisma.template.create({
    data: {
      userId,
      name: name.trim(),
      contentType: contentType.trim(),
      brief: typeof brief === "string" ? brief : JSON.stringify(brief),
    },
  });
  return NextResponse.json(template);
}

export async function PUT(req: NextRequest) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, name, brief } = await req.json();
  if (!id) return NextResponse.json({ error: "ID required." }, { status: 400 });

  const existing = await prisma.template.findFirst({ where: { id, userId } });
  if (!existing) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const data: Record<string, unknown> = {};
  if (name !== undefined) data.name = name.trim();
  if (brief !== undefined) data.brief = typeof brief === "string" ? brief : JSON.stringify(brief);

  const template = await prisma.template.update({ where: { id }, data });
  return NextResponse.json(template);
}

export async function DELETE(req: NextRequest) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "ID required." }, { status: 400 });

  const existing = await prisma.template.findFirst({ where: { id, userId } });
  if (!existing) return NextResponse.json({ error: "Not found." }, { status: 404 });

  await prisma.template.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
