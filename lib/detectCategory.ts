// Must stay in sync with the keys of CONTENT_TYPE_LABELS in lib/content-types.ts
export type SampleCategory =
  // Personal
  | "notes" | "list" | "ai_prompt" | "letter" | "thank_you_note" | "review" | "bio" | "text_message"
  // Social Media
  | "social" | "twitter_thread" | "caption"
  // Professional
  | "email" | "proposal" | "cover_letter" | "resume" | "press_release" | "scope_of_work" | "rfp"
  // Business
  | "business_plan" | "report" | "case_study" | "handbook"
  // Marketing & Content
  | "blog" | "newsletter" | "ad_copy" | "product_description"
  // Education
  | "lesson_plan" | "course" | "guide"
  // Academic & Technical
  | "research" | "technical" | "whitepaper"
  // Creative & Spoken
  | "essay" | "speech" | "script"
  | "other";

export function detectCategory(content: string): SampleCategory {
  const trimmed = content.trim();
  const words = trimmed.split(/\s+/).length;
  const lines = trimmed.split("\n").filter((l) => l.trim().length > 0);
  const paragraphs = trimmed.split(/\n\s*\n/).filter((p) => p.trim().length > 0);

  // Compute bullet lines early — used by list, notes, and essay detection
  const bulletLines = lines.filter(
    (l) => /^[\-\*\•\u2022]/.test(l.trim()) || /^\d+[\.\)]/.test(l.trim())
  );

  // ── Very short ────────────────────────────────────────────────────────────

  if (words < 25) return "text_message";
  if (words < 75) return "caption";

  // ── Short-form new types (checked before email/resume) ────────────────────

  // AI prompt: instructional text directed at an AI model
  if (
    words < 500 &&
    /\b(you are|act as|respond as|generate|write me|create a|prompt|GPT|Claude|LLM|AI assistant)\b/i.test(trimmed)
  ) return "ai_prompt";

  // Thank you note: short + gratitude keywords
  if (
    words < 200 &&
    /\b(thank you|thanks so much|grateful|gratitude|appreciate|appreciation)\b/i.test(trimmed)
  ) return "thank_you_note";

  // Ad copy: short + marketing urgency + exclamation
  if (
    words < 200 &&
    /\b(limited time|order now|shop now|free shipping|discount|% off|sale ends|special offer|deal|buy now|CTA)\b/i.test(trimmed) &&
    /!/.test(trimmed)
  ) return "ad_copy";

  // Product description: short + commerce keywords
  if (
    words < 300 &&
    /\b(features?|specifications?|dimensions|price|buy now|add to cart|in stock|SKU|product)\b/i.test(trimmed)
  ) return "product_description";

  // Bio / about page
  if (
    words < 400 &&
    /\b(about me|biography|bio|about the author|about us|my name is|I am a|passionate about)\b/i.test(trimmed)
  ) return "bio";

  // List / to-do list: mostly bullet/numbered items, short
  if (
    words < 300 &&
    lines.length >= 3 &&
    bulletLines.length / lines.length > 0.6
  ) return "list";

  // Review / testimonial
  if (
    words < 500 &&
    /\b(stars?|rating|recommend|review|testimonial|I would give|out of 5|highly recommend)\b/i.test(trimmed)
  ) return "review";

  // ── Existing short/medium detections ──────────────────────────────────────

  // Email: greeting + sign-off pattern
  const hasGreeting = /^(hi|hey|hello|dear|good morning|good afternoon|to whom)\b/im.test(trimmed);
  const hasSignoff = /\b(best regards|kind regards|warm regards|sincerely|cheers|best,|thanks,|regards,)\s*\n/im.test(trimmed);
  if (hasGreeting && hasSignoff && words < 600) return "email";

  // Letter: "Dear" + formal closing + longer than email
  if (
    /^dear\b/im.test(trimmed) &&
    /\b(sincerely|yours truly|yours faithfully|respectfully|with love|warmly)\b/im.test(trimmed) &&
    words >= 200
  ) return "letter";

  // Resume: role/date-range patterns with common section headers
  if (
    /\b(experience|education|skills)\b/i.test(trimmed) &&
    /\b(20\d{2})\s*[-–]\s*(20\d{2}|present|current)\b/i.test(trimmed) &&
    words < 1500
  ) return "resume";

  // ── Structured / medium-form ──────────────────────────────────────────────

  // Lesson plan: educational structure keywords
  if (
    /\b(learning objectives?|lesson plan|lesson title|grade level|materials needed|assessment|standards)\b/i.test(trimmed) &&
    words < 2000
  ) return "lesson_plan";

  // Scope of work: project management keywords
  if (
    /\b(scope of work|deliverables|milestones|project scope|payment schedule|acceptance criteria)\b/i.test(trimmed) &&
    words < 3000
  ) return "scope_of_work";

  // RFP: procurement keywords
  if (
    /\b(request for proposal|RFP|proposal submission|evaluation criteria|solicitation|bid|vendor)\b/i.test(trimmed)
  ) return "rfp";

  // Technical: code blocks
  if (/```[\s\S]+?```/.test(trimmed)) return "technical";

  // ── Long-form ─────────────────────────────────────────────────────────────

  // Business plan: investor-facing language + substantial length
  if (
    /\b(executive summary|market analysis|business model|revenue model|financial projections|competitive analysis|target market|business plan)\b/i.test(trimmed) &&
    words > 500
  ) return "business_plan";

  // Handbook: policy/organizational keywords + substantial length
  if (
    /\b(handbook|employee handbook|company handbook|policy|policies|code of conduct|onboarding)\b/i.test(trimmed) &&
    words > 500
  ) return "handbook";

  // Guide / how-to: instructional keywords
  if (
    /\b(how to|step-by-step|tutorial|guide|walkthrough|getting started)\b/i.test(trimmed) &&
    words >= 200
  ) return "guide";

  // Course content: curriculum keywords
  if (
    /\b(module \d|lesson \d|course|curriculum|learning outcomes?|prerequisites?|syllabus)\b/i.test(trimmed) &&
    words > 400
  ) return "course";

  // Research: abstract + references
  if (/\babstract\b/i.test(trimmed) && words > 600) return "research";

  // Social / thread: several short chunks separated by blank lines
  if (paragraphs.length >= 3 && words < 600 && words / paragraphs.length < 70) return "social";

  // Bullet-heavy → notes (short) or essay (medium)
  if (lines.length > 0 && bulletLines.length / lines.length > 0.4 && words < 800) return "essay";

  if (words >= 400) return "blog";

  return "other";
}
