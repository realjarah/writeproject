import { GoogleGenAI } from "@google/genai";
import type { SampleCategory } from "./detectCategory";

let _gemini: GoogleGenAI;
function getGemini() {
  if (!_gemini) _gemini = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
  return _gemini;
}

const VALID_CATEGORIES: SampleCategory[] = [
  // Personal
  "notes", "list", "ai_prompt", "letter", "thank_you_note", "review", "bio", "text_message",
  // Social Media
  "social", "twitter_thread", "caption",
  // Professional
  "email", "proposal", "cover_letter", "resume", "press_release", "scope_of_work", "rfp",
  // Business
  "business_plan", "report", "case_study", "handbook",
  // Marketing & Content
  "blog", "newsletter", "ad_copy", "product_description",
  // Education
  "lesson_plan", "course", "guide",
  // Academic & Technical
  "research", "technical", "whitepaper",
  // Creative & Spoken
  "essay", "speech", "script",
];

/** Max chars of content to send for classification — keeps it fast and cheap */
const MAX_CLASSIFY_CHARS = 3000;

/**
 * Classify a writing sample into one of the known content categories using Gemini Flash.
 * Falls back to "blog" if classification fails.
 */
export async function classifyCategory(content: string): Promise<SampleCategory> {
  const snippet = content.length > MAX_CLASSIFY_CHARS
    ? content.slice(0, MAX_CLASSIFY_CHARS) + "\n[…truncated]"
    : content;

  try {
    const result = await getGemini().models.generateContent({
      model: "gemini-2.5-flash",
      contents: snippet,
      config: {
        systemInstruction: `Classify this writing sample into exactly one category. Return ONLY the category key, nothing else.

Categories:
- notes: Personal notes, brain dumps, shorthand
- list: Bullet points, numbered items, to-do lists
- ai_prompt: Instructions directed at an AI model
- letter: Formal or semi-formal correspondence
- thank_you_note: Short gratitude message
- review: Product/service review or testimonial
- bio: About me, biography, personal description
- text_message: Very short casual message
- social: Social media post (single)
- twitter_thread: Multi-part social thread
- caption: Short image/video caption
- email: Email correspondence
- proposal: Business proposal
- cover_letter: Job application cover letter
- resume: Resume or CV
- press_release: Press/media release
- scope_of_work: Project scope document
- rfp: Request for proposal
- business_plan: Business plan
- report: Business or organizational report
- case_study: Case study analysis
- handbook: Policy handbook or manual
- blog: Blog post or article
- newsletter: Email newsletter
- ad_copy: Advertisement copy
- product_description: Product listing description
- lesson_plan: Educational lesson plan
- course: Course or curriculum content
- guide: How-to guide or tutorial
- research: Academic research paper or study
- technical: Technical documentation with code
- whitepaper: Industry whitepaper
- essay: Personal essay or opinion piece
- speech: Speech or presentation script
- script: Screenplay, podcast script, dialogue`,
        maxOutputTokens: 32,
      },
    });

    const raw = (result.text ?? "").trim().toLowerCase().replace(/[^a-z_]/g, "");
    if (VALID_CATEGORIES.includes(raw as SampleCategory)) {
      return raw as SampleCategory;
    }
    // Partial match — Gemini might return something like "blog_post"
    const match = VALID_CATEGORIES.find(c => raw.includes(c));
    return match ?? "blog";
  } catch (err) {
    console.warn("[classifyCategory] Gemini classification failed, defaulting to blog:", err);
    return "blog";
  }
}
