// Must stay in sync with the keys of CONTENT_TYPE_LABELS in lib/content-types.ts
export type SampleCategory =
  | "blog" | "essay" | "newsletter" | "whitepaper"
  | "email" | "report" | "press_release" | "proposal" | "case_study"
  | "resume" | "cover_letter"
  | "research" | "technical"
  | "social" | "caption" | "text_message"
  | "speech" | "script"
  | "other";

export function detectCategory(content: string): SampleCategory {
  const trimmed = content.trim();
  const words = trimmed.split(/\s+/).length;
  const lines = trimmed.split("\n").filter((l) => l.trim().length > 0);
  const paragraphs = trimmed.split(/\n\s*\n/).filter((p) => p.trim().length > 0);

  if (words < 25) return "text_message";
  if (words < 75) return "caption";

  // Email: greeting + sign-off pattern
  const hasGreeting = /^(hi|hey|hello|dear|good morning|good afternoon|to whom)\b/im.test(trimmed);
  const hasSignoff = /\b(best regards|kind regards|warm regards|sincerely|cheers|best,|thanks,|regards,)\s*\n/im.test(trimmed);
  if (hasGreeting && hasSignoff) return "email";

  // Resume: role/date-range patterns with common section headers
  if (
    /\b(experience|education|skills)\b/i.test(trimmed) &&
    /\b(20\d{2})\s*[-–]\s*(20\d{2}|present|current)\b/i.test(trimmed) &&
    words < 1500
  ) return "resume";

  // Technical: code blocks
  if (/```[\s\S]+?```/.test(trimmed)) return "technical";

  // Research: abstract + references
  if (/\babstract\b/i.test(trimmed) && words > 600) return "research";

  // Social / thread: several short chunks separated by blank lines
  if (paragraphs.length >= 3 && words < 600 && words / paragraphs.length < 70) return "social";

  // Bullet-heavy → essay
  const bulletLines = lines.filter(
    (l) => /^[\-\*\•]/.test(l.trim()) || /^\d+[\.\)]/.test(l.trim())
  );
  if (lines.length > 0 && bulletLines.length / lines.length > 0.4 && words < 800) return "essay";

  if (words >= 400) return "blog";

  return "other";
}
