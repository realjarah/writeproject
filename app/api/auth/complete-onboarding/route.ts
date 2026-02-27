import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUserId } from "@/lib/session";

export async function POST(req: NextRequest) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let accountType = "individual";
  let onboardingProfile = "{}";

  try {
    const body = await req.json();
    if (body.accountType === "brand" || body.accountType === "individual") {
      accountType = body.accountType;
    }

    const profile: Record<string, unknown> = {
      submittedAt: new Date().toISOString(),
    };

    if (body.answers && Array.isArray(body.answers)) {
      profile.answers = body.answers;
    }
    if (body.writingTypes && Array.isArray(body.writingTypes)) {
      profile.writingTypes = body.writingTypes;
    }
    if (body.favoriteWords && Array.isArray(body.favoriteWords)) {
      profile.favoriteWords = body.favoriteWords;
    }

    onboardingProfile = JSON.stringify(profile);
  } catch {
    // Body is optional — old callers send no body
  }

  await prisma.user.update({
    where: { id: userId },
    data: { onboarded: true, accountType, onboardingProfile },
  });

  return NextResponse.json({ ok: true });
}
