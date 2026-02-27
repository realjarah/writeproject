export const dynamic = 'force-dynamic';

import { NextResponse } from "next/server";
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
