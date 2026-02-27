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
    if (body.answers && Array.isArray(body.answers)) {
      onboardingProfile = JSON.stringify({
        answers: body.answers,
        submittedAt: new Date().toISOString(),
      });
    }
  } catch {
    // Body is optional — old callers send no body
  }

  await prisma.user.update({
    where: { id: userId },
    data: { onboarded: true, accountType, onboardingProfile },
  });

  return NextResponse.json({ ok: true });
}
