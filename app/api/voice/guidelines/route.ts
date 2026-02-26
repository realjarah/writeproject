import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { generateContentGuideline, VoiceAnalysis } from "@/lib/claude";

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

  // Check if guidelines already exist for this type
  const existing = voiceProfile.contentGuidelines?.[contentType];
  if (existing?.length) {
    return Response.json({ contentType, guidelines: existing, cached: true });
  }

  // Generate fresh guidelines
  const guidelines = await generateContentGuideline(voiceProfile, contentType);

  // Merge back into the analysis JSON and save
  const updatedAnalysis: VoiceAnalysis = {
    ...voiceProfile,
    contentGuidelines: {
      ...(voiceProfile.contentGuidelines ?? {}),
      [contentType]: guidelines,
    },
  };

  await prisma.voiceProfile.update({
    where: { id: 1 },
    data: { analysis: JSON.stringify(updatedAnalysis) },
  });

  return Response.json({ contentType, guidelines, cached: false });
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
