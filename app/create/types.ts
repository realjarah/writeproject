import type { ContextItem, ContextItemTag } from "@/lib/content-types";

// Re-export for convenience
export type { ContextItem, ContextItemTag };

// ── Steps ───────────────────────────────────────────────────────────────────

export type Step =
  | "describe"
  | "analyzing"
  | "category"
  | "details"
  | "context"
  | "title"
  | "review"
  | "sent"
  | "saved";

// ── Intake ──────────────────────────────────────────────────────────────────

export interface IntakeResult {
  contentType: string;
  topic: string | null;
  angle: string | null;
  keyPoints: string | null;
  targetAudience: string | null;
  toneNotes: string | null;
  summary: string;
  questions: IntakeQuestion[];
}

export interface IntakeQuestion {
  id: string;
  label: string;
  placeholder: string;
}

// ── Data models ─────────────────────────────────────────────────────────────

export interface Signature {
  id: number;
  name: string;
  content: string;
  isDefault: boolean;
}

export interface QueuedJob {
  id: number;
  contentType: string;
  topic: string;
  title: string;
  summaryText: string;
  status: string;
  createdAt: string;
}

export interface SavedBrief {
  id: number;
  contentType: string;
  topic: string;
  title: string;
  summaryText: string;
  brief: string;
  briefGrade: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface Template {
  id: number;
  name: string;
  contentType: string;
  brief: string;
  createdAt: string;
  updatedAt: string;
}

export interface CustomType {
  id: number;
  name: string;
  slug: string;
  sampleCount: number;
}

// ── Sub-voice ───────────────────────────────────────────────────────────────

export interface SubVoiceStatus {
  hasProfile: boolean;
  subVoiceAvailable: boolean;
  subVoiceSummary?: string;
  trainedCategories: string[];
}

// ── Grade ────────────────────────────────────────────────────────────────────

export type BriefGrade = "D" | "C" | "B" | "A" | "A+";

export interface GradeBreakdown {
  description: number;
  topic: number;
  angle: number;
  keyPoints: number;
  targetAudience: number;
  toneNotes: number;
  contextItems: number;
  wordCount: number;
  title: number;
  startingDraft: number;
}

export interface GradeResult {
  grade: BriefGrade;
  score: number;
  maxScore: number;
  breakdown: GradeBreakdown;
}

// ── Brief state ─────────────────────────────────────────────────────────────

export interface BriefState {
  description: string;
  intake: IntakeResult | null;
  answers: Record<string, string>;
  overrideType: string | null;
  titleInput: string;
  wordCountTarget: string;
  contextItems: ContextItem[];
  draftText: string;
  draftFileName: string;
  draftData: string;
  draftMediaType: string;
  selectedSigId: number | null;
}

export type BriefUpdater = <K extends keyof BriefState>(
  key: K,
  value: BriefState[K],
) => void;

export const INITIAL_BRIEF_STATE: BriefState = {
  description: "",
  intake: null,
  answers: {},
  overrideType: null,
  titleInput: "",
  wordCountTarget: "",
  contextItems: [],
  draftText: "",
  draftFileName: "",
  draftData: "",
  draftMediaType: "",
  selectedSigId: null,
};
