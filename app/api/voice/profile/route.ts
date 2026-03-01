export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUserId } from "@/lib/session";

export async function GET() {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const profile = await prisma.voiceProfile.findUnique({ where: { userId } });
  if (!profile) return NextResponse.json(null);
  return NextResponse.json({
    ...profile,
    analysis: JSON.parse(profile.analysis),
  });
}

export async function PATCH(req: NextRequest) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const updates = await req.json();

  const profile = await prisma.voiceProfile.findUnique({ where: { userId } });
  if (!profile) return NextResponse.json({ error: "No profile found" }, { status: 404 });

  const analysis = JSON.parse(profile.analysis);
  const merged = { ...analysis, ...updates };

  await prisma.voiceProfile.update({
    where: { userId },
    data: { analysis: JSON.stringify(merged) },
  });

  return NextResponse.json({ ok: true });
}
