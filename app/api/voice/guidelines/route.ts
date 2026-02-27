import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { VoiceAnalysis } from "@/lib/claude";

export async function POST(req: NextRequest) {
  const { contentType } = await req.json();
  if (!contentType?.trim()) {
    return Response.json({ error: "contentType required" }, { status: 400 });
  }

  const profileRow = await prisma.voiceProfile.findUnique({ where: { id: 1 } });
  if (!profileRow) {
    return Response.json({ error: "No voice profile found" }, { status: 404 });
  }

  const voiceProfile: VoiceAnalysis = JSON.parse(profileRow.analysis);
  const guidelines = voiceProfile.contentGuidelines?.[contentType];

  if (!guidelines?.length) {
    return Response.json(
      { error: `No guidelines found for "${contentType}". Re-run voice analysis to generate them.` },
      { status: 404 }
    );
  }

  return Response.json({ contentType, guidelines });
}

export async function DELETE(req: NextRequest) {
  const { contentType } = await req.json();
  if (!contentType?.trim()) {
    return Response.json({ error: "contentType required" }, { status: 400 });
  }

  const profileRow = await prisma.voiceProfile.findUnique({ where: { id: 1 } });
  if (!profileRow) {
    return Response.json({ error: "No voice profile found" }, { status: 404 });
  }

  const voiceProfile: VoiceAnalysis = JSON.parse(profileRow.analysis);
  const updatedGuidelines = { ...(voiceProfile.contentGuidelines ?? {}) };
  delete updatedGuidelines[contentType];

  const updatedAnalysis: VoiceAnalysis = {
    ...voiceProfile,
    contentGuidelines: updatedGuidelines,
  };

  await prisma.voiceProfile.update({
    where: { id: 1 },
    data: { analysis: JSON.stringify(updatedAnalysis) },
  });

  return Response.json({ contentType, deleted: true });
}
