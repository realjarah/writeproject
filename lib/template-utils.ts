/**
 * Template extraction and naming utilities.
 * Client-safe — no server-only imports.
 */

import { type ContextItem } from "@/lib/content-types";

export interface TemplateBrief {
  interview: {
    contentType: string;
    contentTypeLabel?: string;
    angle?: string;
    keyPoints?: string;
    targetAudience?: string;
    toneNotes?: string;
    wordCountTarget?: string;
    // topic and title intentionally excluded — user fills fresh each time
  };
  context?: {
    items: ContextItem[];
  };
  signatureId?: number;
}

/**
 * Extract a reusable template brief from a full GhostwriterJob brief.
 * Removes topic, title, binary context items, and auto-added notes.
 */
export function extractTemplateBrief(
  fullBriefJson: string,
  signatureId?: number | null,
): TemplateBrief {
  const full = JSON.parse(fullBriefJson);
  const interview = full.interview ?? {};

  const templateInterview: TemplateBrief["interview"] = {
    contentType: interview.contentType ?? "blog",
    ...(interview.contentTypeLabel && { contentTypeLabel: interview.contentTypeLabel }),
    ...(interview.angle && { angle: interview.angle }),
    ...(interview.keyPoints && { keyPoints: interview.keyPoints }),
    ...(interview.targetAudience && { targetAudience: interview.targetAudience }),
    ...(interview.toneNotes && { toneNotes: interview.toneNotes }),
    ...(interview.wordCountTarget && { wordCountTarget: interview.wordCountTarget }),
  };

  const result: TemplateBrief = { interview: templateInterview };

  // Keep only text-based context items (no binary data)
  if (full.context?.items?.length) {
    const filtered = (full.context.items as ContextItem[]).filter(
      (item) =>
        !item.data &&
        !item.mediaType &&
        // Exclude the auto-added brief note
        !(item.tag === "note" && item.instructions?.startsWith("Author's original brief")) &&
        // Exclude draft material items
        !(item.instructions?.startsWith("User provided existing material")),
    );
    if (filtered.length > 0) {
      result.context = { items: filtered };
    }
  }

  if (signatureId) {
    result.signatureId = signatureId;
  }

  return result;
}

/** Generate a default template name from brief content. */
export function defaultTemplateName(brief: TemplateBrief): string {
  const typeLabel = brief.interview.contentTypeLabel ?? brief.interview.contentType;
  const angle = brief.interview.angle;
  if (angle) {
    const trimmed = angle.slice(0, 40);
    return `${typeLabel} — ${trimmed}${angle.length > 40 ? "..." : ""}`;
  }
  return `${typeLabel} template`;
}
