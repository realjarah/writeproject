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
  | "lesson_plan" | "course" | "guide" | "textbook_chapter"
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

  // ── Short-form (checked before email/resume) ───────────────────────────────

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

  // Notes: short, informal, no structure markers from other types
  if (
    words < 300 &&
    paragraphs.length <= 3 &&
    !bulletLines.length &&
    !/^(hi|hey|hello|dear)\b/im.test(trimmed) &&
    !/\b(sincerely|regards|cheers)\b/im.test(trimmed)
  ) return "notes";

  // Review / testimonial
  if (
    words < 500 &&
    /\b(stars?|rating|recommend|review|testimonial|I would give|out of 5|highly recommend)\b/i.test(trimmed)
  ) return "review";

  // ── Email / letter / cover letter ──────────────────────────────────────────

  // Email: greeting + sign-off pattern
  const hasGreeting = /^(hi|hey|hello|dear|good morning|good afternoon|to whom)\b/im.test(trimmed);
  const hasSignoff = /\b(best regards|kind regards|warm regards|sincerely|cheers|best,|thanks,|regards,)\s*\n/im.test(trimmed);
  if (hasGreeting && hasSignoff && words < 600) return "email";

  // Cover letter: job application keywords + letter structure
  if (
    /\b(cover letter|hiring manager|position|role|application|applying|job posting|resume attached|enclosed)\b/i.test(trimmed) &&
    (hasGreeting || hasSignoff) &&
    words >= 150 && words < 600
  ) return "cover_letter";

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

  // ── Social media ───────────────────────────────────────────────────────────

  // Twitter/X thread: chunks separated by --- or numbered tweet markers
  if (
    (/\n---\n/.test(trimmed) || /^\d+\/\d+/m.test(trimmed) || /^tweet \d/im.test(trimmed)) &&
    words < 2000
  ) return "twitter_thread";

  // Social post: several short chunks separated by blank lines
  if (paragraphs.length >= 3 && words < 600 && words / paragraphs.length < 70) return "social";

  // ── Structured / medium-form ───────────────────────────────────────────────

  // Press release: FOR IMMEDIATE RELEASE or dateline pattern or explicit mention
  if (
    /\b(for immediate release|press release|media contact|press contact|dateline|boilerplate|###)\b/i.test(trimmed) &&
    words >= 200
  ) return "press_release";

  // Script: speaker labels (NAME:) or stage directions [brackets]
  if (
    /^[A-Z][A-Z\s]+:/m.test(trimmed) &&
    (trimmed.match(/^[A-Z][A-Z\s]+:/gm)?.length ?? 0) >= 3
  ) return "script";

  // Speech: rhetorical address patterns, spoken delivery markers
  if (
    /\b(ladies and gentlemen|fellow|thank you for being here|let me tell you|I stand before you|good evening|good morning everyone|commencement|keynote|toast)\b/i.test(trimmed) &&
    words >= 200
  ) return "speech";

  // Textbook chapter: long-form educational structure
  if (
    /\b(chapter \d|textbook|learning objectives?|key terms?|review questions?|end.of.chapter|worked examples?|chapter summary)\b/i.test(trimmed) &&
    words >= 1500
  ) return "textbook_chapter";

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

  // Proposal: persuasive project/service pitch keywords
  if (
    /\b(proposed solution|project proposal|we propose|our approach|scope|timeline|budget|pricing|engagement|objectives)\b/i.test(trimmed) &&
    (trimmed.match(/\b(proposed|proposal|we propose|our approach|scope|timeline|budget|deliverables)\b/gi)?.length ?? 0) >= 2 &&
    words >= 300
  ) return "proposal";

  // Technical: code blocks or heavy technical markers
  if (/```[\s\S]+?```/.test(trimmed)) return "technical";

  // Newsletter: newsletter keywords, section-heavy structure, subscribe/unsubscribe
  if (
    /\b(newsletter|subscribe|unsubscribe|this week|this month|in this issue|weekly roundup|monthly update|top stories|what's new)\b/i.test(trimmed) &&
    words >= 150
  ) return "newsletter";

  // ── Long-form ──────────────────────────────────────────────────────────────

  // Case study: challenge/solution/results structure
  if (
    /\b(case study|challenge|solution|results|outcomes|ROI|before and after|client|customer success)\b/i.test(trimmed) &&
    (trimmed.match(/\b(challenge|solution|results|outcomes|implementation)\b/gi)?.length ?? 0) >= 2 &&
    words >= 300
  ) return "case_study";

  // Report: structured analysis/findings language
  if (
    /\b(findings|analysis|methodology|recommendations|executive summary|key takeaways|data shows|quarterly|annual report)\b/i.test(trimmed) &&
    (trimmed.match(/\b(findings|analysis|methodology|recommendations|data|report)\b/gi)?.length ?? 0) >= 2 &&
    words >= 400
  ) return "report";

  // Business plan: investor-facing language + substantial length
  if (
    /\b(executive summary|market analysis|business model|revenue model|financial projections|competitive analysis|target market|business plan)\b/i.test(trimmed) &&
    words > 500
  ) return "business_plan";

  // Whitepaper: in-depth research/position paper with formal structure
  if (
    /\b(white\s?paper|position paper|in-depth analysis|comprehensive guide|industry report)\b/i.test(trimmed) &&
    words > 800
  ) return "whitepaper";

  // Research: abstract + references
  if (/\babstract\b/i.test(trimmed) && words > 600) return "research";

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

  // ── Fallbacks ──────────────────────────────────────────────────────────────

  // Bullet-heavy medium → essay
  if (lines.length > 0 && bulletLines.length / lines.length > 0.4 && words < 800) return "essay";

  // Speech fallback: oral delivery style (shorter sentences, direct address, rhetorical questions)
  if (
    words >= 300 &&
    /\b(we must|I believe|imagine|ask yourself|let me|together we|my friends)\b/i.test(trimmed) &&
    words / paragraphs.length < 80
  ) return "speech";

  if (words >= 400) return "blog";

  return "other";
}
