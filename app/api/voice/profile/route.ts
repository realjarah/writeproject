import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  const profile = await prisma.voiceProfile.findUnique({ where: { id: 1 } });
  if (!profile) {
    return NextResponse.json(null);
  }
  return NextResponse.json({
    ...profile,
    analysis: JSON.parse(profile.analysis),
  });
}
