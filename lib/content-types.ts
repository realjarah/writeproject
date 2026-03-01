/**
 * Client-safe constants and types.
 * No server-only imports (Anthropic SDK, Node.js APIs, etc.).
 * Safe to import in both "use client" components and server-side code.
 */

export const CONTENT_TYPE_LABELS: Record<string, string> = {
  // Personal
  notes:               "personal notes",
  list:                "list / to-do list",
  ai_prompt:           "AI prompt",
  letter:              "letter",
  thank_you_note:      "thank you note",
  review:              "review / testimonial",
  bio:                 "bio / about page",
  text_message:        "text message",
  // Social Media
  social:              "social media post (LinkedIn or single tweet)",
  twitter_thread:      "Twitter/X thread",
  caption:             "caption (Instagram or TikTok)",
  // Professional
  email:               "email",
  proposal:            "proposal",
  cover_letter:        "cover letter",
  resume:              "resume / CV",
  press_release:       "press release",
  scope_of_work:       "scope of work",
  rfp:                 "RFP / RFP response",
  // Business
  business_plan:       "business plan",
  report:              "report",
  case_study:          "case study",
  handbook:            "handbook",
  // Marketing & Content
  blog:                "blog post / article",
  newsletter:          "newsletter",
  ad_copy:             "ad copy",
  product_description: "product description",
  // Education
  lesson_plan:         "lesson plan",
  course:              "course content",
  guide:               "guide / how-to",
  // Academic & Technical
  research:            "research paper",
  technical:           "technical documentation",
  whitepaper:          "whitepaper",
  // Creative & Spoken
  essay:               "essay",
  speech:              "speech",
  script:              "script (podcast / video)",
};

// Groups used by the type selector UI
export const CONTENT_TYPE_GROUPS: { label: string; types: string[] }[] = [
  { label: "Personal",             types: ["notes", "list", "ai_prompt", "letter", "thank_you_note", "review", "bio", "text_message"] },
  { label: "Social Media",         types: ["social", "twitter_thread", "caption"] },
  { label: "Professional",         types: ["email", "proposal", "cover_letter", "resume", "press_release", "scope_of_work", "rfp"] },
  { label: "Business",             types: ["business_plan", "report", "case_study", "handbook"] },
  { label: "Marketing & Content",  types: ["blog", "newsletter", "ad_copy", "product_description"] },
  { label: "Education",            types: ["lesson_plan", "course", "guide"] },
  { label: "Academic & Technical", types: ["research", "technical", "whitepaper"] },
  { label: "Creative & Spoken",    types: ["essay", "speech", "script"] },
];

// Shared color palette for content type groups (used by voice page, profile page, etc.)
export const GROUP_COLORS: Record<string, string> = {
  "Personal":            "#a78bfa",
  "Social Media":        "#f472b6",
  "Professional":        "#34d399",
  "Business":            "#2dd4bf",
  "Marketing & Content": "#60a5fa",
  "Education":           "#f59e0b",
  "Academic & Technical": "#fb923c",
  "Creative & Spoken":   "#facc15",
};

/** Look up the group label for a content type key. */
export function getGroupForType(contentType: string): string | undefined {
  for (const group of CONTENT_TYPE_GROUPS) {
    if (group.types.includes(contentType)) return group.label;
  }
  return undefined;
}

// ── Shared types ─────────────────────────────────────────────────────────────

export type ContextItemTag = "data" | "example" | "research" | "reference" | "note";

export interface ContextItem {
  tag: ContextItemTag;
  // Source — exactly one of these is set per item:
  url?: string;
  fetchedText?: string; // populated server-side after URL resolution
  text?: string;
  fileName?: string;
  isCSV?: boolean;
  includePlaceholders?: boolean;
  // Binary files (images, PDFs) — base64-encoded, no data: prefix
  data?: string;
  mediaType?: string;
  // Files API — set after uploadContextFiles resolves binary items
  fileId?: string;
  // Text extracted from binary files (PDFs) so text-only models (Grok) can see content
  extractedText?: string;
  instructions?: string;
}

export interface GenerationContext {
  items: ContextItem[];
}

export interface InterviewAnswers {
  contentType: string;
  /** Human-readable label for custom content types (e.g. "Technical Memo"). Undefined for system types. */
  contentTypeLabel?: string;
  topic: string;
  angle: string;
  keyPoints: string;
  sourcesOrData?: string;
  targetAudience?: string;
  toneNotes?: string;
  wordCountTarget?: string;
}

export interface SubVoiceAnalysis {
  summary: string;
  toneShift: string;
  structuralPatterns: string;
  vocabularyNotes: string;
  keyGuidelines: string[];
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
  // Human imperfections that ARE the voice — fragments, run-ons, grammar breaks, etc.
  humanImperfections?: string;
  // Unique writing tics — unexpected metaphors, trademark phrases, idiosyncratic choices
  authenticQuirks?: string;
  // How the author handles emotional intensity and shifts
  emotionalPatterns?: string;
  // How the author connects ideas between sentences and paragraphs
  transitionStyle?: string;
  categoryInsights?: Record<string, string>;
  // Per-format guidelines generated on demand
  contentGuidelines?: Record<string, string[]>;
  // Per-category sub-voice descriptions
  subVoices?: Record<string, SubVoiceAnalysis>;
}

export interface LabeledSample {
  content: string;
  category: string;
  notes?: string;
}
