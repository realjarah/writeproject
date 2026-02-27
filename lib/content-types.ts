/**
 * Client-safe constants and types.
 * No server-only imports (Anthropic SDK, Node.js APIs, etc.).
 * Safe to import in both "use client" components and server-side code.
 */

export const CONTENT_TYPE_LABELS: Record<string, string> = {
  // Writing
  blog:          "blog post / article",
  essay:         "essay",
  newsletter:    "newsletter",
  whitepaper:    "whitepaper",
  // Business
  email:         "email",
  report:        "report",
  press_release: "press release",
  proposal:      "proposal",
  case_study:    "case study",
  // Career
  resume:        "resume / CV",
  cover_letter:  "cover letter",
  // Academic & Technical
  research:      "research paper",
  technical:     "technical documentation",
  // Short-form
  social:        "social media post (Twitter/X or LinkedIn)",
  caption:       "caption (Instagram or TikTok)",
  text_message:  "text message",
  // Spoken word
  speech:        "speech",
  script:        "script (podcast / video)",
};

// Groups used by the type selector UI
export const CONTENT_TYPE_GROUPS: { label: string; types: string[] }[] = [
  { label: "Writing",              types: ["blog", "essay", "newsletter", "whitepaper"] },
  { label: "Business",             types: ["email", "report", "press_release", "proposal", "case_study"] },
  { label: "Career",               types: ["resume", "cover_letter"] },
  { label: "Academic & Technical", types: ["research", "technical"] },
  { label: "Short-form",           types: ["social", "caption", "text_message"] },
  { label: "Spoken word",          types: ["speech", "script"] },
];

// ── Shared types ─────────────────────────────────────────────────────────────

export type ContextItemTag = "data" | "example" | "research" | "reference" | "note";

export interface ContextItem {
  tag: ContextItemTag;
  // Source — exactly one of these is set per item:
  url?: string;
  text?: string;
  fileName?: string;
  isCSV?: boolean;
  includePlaceholders?: boolean;
  // Binary files (images, PDFs) — base64-encoded, no data: prefix
  data?: string;
  mediaType?: string;
  instructions?: string;
}

export interface GenerationContext {
  items: ContextItem[];
}

export interface InterviewAnswers {
  contentType: string;
  topic: string;
  angle: string;
  keyPoints: string;
  sourcesOrData?: string;
  targetAudience?: string;
  toneNotes?: string;
  wordCountTarget?: string;
}

export interface VoiceAnalysis {
  tone: string;
  sentenceStructure: string;
  vocabularyStyle: string;
  punctuationHabits: string;
  paragraphStyle: string;
  rhetoricalDevices: string;
  commonPatterns: string[];
  thingsToAvoid: string[];
  rawSummary: string;
  categoryInsights?: Record<string, string>;
  // Per-format guidelines generated on demand
  contentGuidelines?: Record<string, string[]>;
}

export interface LabeledSample {
  content: string;
  category: string;
}
