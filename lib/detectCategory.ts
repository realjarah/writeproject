export type SampleCategory = "blog" | "thread" | "caption" | "notes" | "email" | "other";

export function detectCategory(content: string): SampleCategory {
  const trimmed = content.trim();
  const words = trimmed.split(/\s+/).length;
  const lines = trimmed.split("\n").filter((l) => l.trim().length > 0);
  const paragraphs = trimmed.split(/\n\s*\n/).filter((p) => p.trim().length > 0);

  // Caption: very short
  if (words < 80) return "caption";

  // Email: greeting + sign-off pattern
  const hasGreeting = /^(hi|hey|hello|dear|good morning|good afternoon)\b/im.test(trimmed);
  const hasSignoff = /\b(best|regards|thanks|sincerely|cheers|warm regards|best regards)\s*[,.]?\s*\n/im.test(trimmed);
  if (hasGreeting && hasSignoff) return "email";

  // Notes: majority of lines are bullets or numbered fragments
  const bulletLines = lines.filter(
    (l) => /^[\-\*\•]/.test(l.trim()) || /^\d+[\.\)]/.test(l.trim())
  );
  if (lines.length > 0 && bulletLines.length / lines.length > 0.4) return "notes";

  // Thread: several short chunks separated by blank lines
  if (paragraphs.length >= 3 && words < 600) {
    const avgWordsPerPara = words / paragraphs.length;
    if (avgWordsPerPara < 80) return "thread";
  }

  // Blog: longer form writing
  if (words >= 400) return "blog";

  return "other";
}
