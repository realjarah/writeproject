export const dynamic = "force-dynamic";
export const maxDuration = 120; // research can take multiple search rounds

import { NextRequest } from "next/server";
import { conductResearchGrok } from "@/lib/claude";

export async function POST(req: NextRequest) {
  const { prompt, topic, angle, contentType } = await req.json();
  if (!prompt?.trim()) {
    return Response.json({ error: "Research prompt required" }, { status: 400 });
  }

  const brief = await conductResearchGrok(prompt.trim(), {
    topic: topic ?? undefined,
    angle: angle ?? undefined,
    contentType: contentType ?? undefined,
  });

  return Response.json({ brief });
}
