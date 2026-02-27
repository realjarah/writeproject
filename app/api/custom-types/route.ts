export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUserId } from "@/lib/session";

export async function GET() {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const types = await prisma.customContentType.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
  });

  // Attach per-type sample counts
  const slugs = types.map((t) => `custom_${t.id}`);
  const sampleGroups = slugs.length > 0
    ? await prisma.voiceSample.groupBy({
        by: ["category"],
        where: { userId, category: { in: slugs } },
        _count: { id: true },
      })
    : [];
  const countMap = Object.fromEntries(sampleGroups.map((r) => [r.category, r._count.id]));

  return NextResponse.json(
    types.map((t) => ({
      ...t,
      slug: `custom_${t.id}`,
      sampleCount: countMap[`custom_${t.id}`] ?? 0,
    }))
  );
}

export async function POST(req: NextRequest) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { name, description } = await req.json();
  if (!name?.trim()) return NextResponse.json({ error: "name required" }, { status: 400 });

  const created = await prisma.customContentType.create({
    data: { userId, name: name.trim(), description: description?.trim() ?? "" },
  });

  return NextResponse.json({ ...created, slug: `custom_${created.id}`, sampleCount: 0 }, { status: 201 });
}
