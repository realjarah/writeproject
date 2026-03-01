import type { BriefState, GradeResult, GradeBreakdown, BriefGrade } from "./types";

export function calculateGrade(state: BriefState): GradeResult {
  const { description, intake, answers, contextItems,
    wordCountTarget, titleInput, draftText, draftData } = state;

  const topic = intake?.topic ?? answers.topic ?? "";
  const angle = intake?.angle ?? answers.angle ?? "";
  const keyPoints = intake?.keyPoints ?? answers.keyPoints ?? "";
  const targetAudience = intake?.targetAudience ?? answers.targetAudience ?? "";
  const toneNotes = intake?.toneNotes ?? answers.toneNotes ?? "";

  const breakdown: GradeBreakdown = {
    description: scoreLength(description, [100, 300, 500]),
    topic: scoreLength(topic, [1, 30]),
    angle: scoreLength(angle, [1, 50, 150]),
    keyPoints: scoreLength(keyPoints, [1, 80, 200]),
    targetAudience: scoreLength(targetAudience, [1, 30]),
    toneNotes: toneNotes.trim().length > 0 ? 1 : 0,
    contextItems: scoreCount(contextItems.length, [1, 3, 5]),
    wordCount: wordCountTarget.trim().length > 0 ? 1 : 0,
    title: titleInput.trim().length > 0 ? 1 : 0,
    startingDraft: scoreDraft(draftText, draftData),
  };

  const score = Object.values(breakdown).reduce((a, b) => a + b, 0);
  const maxScore = 21;
  const grade = mapScoreToGrade(score);

  return { grade, score, maxScore, breakdown };
}

function scoreLength(value: string, thresholds: number[]): number {
  const len = value.trim().length;
  let score = 0;
  for (const t of thresholds) {
    if (len >= t) score++;
    else break;
  }
  return score;
}

function scoreCount(count: number, thresholds: number[]): number {
  let score = 0;
  for (const t of thresholds) {
    if (count >= t) score++;
    else break;
  }
  return score;
}

function scoreDraft(text: string, data: string): number {
  if (data) return 1;
  const len = text.trim().length;
  if (len > 500) return 2;
  if (len > 0) return 1;
  return 0;
}

function mapScoreToGrade(score: number): BriefGrade {
  if (score >= 18) return "A+";
  if (score >= 14) return "A";
  if (score >= 9) return "B";
  if (score >= 5) return "C";
  return "D";
}

export function gradeColor(grade: BriefGrade): string {
  switch (grade) {
    case "A+": return "#22c55e";
    case "A":  return "#4ade80";
    case "B":  return "#60a5fa";
    case "C":  return "#facc15";
    case "D":  return "#f87171";
  }
}

export function gradeHint(grade: BriefGrade): string {
  switch (grade) {
    case "A+": return "Excellent brief — the ghost has everything it needs";
    case "A":  return "Strong brief — a few more details could help";
    case "B":  return "Good foundation — add context or details to improve";
    case "C":  return "Basic brief — more specifics will get better results";
    case "D":  return "Minimal brief — add more to guide the ghost";
  }
}
