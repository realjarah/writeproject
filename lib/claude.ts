import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { GoogleGenAI } from "@google/genai";

// Re-export shared types and constants from the client-safe module
export type {
  ContextItemTag,
  ContextItem,
  GenerationContext,
  InterviewAnswers,
  VoiceAnalysis,
  SubVoiceAnalysis,
  LabeledSample,
} from "./content-types";
export { CONTENT_TYPE_LABELS, CONTENT_TYPE_GROUPS } from "./content-types";

import type {
  VoiceAnalysis,
  SubVoiceAnalysis,
  LabeledSample,
  ContextItem,
  GenerationContext,
  InterviewAnswers,
} from "./content-types";
import { CONTENT_TYPE_LABELS } from "./content-types";

// ── Provider clients (lazy — Next.js evaluates modules at build time) ────────
// 3-agent architecture:
//   Agent 1 (Grok): Voice analyzer — extracts rich voice profile from samples
//   Agent 2 (Opus): Writer — plans + drafts using voice profile only (no raw samples)
//   Agent 3 (Opus): Editor — self-review + humanizer using voice profile only
let _anthropic: Anthropic;
function getAnthropic() {
  if (!_anthropic) _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return _anthropic;
}

// Grok: voice analysis (2M context for reading all samples at once)
let _xai: OpenAI;
function getXai() {
  if (!_xai) _xai = new OpenAI({ apiKey: process.env.XAI_API_KEY, baseURL: "https://api.x.ai/v1" });
  return _xai;
}

// Gemini Flash: all interim / low-stakes calls
let _gemini: GoogleGenAI;
function getGemini() {
  if (!_gemini) _gemini = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
  return _gemini;
}

// ── Model IDs ────────────────────────────────────────────────────────────────
const XAI_WRITING_MODEL = "grok-4-1-fast-reasoning";
const GEMINI_FAST_MODEL = "gemini-2.5-flash";

// ── Retry helper ─────────────────────────────────────────────────────────────
// Retries on transient failures (rate limits, network errors, 5xx).
// Exponential backoff: 2s, 4s, 8s. Max 3 retries.

function isRetryable(err: unknown): boolean {
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    // Rate limit / overloaded / timeout / network
    if (msg.includes("rate") || msg.includes("429") || msg.includes("503")
        || msg.includes("overloaded") || msg.includes("timeout")
        || msg.includes("econnreset") || msg.includes("socket hang up")
        || msg.includes("fetch failed")) {
      return true;
    }
    // OpenAI SDK / Anthropic SDK status codes
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const status = (err as any).status ?? (err as any).statusCode;
    if (status === 429 || status === 503 || status === 502 || status === 500) return true;
  }
  return false;
}

async function withRetry<T>(fn: () => Promise<T>, label: string, maxRetries = 3): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt < maxRetries && isRetryable(err)) {
        const delayMs = 2000 * Math.pow(2, attempt); // 2s, 4s, 8s
        console.warn(`[retry] ${label} attempt ${attempt + 1} failed, retrying in ${delayMs}ms:`, err instanceof Error ? err.message : err);
        await new Promise((r) => setTimeout(r, delayMs));
        continue;
      }
      throw err;
    }
  }
  throw lastErr; // unreachable, but TypeScript needs it
}

/** Best-effort repair of LLM-produced JSON before parsing.
 *  Handles reasoning models that output thinking/explanation around the JSON. */
function repairJson(text: string): string {
  let s = text
    // Strip markdown code fences
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/, "")
    .trim();

  // Extract JSON object from surrounding text (reasoning models often
  // output explanation before/after the JSON)
  const firstBrace = s.indexOf("{");
  const lastBrace = s.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    s = s.slice(firstBrace, lastBrace + 1);
  }

  // Remove trailing commas before } or ]
  s = s.replace(/,\s*([}\]])/g, "$1");
  // Strip control characters that break JSON strings (keep \n \r \t)
  s = s.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, "");
  return s;
}

export async function analyzeVoice(samples: LabeledSample[]): Promise<VoiceAnalysis> {
  const samplesText = samples
    .map((s, i) => {
      let header = `--- Sample ${i + 1} [${s.category.toUpperCase()}] ---`;
      if (s.notes) header += `\nAuthor's note: "${s.notes}"`;
      return `${header}\n${s.content}`;
    })
    .join("\n\n");

  const categories = Array.from(new Set(samples.map((s) => s.category)));
  const categorySection =
    categories.length > 1
      ? `\nNote: samples span multiple formats (${categories.join(", ")}). Include a "categoryInsights" field with per-format style notes where the author's voice shifts noticeably between formats.\n`
      : "";

  const systemPrompt = `You are an elite writing forensics analyst. Your job is to deeply analyze writing samples from a single author and extract a voice profile so precise that a ghostwriter could produce text indistinguishable from this person's own work.

REASONING PROTOCOL — USE YOUR FULL THINKING BUDGET:
Before producing any output, you MUST spend extensive time in your reasoning/thinking phase. Do NOT rush to output. Think step by step:
1. Read EVERY sample at least twice. On the first pass, note surface patterns. On the second pass, look for the things hiding underneath — the imperfections, the broken rules, the weird rhythm choices.
2. Compare samples against each other. Where is the author consistent? Where do they contradict themselves? Both are signal.
3. Ask yourself: "If I handed this profile to a ghostwriter and they wrote something, what would give them away as NOT this person?" That's where your analysis needs to go deeper.
4. MOST IMPORTANT: Catalog every single deviation from "correct" writing. Fragments. Run-ons. Comma splices. Starting with conjunctions. Weird punctuation. Missing transitions. Stream-of-consciousness tangents. Sentences that break halfway. Grammar a teacher would red-pen. THESE ARE THE GOLD. An AI ghostwriter's #1 failure mode is writing too cleanly. Every imperfection you miss is a tell that outs the ghostwriter.

IMPERFECTION IS THE SIGNAL:
The things a grammar checker would flag are MORE important than the things it wouldn't. Polished prose is generic. Broken rules are fingerprints. A voice profile that reads like a style guide has failed — it should read like a forensic report on someone's writing habits, warts and all.

EVERY FIELD IS FORENSIC:
Apply the same exhaustive rigor to EVERY field — tone, sentence structure, vocabulary, punctuation, paragraph style, rhetorical devices, emotional patterns, transitions. Each one is a dimension of the voice fingerprint. A detailed imperfections section paired with a lazy "conversational and friendly" tone field gives the ghostwriter a lopsided profile. Go deep everywhere.

DEPTH OVER BREVITY:
Be dense and exhaustive in every field — not just imperfections. Catalog every pattern you find. No filler, no hedging, no "the author tends to" preamble. Just the patterns, all of them. A field with 2 observations when 10 exist is a failed field. The ghostwriter only knows what you tell them.`;

  const userPrompt = `Analyze the following writing samples and extract a voice profile for ghostwriting.
${categorySection}
${samplesText}

Return ONLY valid JSON (no markdown, no extra text).
EVERY field below must be forensically detailed — catalog every pattern you find, not just the obvious ones. Treat each field like the imperfections field: exhaustive, specific, dense. A sparse field is a failed field.

{
  "tone": "Catalog the full tonal range. What's the default register? Where does it shift — when do they get serious, playful, cutting, earnest? How do they handle authority vs vulnerability? Map the emotional texture, not just 'conversational and friendly'.",
  "sentenceStructure": "Exhaustive structural fingerprint. Average sentence length and range (short punchy vs long winding). How do they vary rhythm — do they stack short sentences then hit a long one? Do they front-load or back-load the key idea? Sentence fragments used as emphasis? Compound sentences chained with commas vs periods? Map the full rhythmic signature.",
  "vocabularyStyle": "Full register map. Where do they sit on formal-casual spectrum and when do they break from it? Do they mix registers (technical + slang in same paragraph)? Latinate vs Anglo-Saxon word choices? Do they coin words, verb nouns, use intentional malapropisms? Abstract vs concrete language ratio. NO domain-specific terms.",
  "punctuationHabits": "Catalog every punctuation pattern. Em-dash usage (paired or unpaired? frequency?). Ellipsis placement and purpose. Semicolon frequency. Serial comma or not. Exclamation marks — how often and where? Parenthetical asides — how nested? Colon usage for lists vs emphasis. Question marks in non-questions. Every mark is signal.",
  "paragraphStyle": "Full structural map. Average paragraph length and variation. How do they open paragraphs — topic sentence, anecdote, question, continuation? How do they close — resolution, cliffhanger, trailing off? One-sentence paragraphs for emphasis? How dense are their paragraphs vs airy?",
  "rhetoricalDevices": "Exhaustive catalog. Analogies/metaphors — how often, how elaborate, from what domains? Rhetorical questions — genuine or setup? Lists — inline or formatted, parallel structure or loose? Repetition for emphasis (anaphora, epistrophe)? Direct address to reader? Callbacks to earlier points? Hypotheticals? Rule of three? Contrast/antithesis? Understatement vs hyperbole preference?",
  "commonPatterns": ["abstract structural/phrasing patterns — 5-8 items, be thorough"],
  "thingsToAvoid": ["patterns absent from this author's work — 5-8 items, be thorough"],
  "rawSummary": "3-5 sentence plain English summary capturing the essence of their writing voice — make it vivid enough that a ghostwriter could start writing after reading just this",
  "humanImperfections": "THIS IS THE MOST IMPORTANT FIELD. Every grammar rule they break, every 'mistake' that's actually a feature. Fragments, run-ons, comma splices, conjunction starts, dangling modifiers, tense shifts, incomplete thoughts — catalog ALL of them. Be exhaustive. These are the fingerprints that prevent AI-sounding output.",
  "authenticQuirks": "Exhaustive behavioral catalog. How do they handle emphasis — caps, italics, repetition, punctuation, short paragraphs? Where does their rhythm deliberately break? Structural weirdness — non-standard formatting, unconventional section breaks, list abuse or avoidance? Signature moves they repeat across samples. Verbal tics in written form. NO quoted phrases or domain terms.",
  "emotionalPatterns": "Full emotional architecture. How do they shift between emotional and analytical register — abruptly or gradually? Do they telegraph emotion or let it surface through word choice? Understatement vs directness. Deflection with humor. How do they handle vulnerability, conviction, uncertainty? Do they build to emotional peaks or stay flat? Sarcasm markers.",
  "transitionStyle": "Complete transition map. How do they connect (or don't connect) ideas? Abrupt jumps vs smooth bridges. Do they use explicit transition words or just trust the reader? Callbacks to earlier points. Stream-of-consciousness drift. Non-sequiturs that work. How do they handle paragraph-to-paragraph flow vs section-to-section flow? Do they signal topic shifts or just cut?",
  "categoryInsights": { "blog": "voice in long-form", "thread": "social/thread style" },
  "contentGuidelines": {
    "[contentType]": ["4-6 actionable guidelines. Must describe abstract voice patterns for this format, NOT content-specific instructions. A guideline that only works for one topic is a bad guideline."]
  }
}

Rules:
- categoryInsights: Only include keys for formats in the samples. Omit entirely if one format.
- contentGuidelines: Only for formats in samples. 4-6 strings each. Must be about HOW they write, not WHAT they write about.
- humanImperfections and authenticQuirks carry the most weight, but EVERY field matters. A thin analysis in any field produces a thin imitation. Spend reasoning time on all fields, not just imperfections.
- DENSITY NOT BREVITY: Each field should be as thorough as the imperfections field — catalog every pattern you find. Dense, specific observations. No filler or hedging, but also no artificially truncating your analysis to save space. If you found 12 punctuation patterns, list all 12.
- ABSOLUTELY NO EXAMPLES: Never quote, reference, or list specific words, phrases, terms, metaphors, or subject matter from the samples. No parenthetical examples like "(e.g., ...)". No domain vocabulary. The profile will be applied across completely different topics — any specificity causes content bleed and hallucination. Describe the ABSTRACT PATTERN only. "Mixes technical and casual register" is good. Listing the actual technical terms is catastrophically bad.`;

  // Grok 4.1 reasoning: 2M context window lets us feed ALL samples at once.
  // 128K completion budget gives the reasoning model room to actually THINK
  // deeply about imperfections and patterns before producing compact output.
  // The output itself is small JSON — the budget is for reasoning, not output.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const res: any = await withRetry(() => getXai().chat.completions.create({
    model: XAI_WRITING_MODEL,
    max_completion_tokens: 128000,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
  }), "analyzeVoice");

  // Reasoning models may put the answer in content or reasoning_content
  const msg = res.choices[0].message;
  const raw = msg.content ?? msg.reasoning_content ?? "";
  if (!raw) {
    throw new Error(`[analyzeVoice] Empty response from Grok. finish_reason: ${res.choices[0].finish_reason}`);
  }
  return JSON.parse(repairJson(raw)) as VoiceAnalysis;
}

/**
 * Analyze how the author's voice manifests in a specific content format.
 * Uses a dedicated Grok call focused on only that category's samples.
 */
export async function analyzeSubVoice(
  category: string,
  samples: LabeledSample[],
  mainVoiceSummary: string
): Promise<SubVoiceAnalysis> {
  const categorySamples = samples.filter(s => s.category === category);
  // Need at least 3 samples to detect real patterns vs one-off quirks
  if (categorySamples.length < 3) {
    console.log(`[analyzeSubVoice] Skipping ${category}: only ${categorySamples.length} sample(s), need at least 3`);
    return { summary: "", toneShift: "", structuralPatterns: "", vocabularyNotes: "", keyGuidelines: [] };
  }

  const samplesText = categorySamples
    .map((s, i) => {
      let header = `--- Sample ${i + 1} ---`;
      if (s.notes) header += `\nAuthor's note: "${s.notes}"`;
      return `${header}\n${s.content}`;
    })
    .join("\n\n");

  const categoryLabel = CONTENT_TYPE_LABELS[category] ?? category;

  const systemPrompt = `You are a writing forensics analyst. You have already profiled this author's overall voice. Now isolate how their voice SHIFTS when writing ${categoryLabel} content — focus on abstract behavioral patterns, not content-specific details.

REASONING PROTOCOL: Think deeply before outputting. Compare the ${categoryLabel} samples against the overall voice summary. What changes? What stays the same? What imperfections show up more or less in this format? Spend most of your reasoning on the FORMAT-LEVEL behavior, not the subject matter.

THE TRAP TO AVOID: You will be tempted to describe WHAT the author writes about in this format. Do NOT do that. Describe HOW they write differently in this format. "Uses more formal register" = good. "Details five-step constructions" = bad (that's content, not voice). If a guideline only makes sense for one topic, it's content not voice — throw it out.`;

  const userPrompt = `Overall voice summary: "${mainVoiceSummary}"

${categoryLabel} samples:

${samplesText}

Return ONLY valid JSON:
{
  "summary": "1-2 sentences. How this author's voice shifts in ${categoryLabel} format.",
  "toneShift": "1 sentence. Tone change vs general voice, or 'minimal shift' if none.",
  "structuralPatterns": "1-2 sentences. Structural habits in this format — paragraph rhythm, section patterns, opening/closing tendencies.",
  "vocabularyNotes": "1 sentence. Register or complexity shift. NO domain terms.",
  "keyGuidelines": ["3-4 abstract voice guidelines that apply regardless of topic. Each must describe a PATTERN of how they write, not what they write about."]
}

Rules:
- BREVITY: Each field 1-2 sentences max. Dense, no filler.
- ZERO CONTENT SPECIFICITY: No domain terms, no subject matter references, no content-specific instructions. Every observation must be about voice/style/structure patterns that hold across ANY topic written in this format.
- keyGuidelines must pass this test: "Would this guideline make sense if the author wrote about a completely different subject in this same format?" If no, throw it out.
- Focus on imperfections and quirks that are format-specific — do they get more or less polished in this format?`;

  // 64K budget — sub-voices need deep reasoning to stay abstract
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const res: any = await withRetry(() => getXai().chat.completions.create({
    model: XAI_WRITING_MODEL,
    max_completion_tokens: 64000,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
  }), `analyzeSubVoice:${category}`);

  const subMsg = res.choices[0].message;
  const raw = subMsg.content ?? subMsg.reasoning_content ?? "";
  return JSON.parse(repairJson(raw)) as SubVoiceAnalysis;
}

/**
 * Run main voice analysis + parallel per-category sub-voice analysis.
 * Returns a unified VoiceAnalysis with subVoices populated.
 */
export async function analyzeVoiceWithSubVoices(
  samples: LabeledSample[],
  selectedCategories: string[]
): Promise<VoiceAnalysis> {
  const mainAnalysis = await analyzeVoice(samples);

  // Only run sub-voice calls for categories with 3+ samples — fewer than that
  // produces unreliable, overly-specific profiles that cause content bleed
  const categoriesWithSamples = selectedCategories.filter(cat =>
    samples.filter(s => s.category === cat).length >= 3
  );

  if (categoriesWithSamples.length > 0) {
    const subVoiceResults = await Promise.all(
      categoriesWithSamples.map(async (category) => {
        try {
          const subVoice = await analyzeSubVoice(category, samples, mainAnalysis.rawSummary);
          return [category, subVoice] as const;
        } catch (err) {
          console.warn(`[analyzeSubVoice] Failed for ${category}:`, err);
          return null;
        }
      })
    );

    const subVoices: Record<string, SubVoiceAnalysis> = {};
    for (const result of subVoiceResults) {
      if (result) subVoices[result[0]] = result[1];
    }
    mainAnalysis.subVoices = subVoices;
  }

  return mainAnalysis;
}


// ── Shared constants ────────────────────────────────────────────────────────
// CONTENT_TYPE_LABELS and CONTENT_TYPE_GROUPS are imported from ./content-types

const WORD_GUIDANCE: Record<string, string> = {
  // Personal
  notes:               "Personal notes, brain dumps, shorthand. Match the author's natural thinking style. 50–500 words.",
  list:                "Bullet points or numbered items. Clear, actionable where applicable. No unnecessary prose. 5–50 items.",
  ai_prompt:           "Clear, specific instructions for an AI model. Define role, task, constraints, and output format. 50–500 words. Precision matters more than length.",
  letter:              "Formal or semi-formal correspondence. Opening greeting, body paragraphs, closing. 200–800 words.",
  thank_you_note:      "Warm, personal, specific. Reference what you're thanking for. 50–200 words.",
  review:              "Honest, specific assessment. Lead with the verdict, support with details and examples. 100–500 words. Conversational but credible.",
  bio:                 "First or third person as specified. Highlight credentials, experience, and personality. Concise but compelling. 50–300 words.",
  text_message:        "1–3 sentences max. Casual, direct. Match the sender's register.",
  // Social Media
  social:              "Single post. Twitter/X: under 280 characters total. LinkedIn: 150–300 words with line breaks. No markdown symbols.",
  twitter_thread:      "Output each tweet separated by '---' on its own line (e.g. tweet text\\n---\\nnext tweet). Each tweet MUST be under 280 characters — this is a hard platform limit, count carefully. Aim for 5–12 tweets. Each tweet should flow naturally into the next but stand alone. Plain text only — no markdown bold/italics/headers/bullets. Open strong, close with a hook or call to action.",
  caption:             "1–4 sentences. Conversational, relevant to the image or moment.",
  // Professional
  email:               "Subject line first, then body. Short paragraphs, one clear ask or CTA. 50–400 words.",
  proposal:            "Executive summary → problem → solution → timeline → budget (if provided) → next steps. Persuasive but factual.",
  cover_letter:        "3–4 paragraphs: hook → specific connection to role → evidence → closing ask. 250–400 words.",
  resume:              "Reverse chronological unless specified. Achievement-focused bullets. Quantify impact. No filler. ATS-friendly.",
  press_release:       "Inverted pyramid: headline + dateline + lead (who/what/when/where/why) + body + boilerplate. 400–600 words.",
  scope_of_work:       "Formal project document. Sections: overview → objectives → deliverables → timeline/milestones → assumptions → acceptance criteria. Precise, unambiguous language. 500–2000 words.",
  rfp:                 "Formal procurement document or response. Clear requirements, evaluation criteria, submission instructions, and timeline. Professional, specific, and structured. 500–3000 words.",
  // Business
  business_plan:       "Write as long as the scope demands — complete coverage is essential. Executive summary → company description → market analysis → competitive landscape → products/services → marketing strategy → operations → financial projections → funding requirements. Data-driven, investor-ready language.",
  report:              "Structured with headers. Executive summary first. Data-driven, precise language. Write as long as the scope demands — never truncate to hit a word count. Attribute all [REFERENCE] context items as sources.",
  case_study:          "Challenge → approach → results → lessons learned. 800–2000 words. Specific, quantified outcomes.",
  handbook:            "Write as long as the scope demands — comprehensive coverage is critical. Clear section headers, consistent formatting, plain language. Policy-oriented but accessible. Table of contents structure.",
  // Marketing & Content
  blog:                "600–1200 words unless the brief specifies otherwise. Short paragraphs, natural web formatting.",
  newsletter:          "Conversational, scannable. Clear sections with headers. 200–600 words per section.",
  ad_copy:             "Headline + body. Benefit-driven, clear CTA. Tight, punchy language. Match the platform (social ad, print, landing page). 25–200 words.",
  product_description: "Feature-benefit structure. Scannable, specific, sensory where appropriate. Match the platform (e-commerce, catalog, landing page). 50–300 words.",
  // Education
  lesson_plan:         "Structured format: objectives → materials → procedure → assessment → differentiation. Clear, actionable steps for the instructor. 300–1000 words.",
  course:              "Write as long as the scope demands. Module/lesson structure with clear learning objectives, content sections, activities, and assessment prompts. Educational but engaging tone.",
  guide:               "Step-by-step structure with clear headers. Actionable, practical instructions. 500–2000 words. Include prerequisites, warnings, and tips where helpful.",
  // Academic & Technical
  research:            "Write as long as the scope demands — do not truncate to hit a word count. Academic structure: abstract, introduction, literature review, methodology, results, discussion, conclusion, references. Cover every facet of the topic. Cite every [REFERENCE] context item in-text and in the references section.",
  technical:           "Write as long as the scope demands — complete coverage beats brevity. Precision over style. Code blocks and numbered steps where relevant. Headers for navigation. Match the specified audience level. Cite [REFERENCE] context items with inline links or footnotes.",
  whitepaper:          "Write as long as the scope demands — cover the full argument completely. Abstract → executive summary → body sections → conclusion. Data-backed throughout. Cite all [REFERENCE] context items.",
  // Creative & Spoken
  essay:               "500–1500 words. Clear thesis, structured argument, strong opening and close.",
  speech:              "Write for the ear, not the eye. Short sentences, natural pauses, direct address. Memorable opening and close.",
  script:              "Label speakers or segments clearly. Write for spoken delivery. Conversational but structured. Include stage directions if helpful.",
};

// ── Files API helpers ────────────────────────────────────────────────────────

const FILES_API_BETA = "files-api-2025-04-14";

/**
 * Upload a single file to the Anthropic Files API.
 * Returns a file_id that can be referenced in subsequent Messages API calls.
 */
export async function uploadFile(
  data: Buffer,
  fileName: string,
  mediaType: string
): Promise<string> {
  // Convert Buffer to Uint8Array copy for Blob constructor compatibility
  const bytes = new Uint8Array(data);
  const blob = new Blob([bytes as BlobPart], { type: mediaType });
  const file = new File([blob], fileName, { type: mediaType });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const uploaded = await (getAnthropic().beta as any).files.upload({ file });
  if (!uploaded?.id) {
    throw new Error(`Files API returned no id for ${fileName}`);
  }
  return uploaded.id;
}

/**
 * Extract clean text from a PDF via the Files API + Sonnet.
 * Used so text-only models (Grok) can see PDF context during planning/drafting.
 */
async function extractPdfText(fileId: string, fileName?: string): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const message = await (getAnthropic().messages.create as any)(
    {
      model: "claude-sonnet-4-6",
      max_tokens: 16000,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "document",
              source: { type: "file", file_id: fileId },
              ...(fileName ? { title: fileName } : {}),
            },
            {
              type: "text",
              text: "Extract and return ONLY the clean text from this document. Preserve paragraph breaks with double newlines. Remove page numbers, headers, footers, and non-content elements. Return nothing but the text.",
            },
          ],
        },
      ],
    },
    { headers: { "anthropic-beta": FILES_API_BETA } }
  );

  return (message.content as Anthropic.TextBlock[])
    .filter((b: Anthropic.TextBlock) => b.type === "text")
    .map((b: Anthropic.TextBlock) => b.text)
    .join("")
    .trim();
}

/**
 * Upload all binary context items (PDFs, images) to the Files API once.
 * For PDFs, also extracts text so text-only models (Grok) can see content.
 * Clears base64 data after upload to free memory.
 * Items that fail to upload keep their base64 data as fallback.
 */
export async function uploadContextFiles(
  context: GenerationContext
): Promise<GenerationContext> {
  const items = await Promise.all(
    context.items.map(async (item): Promise<ContextItem> => {
      if (!item.data || !item.mediaType) return item;
      // Already uploaded
      if (item.fileId) return item;

      try {
        const buf = Buffer.from(item.data, "base64");
        const name = item.fileName || `file.${item.mediaType.split("/")[1] || "bin"}`;
        const fileId = await uploadFile(buf, name, item.mediaType);

        // For PDFs, extract text so Grok can see content during planning/drafting
        let extractedText: string | undefined;
        if (item.mediaType === "application/pdf") {
          try {
            extractedText = await extractPdfText(fileId, name);
          } catch (err) {
            console.warn(`[uploadContextFiles] PDF text extraction failed for ${name}:`, err);
          }
        }

        // Clear base64 data to free memory; keep fileId for all subsequent calls
        return { ...item, fileId, data: undefined, ...(extractedText ? { extractedText } : {}) };
      } catch (err) {
        console.error(`[uploadContextFiles] Failed to upload ${item.fileName ?? "file"}:`, err);
        // Upload failed — keep base64 data as fallback
        return item;
      }
    })
  );
  return { items };
}

/**
 * Delete uploaded files from the Files API.
 * Called at the end of a pipeline run to clean up.
 */
export async function deleteUploadedFiles(context: GenerationContext): Promise<void> {
  for (const item of context.items) {
    if (!item.fileId) continue;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (getAnthropic().beta as any).files.delete(item.fileId);
    } catch {
      // Best-effort cleanup
    }
  }
}

// ── Input sanitization ──────────────────────────────────────────────────────

/**
 * Sanitize user-provided text before embedding it in prompts.
 * Strips characters / sequences that could be used for prompt injection
 * while preserving legitimate content.
 */
function sanitizeUserInput(text: string): string {
  return text
    // Strip XML-like tags that could mimic system/assistant role markers
    .replace(/<\/?(?:system|assistant|human|user|instructions?|prompt|tool_use|tool_result|function_call|antml:)[^>]*>/gi, "")
    // Strip markdown-style system directives
    .replace(/^#{1,6}\s*(?:SYSTEM|INSTRUCTIONS?|OVERRIDE|IGNORE)\b.*$/gim, "")
    .trim();
}

// ── Context size limits ──────────────────────────────────────────────────────
// Generous limits — the whole point of Opus is handling lots of good context.
// These exist to prevent truly pathological inputs from blowing the context window.

/** Max characters per individual text context item (~50k words ≈ ~65k tokens) */
const MAX_ITEM_CHARS = 200_000;
/** Max total characters across all text context items (~150k words ≈ ~200k tokens) */
const MAX_TOTAL_CONTEXT_CHARS = 600_000;

function truncateIfNeeded(text: string, maxChars: number, label: string): string {
  if (text.length <= maxChars) return text;
  console.warn(`[context] Truncating ${label} from ${text.length} to ${maxChars} chars`);
  return text.slice(0, maxChars) + `\n\n[… truncated — original was ${text.length} characters]`;
}

// ── Context helpers ──────────────────────────────────────────────────────────

// Builds the text portion of the context block.
// Binary items (images/PDFs) are referenced by name only;
// their actual content goes in separate message content blocks.
function buildContextBlock(context: GenerationContext): string {
  if (!context?.items?.length) return "";

  const parts = context.items.map((item, i) => {
    const tag = item.tag.toUpperCase();
    const lines: string[] = [];

    if (item.url) {
      lines.push(`--- Context ${i + 1}: [${tag}] ${item.url} ---`);
      if (item.fetchedText) {
        lines.push(truncateIfNeeded(item.fetchedText.trim(), MAX_ITEM_CHARS, `URL context ${i + 1}`));
      } else if (item.text?.trim()) {
        // URL fetch failed but user provided fallback text — use it
        lines.push(truncateIfNeeded(item.text.trim(), MAX_ITEM_CHARS, `URL fallback ${i + 1}`));
      } else {
        lines.push("(Content at this URL could not be retrieved.)");
      }
    } else if (item.fileId || (item.data && item.mediaType)) {
      // Binary file — content delivered as a separate message block (via file_id or base64)
      const kind = item.mediaType === "application/pdf"
        ? "PDF document"
        : item.mediaType?.startsWith("image/") ? "Image" : "File";
      lines.push(`--- Context ${i + 1}: [${tag}] ${kind}${item.fileName ? ` — ${item.fileName}` : ""} (attached below) ---`);
      // Include extracted text inline so text-only models (Grok) can see PDF content
      if (item.extractedText?.trim()) {
        lines.push(truncateIfNeeded(item.extractedText.trim(), MAX_ITEM_CHARS, `extracted ${item.fileName ?? "file"}`));
      }
    } else if (item.fileName && item.text !== undefined) {
      // Text-based file
      lines.push(`--- Context ${i + 1}: [${tag}] ${item.fileName}${item.isCSV ? " (CSV data)" : ""} ---`);
      lines.push(`\`\`\`\n${truncateIfNeeded(sanitizeUserInput(item.text), MAX_ITEM_CHARS, `file ${item.fileName}`)}\n\`\`\``);
      if (item.includePlaceholders) {
        lines.push(
          `_Where this data would benefit from visualization, insert [CHART: description], [TABLE: description], or [FIGURE: description] placeholder markers._`
        );
      }
    } else if (item.text) {
      lines.push(`--- Context ${i + 1}: [${tag}] Note ---`);
      lines.push(truncateIfNeeded(sanitizeUserInput(item.text.trim()), MAX_ITEM_CHARS, `note ${i + 1}`));
      if (item.includePlaceholders) {
        lines.push(
          `_Where this content would benefit from visualization, insert [CHART: description], [TABLE: description], or [FIGURE: description] placeholder markers._`
        );
      }
    }

    if (item.instructions?.trim()) {
      lines.push(`→ How to use this: ${sanitizeUserInput(item.instructions.trim())}`);
    } else if (item.tag === "reference") {
      lines.push(`→ Cite this source in your writing where you draw from it.`);
    }

    return lines.join("\n");
  });

  const assembled = parts.join("\n\n");
  const result = truncateIfNeeded(assembled, MAX_TOTAL_CONTEXT_CHARS, "total context block");
  return `\n**Supporting Context:**\n${result}\n`;
}

// Determines which beta headers are needed for a set of binary blocks.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getBetaHeaders(binaryBlocks: any[]): Record<string, string> {
  const betas: string[] = [];
  const hasFileRefs = binaryBlocks.some((b) => b.source?.type === "file");
  const hasBase64PDFs = binaryBlocks.some(
    (b) => b.type === "document" && b.source?.type === "base64"
  );
  if (hasFileRefs) betas.push(FILES_API_BETA);
  if (hasBase64PDFs) betas.push("pdfs-2024-09-25");
  if (betas.length === 0) return {};
  return { "anthropic-beta": betas.join(",") };
}

// Returns Anthropic content blocks for binary context items (images + PDFs).
// Prefers file_id references (Files API) over base64 inline data.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isSupportedBinaryType(mediaType: string): boolean {
  return mediaType.startsWith("image/") || mediaType === "application/pdf";
}

function buildBinaryBlocks(context: GenerationContext): any[] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const blocks: any[] = [];
  for (const item of context.items) {
    // Prefer file_id (Files API) over base64
    if (item.fileId && item.mediaType) {
      if (item.mediaType.startsWith("image/")) {
        blocks.push({
          type: "image",
          source: { type: "file", file_id: item.fileId },
        });
      } else if (item.mediaType === "application/pdf") {
        blocks.push({
          type: "document",
          source: { type: "file", file_id: item.fileId },
          ...(item.fileName ? { title: item.fileName } : {}),
        });
      } else {
        console.warn(`[buildBinaryBlocks] Unsupported media type "${item.mediaType}" for file "${item.fileName ?? "unknown"}" — skipping binary block`);
      }
      continue;
    }
    // Fallback: base64 inline
    if (!item.data || !item.mediaType) continue;
    if (!isSupportedBinaryType(item.mediaType)) {
      console.warn(`[buildBinaryBlocks] Unsupported media type "${item.mediaType}" for file "${item.fileName ?? "unknown"}" — skipping binary block`);
      continue;
    }
    if (item.mediaType.startsWith("image/")) {
      blocks.push({
        type: "image",
        source: { type: "base64", media_type: item.mediaType, data: item.data },
      });
    } else if (item.mediaType === "application/pdf") {
      blocks.push({
        type: "document",
        source: { type: "base64", media_type: "application/pdf", data: item.data },
        ...(item.fileName ? { title: item.fileName } : {}),
      });
    }
  }
  return blocks;
}

// ── Stage budgets (scales with format complexity / output length) ─────────────

interface StageBudget { maxTokens: number; thinkingBudget: number }
interface StageBudgets {
  plan: StageBudget;
  draft: StageBudget;
  /** Lower budget for follow-up drafts (draft 2 in deep tier) — plan + direction already provided */
  draftFollowup: StageBudget;
  humanize: StageBudget;
}

const STAGE_BUDGETS: Record<string, StageBudgets> = {
  // ── Very long-form (128k draft) ───────────────────────────────────────────
  research:      { plan: { maxTokens: 32000, thinkingBudget: 16000 }, draft: { maxTokens: 128000, thinkingBudget: 64000 }, draftFollowup: { maxTokens: 128000, thinkingBudget: 32000 }, humanize: { maxTokens: 128000, thinkingBudget: 64000 } },
  whitepaper:    { plan: { maxTokens: 32000, thinkingBudget: 16000 }, draft: { maxTokens: 128000, thinkingBudget: 64000 }, draftFollowup: { maxTokens: 128000, thinkingBudget: 32000 }, humanize: { maxTokens: 128000, thinkingBudget: 64000 } },
  business_plan: { plan: { maxTokens: 32000, thinkingBudget: 16000 }, draft: { maxTokens: 128000, thinkingBudget: 64000 }, draftFollowup: { maxTokens: 128000, thinkingBudget: 32000 }, humanize: { maxTokens: 128000, thinkingBudget: 64000 } },
  handbook:      { plan: { maxTokens: 32000, thinkingBudget: 16000 }, draft: { maxTokens: 128000, thinkingBudget: 64000 }, draftFollowup: { maxTokens: 128000, thinkingBudget: 32000 }, humanize: { maxTokens: 128000, thinkingBudget: 64000 } },
  technical:     { plan: { maxTokens: 32000, thinkingBudget: 16000 }, draft: { maxTokens: 128000, thinkingBudget: 48000 }, draftFollowup: { maxTokens: 128000, thinkingBudget: 24000 }, humanize: { maxTokens: 100000, thinkingBudget: 48000 } },
  course:        { plan: { maxTokens: 32000, thinkingBudget: 16000 }, draft: { maxTokens: 128000, thinkingBudget: 48000 }, draftFollowup: { maxTokens: 128000, thinkingBudget: 24000 }, humanize: { maxTokens: 100000, thinkingBudget: 48000 } },
  // ── Standard long-form (64k–80k draft) ────────────────────────────────────
  case_study:    { plan: { maxTokens: 16000, thinkingBudget: 10000 }, draft: { maxTokens: 80000,  thinkingBudget: 32000 }, draftFollowup: { maxTokens: 80000,  thinkingBudget: 16000 }, humanize: { maxTokens: 64000,  thinkingBudget: 32000 } },
  report:        { plan: { maxTokens: 16000, thinkingBudget: 10000 }, draft: { maxTokens: 80000,  thinkingBudget: 32000 }, draftFollowup: { maxTokens: 80000,  thinkingBudget: 16000 }, humanize: { maxTokens: 64000,  thinkingBudget: 32000 } },
  rfp:           { plan: { maxTokens: 16000, thinkingBudget: 10000 }, draft: { maxTokens: 64000,  thinkingBudget: 32000 }, draftFollowup: { maxTokens: 64000,  thinkingBudget: 16000 }, humanize: { maxTokens: 48000,  thinkingBudget: 32000 } },
  scope_of_work: { plan: { maxTokens: 16000, thinkingBudget: 10000 }, draft: { maxTokens: 64000,  thinkingBudget: 32000 }, draftFollowup: { maxTokens: 64000,  thinkingBudget: 16000 }, humanize: { maxTokens: 48000,  thinkingBudget: 32000 } },
  guide:         { plan: { maxTokens: 16000, thinkingBudget: 10000 }, draft: { maxTokens: 64000,  thinkingBudget: 32000 }, draftFollowup: { maxTokens: 64000,  thinkingBudget: 16000 }, humanize: { maxTokens: 48000,  thinkingBudget: 32000 } },
  essay:         { plan: { maxTokens: 16000, thinkingBudget: 10000 }, draft: { maxTokens: 64000,  thinkingBudget: 32000 }, draftFollowup: { maxTokens: 64000,  thinkingBudget: 16000 }, humanize: { maxTokens: 64000,  thinkingBudget: 32000 } },
  proposal:      { plan: { maxTokens: 16000, thinkingBudget: 10000 }, draft: { maxTokens: 64000,  thinkingBudget: 32000 }, draftFollowup: { maxTokens: 64000,  thinkingBudget: 16000 }, humanize: { maxTokens: 48000,  thinkingBudget: 32000 } },
  speech:        { plan: { maxTokens: 16000, thinkingBudget: 10000 }, draft: { maxTokens: 48000,  thinkingBudget: 24000 }, draftFollowup: { maxTokens: 48000,  thinkingBudget: 12000 }, humanize: { maxTokens: 48000,  thinkingBudget: 24000 } },
  script:        { plan: { maxTokens: 16000, thinkingBudget: 10000 }, draft: { maxTokens: 48000,  thinkingBudget: 24000 }, draftFollowup: { maxTokens: 48000,  thinkingBudget: 12000 }, humanize: { maxTokens: 48000,  thinkingBudget: 24000 } },
  // ── Medium (16k–32k draft) ────────────────────────────────────────────────
  blog:          { plan: { maxTokens: 16000, thinkingBudget: 10000 }, draft: { maxTokens: 32000,  thinkingBudget: 16000 }, draftFollowup: { maxTokens: 32000,  thinkingBudget: 10000 }, humanize: { maxTokens: 32000,  thinkingBudget: 24000 } },
  newsletter:    { plan: { maxTokens: 12000, thinkingBudget: 8000  }, draft: { maxTokens: 24000,  thinkingBudget: 12000 }, draftFollowup: { maxTokens: 24000,  thinkingBudget: 8000  }, humanize: { maxTokens: 24000,  thinkingBudget: 16000 } },
  press_release: { plan: { maxTokens: 12000, thinkingBudget: 8000  }, draft: { maxTokens: 16000,  thinkingBudget: 10000 }, draftFollowup: { maxTokens: 16000,  thinkingBudget: 6000  }, humanize: { maxTokens: 16000,  thinkingBudget: 12000 } },
  lesson_plan:   { plan: { maxTokens: 12000, thinkingBudget: 8000  }, draft: { maxTokens: 16000,  thinkingBudget: 10000 }, draftFollowup: { maxTokens: 16000,  thinkingBudget: 6000  }, humanize: { maxTokens: 16000,  thinkingBudget: 12000 } },
  resume:        { plan: { maxTokens: 12000, thinkingBudget: 8000  }, draft: { maxTokens: 16000,  thinkingBudget: 10000 }, draftFollowup: { maxTokens: 16000,  thinkingBudget: 6000  }, humanize: { maxTokens: 16000,  thinkingBudget: 10000 } },
  cover_letter:  { plan: { maxTokens: 10000, thinkingBudget: 6000  }, draft: { maxTokens: 12000,  thinkingBudget: 8000  }, draftFollowup: { maxTokens: 12000,  thinkingBudget: 5000  }, humanize: { maxTokens: 12000,  thinkingBudget: 10000 } },
  // ── Short (4k–8k draft) ───────────────────────────────────────────────────
  letter:          { plan: { maxTokens: 8000,  thinkingBudget: 4000  }, draft: { maxTokens: 8000,   thinkingBudget: 4000  }, draftFollowup: { maxTokens: 8000,   thinkingBudget: 3000  }, humanize: { maxTokens: 8000,   thinkingBudget: 8000  } },
  review:          { plan: { maxTokens: 8000,  thinkingBudget: 4000  }, draft: { maxTokens: 8000,   thinkingBudget: 4000  }, draftFollowup: { maxTokens: 8000,   thinkingBudget: 3000  }, humanize: { maxTokens: 8000,   thinkingBudget: 8000  } },
  email:           { plan: { maxTokens: 8000,  thinkingBudget: 4000  }, draft: { maxTokens: 8000,   thinkingBudget: 4000  }, draftFollowup: { maxTokens: 8000,   thinkingBudget: 3000  }, humanize: { maxTokens: 8000,   thinkingBudget: 8000  } },
  bio:             { plan: { maxTokens: 6000,  thinkingBudget: 4000  }, draft: { maxTokens: 4000,   thinkingBudget: 3000  }, draftFollowup: { maxTokens: 4000,   thinkingBudget: 2000  }, humanize: { maxTokens: 4000,   thinkingBudget: 8000  } },
  product_description: { plan: { maxTokens: 6000, thinkingBudget: 4000 }, draft: { maxTokens: 4000, thinkingBudget: 3000 }, draftFollowup: { maxTokens: 4000, thinkingBudget: 2000 }, humanize: { maxTokens: 4000, thinkingBudget: 8000 } },
  list:            { plan: { maxTokens: 6000,  thinkingBudget: 4000  }, draft: { maxTokens: 4000,   thinkingBudget: 3000  }, draftFollowup: { maxTokens: 4000,   thinkingBudget: 2000  }, humanize: { maxTokens: 4000,   thinkingBudget: 8000  } },
  social:          { plan: { maxTokens: 6000,  thinkingBudget: 4000  }, draft: { maxTokens: 4000,   thinkingBudget: 3000  }, draftFollowup: { maxTokens: 4000,   thinkingBudget: 2000  }, humanize: { maxTokens: 4000,   thinkingBudget: 8000  } },
  twitter_thread:  { plan: { maxTokens: 8000,  thinkingBudget: 6000  }, draft: { maxTokens: 12000,  thinkingBudget: 8000  }, draftFollowup: { maxTokens: 12000,  thinkingBudget: 5000  }, humanize: { maxTokens: 12000,  thinkingBudget: 16000 } },
  // ── Very short (3k draft) ─────────────────────────────────────────────────
  caption:         { plan: { maxTokens: 4000,  thinkingBudget: 3000  }, draft: { maxTokens: 3000,   thinkingBudget: 2000  }, draftFollowup: { maxTokens: 3000,   thinkingBudget: 1500  }, humanize: { maxTokens: 3000,   thinkingBudget: 6000  } },
  text_message:    { plan: { maxTokens: 4000,  thinkingBudget: 3000  }, draft: { maxTokens: 3000,   thinkingBudget: 2000  }, draftFollowup: { maxTokens: 3000,   thinkingBudget: 1500  }, humanize: { maxTokens: 3000,   thinkingBudget: 6000  } },
  thank_you_note:  { plan: { maxTokens: 4000,  thinkingBudget: 3000  }, draft: { maxTokens: 3000,   thinkingBudget: 2000  }, draftFollowup: { maxTokens: 3000,   thinkingBudget: 1500  }, humanize: { maxTokens: 3000,   thinkingBudget: 6000  } },
  ad_copy:         { plan: { maxTokens: 4000,  thinkingBudget: 3000  }, draft: { maxTokens: 3000,   thinkingBudget: 2000  }, draftFollowup: { maxTokens: 3000,   thinkingBudget: 1500  }, humanize: { maxTokens: 3000,   thinkingBudget: 6000  } },
  ai_prompt:       { plan: { maxTokens: 4000,  thinkingBudget: 3000  }, draft: { maxTokens: 3000,   thinkingBudget: 2000  }, draftFollowup: { maxTokens: 3000,   thinkingBudget: 1500  }, humanize: { maxTokens: 3000,   thinkingBudget: 6000  } },
  notes:           { plan: { maxTokens: 4000,  thinkingBudget: 3000  }, draft: { maxTokens: 3000,   thinkingBudget: 2000  }, draftFollowup: { maxTokens: 3000,   thinkingBudget: 1500  }, humanize: { maxTokens: 3000,   thinkingBudget: 6000  } },
};

const DEFAULT_BUDGETS: StageBudgets = {
  plan:          { maxTokens: 16000, thinkingBudget: 10000 },
  draft:         { maxTokens: 48000, thinkingBudget: 24000 },
  draftFollowup: { maxTokens: 48000, thinkingBudget: 12000 },
  humanize:      { maxTokens: 48000, thinkingBudget: 32000 },
};

export function getStageBudgets(contentType: string): StageBudgets {
  return STAGE_BUDGETS[contentType] ?? DEFAULT_BUDGETS;
}

// ── Pipeline tier sets ───────────────────────────────────────────────────────

/** Content types that use the lightweight pipeline (Gemini for planning).
 *  Only truly short-form or functional content where voice matching is secondary.
 *  Voice-critical short types (bio, review, thank_you_note, letter) stay in full pipeline. */
export const LIGHT_TYPES = new Set([
  "caption", "text_message", "social",
  "ai_prompt", "notes", "list", "ad_copy",
]);

// ── Enriched voice block (replaces raw samples in all downstream agents) ─────

/**
 * Build the enriched voice profile block for system prompts.
 * Uses structured voice analysis fields instead of raw writing samples
 * to prevent content contamination (the AI copying sample content into
 * unrelated articles instead of just absorbing the style).
 */
function buildEnrichedVoiceBlock(voiceProfile: VoiceAnalysis): string {
  const sections: string[] = [];

  if (voiceProfile.humanImperfections) {
    sections.push(`**Human Imperfections (PRESERVE these — they are the voice, not bugs to fix):**\n${voiceProfile.humanImperfections}`);
  }
  if (voiceProfile.authenticQuirks) {
    sections.push(`**Authentic Quirks (what makes this author unmistakably THEM):**\n${voiceProfile.authenticQuirks}`);
  }
  if (voiceProfile.emotionalPatterns) {
    sections.push(`**Emotional Patterns:**\n${voiceProfile.emotionalPatterns}`);
  }
  if (voiceProfile.transitionStyle) {
    sections.push(`**Transition Style:**\n${voiceProfile.transitionStyle}`);
  }

  return sections.length > 0 ? `\n${sections.join("\n\n")}\n` : "";
}

// ── Research ─────────────────────────────────────────────────────────────────

/**
 * Conduct web research on a topic using Claude's built-in web_search tool.
 * Returns a structured markdown research brief for use as context in generation.
 */
export async function conductResearch(
  prompt: string,
  interviewContext?: { topic?: string; angle?: string; contentType?: string }
): Promise<string> {
  const typeLabelHint = interviewContext?.contentType
    ? (CONTENT_TYPE_LABELS[interviewContext.contentType] ?? interviewContext.contentType)
    : "piece";
  const contextHint = interviewContext?.topic
    ? ` Context: writing a ${typeLabelHint} about "${interviewContext.topic}"${interviewContext.angle ? ` (angle: ${interviewContext.angle})` : ""}.`
    : "";

  const systemInstruction = `You are a research assistant preparing a structured brief for a ghostwriter.${contextHint}

Search for relevant, current information. After researching, produce a well-structured markdown brief covering:
- Key facts, figures, and data points with sources
- Relevant statistics or recent studies
- Important context, background, or history
- Notable arguments, perspectives, or counterarguments
- Specific examples or case studies where relevant
- Recent developments the writer should know

Be specific and factual. Reference sources inline (e.g. "According to [Source], ..."). Format clearly with headers and bullets. The ghostwriter will use this directly as context.`;

  // Gemini Flash with Google Search grounding — single call, no tool loop needed
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result: any = await withRetry(() => getGemini().models.generateContent({
    model: GEMINI_FAST_MODEL,
    contents: prompt,
    config: {
      systemInstruction,
      tools: [{ googleSearch: {} }],
      maxOutputTokens: 8000,
    },
  }), "conductResearch");

  return result.text || "Research could not be completed.";
}

// ── Sub-voice helper ─────────────────────────────────────────────────────────

/**
 * Build a prompt block containing the per-format sub-voice profile for the current content type.
 */
function buildSubVoiceBlock(voiceProfile: VoiceAnalysis, contentType: string): string {
  const subVoice = voiceProfile.subVoices?.[contentType];
  if (!subVoice) return "";
  const lines = [
    `Summary: ${subVoice.summary}`,
    `Tone shift: ${subVoice.toneShift}`,
    `Structural patterns: ${subVoice.structuralPatterns}`,
    `Vocabulary notes: ${subVoice.vocabularyNotes}`,
    subVoice.keyGuidelines.length > 0
      ? `Key guidelines:\n${subVoice.keyGuidelines.map(g => `- ${g}`).join("\n")}`
      : "",
  ].filter(Boolean);
  return `\n**Format-specific voice profile for ${CONTENT_TYPE_LABELS[contentType] ?? contentType}:**\n${lines.join("\n")}\n`;
}

// ── Multi-stage pipeline ─────────────────────────────────────────────────────

/** Resolves the human-readable content type label.
 *  Custom types carry their name in interview.contentTypeLabel; system types
 *  look up CONTENT_TYPE_LABELS. Falls back to the raw contentType string. */
function resolveTypeLabel(interview: InterviewAnswers): string {
  return CONTENT_TYPE_LABELS[interview.contentType]
    ?? interview.contentTypeLabel
    ?? interview.contentType;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractText(content: any[]): string {
  return content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
}

/**
 * Stage 1 — Plan
 * Thinks deeply about structure, arc, and voice before a word is written.
 */
export async function planContent(
  voiceProfile: VoiceAnalysis,
  interview: InterviewAnswers,
  context?: GenerationContext,
  favoriteWords?: { word: string; definition: string }[],
  authorContext?: string
): Promise<string> {
  const contextBlock = context ? buildContextBlock(context) : "";
  const binaryBlocks = context ? buildBinaryBlocks(context) : [];
  const betaHeaders = getBetaHeaders(binaryBlocks);

  const guidelines = voiceProfile.contentGuidelines?.[interview.contentType];
  const guidelinesBlock = guidelines?.length
    ? `\n**Format-specific guidelines for ${resolveTypeLabel(interview)}:**\n${guidelines.map((g) => `- ${g}`).join("\n")}\n`
    : "";

  const categoryInsight = voiceProfile.categoryInsights?.[interview.contentType];
  const categoryInsightBlock = categoryInsight
    ? `\n**How this author's voice shows up in ${resolveTypeLabel(interview)}:** ${categoryInsight}\n`
    : "";

  const subVoiceBlock = buildSubVoiceBlock(voiceProfile, interview.contentType);

  const enrichedVoiceBlock = buildEnrichedVoiceBlock(voiceProfile);

  const favoriteWordsBlock = favoriteWords?.length
    ? `\n**Author's Favorite Words (use only when they fit naturally — never force them):**\n${
        favoriteWords.map((fw) => `- **${fw.word}**${fw.definition ? `: ${fw.definition}` : ""}`).join("\n")
      }\n`
    : "";

  const authorContextBlock = authorContext?.trim()
    ? `\n**Author Background (use as subtle context — don't reference directly):**\n${authorContext.trim()}\n`
    : "";

  // Build system prompt with cache_control on the stable voice + samples block
  // so the API can reuse KV cache when subsequent pipeline calls share this prefix
  const voicePlanBlock = `You are ghost-writing a ${resolveTypeLabel(interview)}. The piece must be indistinguishable from this author's own work. Study the voice profile below until you can hear them in your head. Every structural decision in your plan must serve this specific author's voice.

CRITICAL — VOICE HIERARCHY: The author's OVERALL voice (summary, tone, sentence structure, vocabulary, rhetorical devices, imperfections, quirks) is your PRIMARY guide. It overrides everything else. Format-specific hints below are secondary — use them only when they don't conflict with the author's core voice. If a format guideline would make the piece sound less like this author, ignore it. The goal is this author's voice in this format, not a generic version of this format.

CRITICAL — PLAN FOR IMPERFECTION: If this author's voice profile shows raw, casual, or grammatically loose writing, plan for that. Do not plan a polished, structured piece for an author who writes in fragments and stream-of-consciousness. The plan should reflect how THIS author would actually structure their thinking, not how a writing textbook would. Their imperfections and quirks are part of the plan.

**Author voice summary (THIS IS YOUR NORTH STAR):** ${voiceProfile.rawSummary}
${enrichedVoiceBlock}${authorContextBlock}${subVoiceBlock}
${categoryInsightBlock || guidelinesBlock ? `**Secondary format hints (use lightly — never let these override the author's core voice):**${categoryInsightBlock}${guidelinesBlock}` : ""}${favoriteWordsBlock}`;

  const userPrompt = `Produce the structural plan. Do not write the piece — plan only.

**Brief:**
- Topic: ${sanitizeUserInput(interview.topic)}
- Angle / argument: ${sanitizeUserInput(interview.angle)}
- Key points to cover: ${sanitizeUserInput(interview.keyPoints)}
- Audience: ${interview.targetAudience ? sanitizeUserInput(interview.targetAudience) : "the author's usual audience"}
- Tone notes: ${interview.toneNotes ? sanitizeUserInput(interview.toneNotes) : "none"}${interview.wordCountTarget ? `\n- Target length: ${sanitizeUserInput(interview.wordCountTarget)}` : ""}
${contextBlock}
**Every plan must include:**
- The exact opening move. Not "an engaging hook" — the specific hook. What sentence or image does the reader see first?
- How the argument builds and where the emotional beats land
- Section-by-section breakdown with the purpose of each beat
- How each piece of context gets woven in naturally (if any provided)
- The closing move and what the reader leaves with
- Structural choices that specifically play to this author's voice and the format guidelines above

**What you know vs. what you don't — think critically:**
- Look at the supporting context above. That is what you have to work with. Plan around what is there.
- If no context was provided, the piece must stand on the author's voice, argument, and perspective alone. That is not a limitation — opinion pieces, personal narratives, and persuasion essays are strongest without manufactured data.
- If the topic naturally calls for specific data (statistics, study results, technical claims, current events) and the context provides it, weave it in structurally. If the context does NOT provide it, do not plan as if it exists. Structure the piece to work without it, or use placeholder framing ("reference your results," "cite the specific figure") that the author can fill in.
- Never plan around invented facts, fabricated statistics, or made-up sources. If the plan requires a specific number to land and no number was provided, flag it as a gap the author should fill — do not silently invent one.

Do not plan a generic article. Plan THIS author's article. If the plan could belong to any writer, it is wrong.`;

  const { plan: planBudget } = getStageBudgets(interview.contentType);
  const isLight = LIGHT_TYPES.has(interview.contentType);

  if (isLight) {
    // Light tier: Gemini Flash — no reasoning overhead for 1-4 sentence pieces
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: any = await withRetry(() => getGemini().models.generateContent({
      model: GEMINI_FAST_MODEL,
      contents: userPrompt,
      config: {
        systemInstruction: voicePlanBlock,
        maxOutputTokens: planBudget.maxTokens,
      },
    }), "planContent/light");
    return result.text ?? "";
  }

  // Standard / deep tier: Opus — extended thinking for deep structural planning
  const planBinaryBlocks = context ? buildBinaryBlocks(context) : [];
  const planBetaHeaders = getBetaHeaders(planBinaryBlocks);

  const planMessageContent =
    planBinaryBlocks.length > 0
      ? [{ type: "text", text: userPrompt }, ...planBinaryBlocks]
      : userPrompt;

  const planReqOptions = Object.keys(planBetaHeaders).length > 0
    ? { headers: planBetaHeaders }
    : {};

  const thinkingBudget = Math.min(planBudget.thinkingBudget, planBudget.maxTokens - 1);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const res: any = await withRetry(() => (getAnthropic().messages.create as any)(
    {
      model: "claude-opus-4-6",
      max_tokens: planBudget.maxTokens,
      thinking: { type: "enabled", budget_tokens: thinkingBudget },
      system: [{ type: "text", text: voicePlanBlock, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: planMessageContent }],
    },
    planReqOptions
  ), "planContent/opus");

  return extractText(res.content) || "";
}

/**
 * Stage 2 — Draft (Writer Agent — Opus)
 * Writes the raw first draft against the plan with full voice fidelity.
 * Uses the enriched voice profile exclusively — no raw writing samples
 * to prevent content contamination.
 *
 * @param isFollowup — If true, uses reduced thinking budget. Used for
 *   draft 2 in deep tier where the plan already provided structure.
 */
export async function draftContent(
  voiceProfile: VoiceAnalysis,
  interview: InterviewAnswers,
  plan: string,
  context?: GenerationContext,
  favoriteWords?: { word: string; definition: string }[],
  authorContext?: string,
  isFollowup?: boolean
): Promise<string> {
  const contextBlock = context ? buildContextBlock(context) : "";
  const binaryBlocks = context ? buildBinaryBlocks(context) : [];
  const betaHeaders = getBetaHeaders(binaryBlocks);

  const guidelines = voiceProfile.contentGuidelines?.[interview.contentType];
  const guidelinesBlock = guidelines?.length
    ? `\n## Format-Specific Guidelines (${resolveTypeLabel(interview)})\n${guidelines.map((g) => `- ${g}`).join("\n")}\n`
    : "";

  const categoryInsight = voiceProfile.categoryInsights?.[interview.contentType];
  const categoryInsightBlock = categoryInsight
    ? `\n## How This Author Writes ${resolveTypeLabel(interview)}\n${categoryInsight}\n`
    : "";

  const subVoiceBlock = buildSubVoiceBlock(voiceProfile, interview.contentType);

  const enrichedVoiceBlock = buildEnrichedVoiceBlock(voiceProfile);

  const wordCountLine = interview.wordCountTarget
    ? `Target length: ${interview.wordCountTarget}. `
    : "";

  // Build system prompt as structured blocks for prompt caching.
  // The voice profile block (stable across calls) gets cache_control so the API
  // can reuse the KV cache from previous pipeline stages.
  const voiceBlock = `You are ghost-writing a ${resolveTypeLabel(interview)}. The output must be indistinguishable from this author's own work. Not "inspired by" their voice. Not "in the style of." Identical. If a reader who knows this author's writing can tell an AI wrote it, you have failed.

Read the voice profile below. Internalize the rhythm, the word choices, the sentence lengths, the way they open paragraphs, the way they close them. Then write as them.

CRITICAL — VOICE HIERARCHY: The author's overall voice profile below is your PRIMARY guide. It defines how this person writes across ALL formats. The format-specific hints at the bottom are secondary — light suggestions, not mandates. If following a format guideline would make the piece sound less like this specific author, ignore the guideline. Your job is to sound like THIS PERSON, not to produce a textbook example of this format.

CRITICAL — IMPERFECT IS AUTHENTIC: Do NOT write with perfect grammar, flawless sentence structure, or textbook-correct prose unless the voice profile says this author writes that way. Real humans write with sentence fragments, start sentences with "And" or "But", use run-ons, skip transitions, leave thoughts slightly unfinished, and break grammar rules for rhythm and emphasis. The "Human Imperfections" and "Authentic Quirks" sections below describe exactly how THIS author breaks rules — replicate those patterns. Perfect prose is one of the most obvious AI tells. Match the author's actual level of polish, not an idealized version of it.

## Author Voice Profile (PRIMARY — this defines the voice)

**Tone:** ${voiceProfile.tone}
**Sentence Structure:** ${voiceProfile.sentenceStructure}
**Vocabulary Style:** ${voiceProfile.vocabularyStyle}
**Punctuation Habits:** ${voiceProfile.punctuationHabits}
**Paragraph Style:** ${voiceProfile.paragraphStyle}
**Rhetorical Devices:** ${voiceProfile.rhetoricalDevices}
**Recurring Patterns:**
${voiceProfile.commonPatterns.map((p) => `- ${p}`).join("\n")}
**Things to Avoid (if ANY of these appear in your output, you have failed):**
${voiceProfile.thingsToAvoid.map((p) => `- ${p}`).join("\n")}
${enrichedVoiceBlock}${subVoiceBlock}
${categoryInsightBlock || guidelinesBlock ? `## Secondary Format Hints (use lightly — the voice profile above always wins)\n${categoryInsightBlock}${guidelinesBlock}` : ""}`;

  const rulesBlock = `## Forbidden — zero tolerance. Any of these in the output is an automatic failure.
- Opener clichés: "In today's fast-paced world", "In the digital age", "It goes without saying", "In an era where"
- AI filler verbs: "delve into", "underscore", "leverage" (as metaphor), "utilize", "facilitate", "navigate" (as metaphor), "foster"
- Hollow hedge phrases: "It's worth noting that", "It's important to note", "It's crucial to understand", "Needless to say", "One might argue"
- Transition clichés as paragraph openers: "Furthermore,", "Moreover,", "Additionally,", "In addition,"
- Closing tells: "In conclusion,", "To summarize,", "To wrap up,", "As we've seen,"
- Performative mirroring: restating the intro as if it's a fresh insight in the final paragraph
- Qualification stacking: "However, it's worth considering that, while generally speaking, one could argue…"
- Hollow superlatives: "It is undeniable that", "There is no doubt that", "It is clear that", "Evidently,"
- Over-structured output: bolding every paragraph header when flowing prose is more natural for this format
- Em dash overuse: more than 1-2 em dashes in the entire piece is too many
- Rule of three: do not group ideas into threes ("X, Y, and Z") unless the author demonstrably does this
- Synonym cycling: do not use four different words for the same concept across consecutive sentences
- Over-polished prose: if this author writes casually, with fragments, loose grammar, or raw energy, do NOT clean it up into textbook English. Perfect grammar is an AI tell. Match the author's actual level of polish.

## Factual Integrity — this overrides everything above
You are writing under a real person's name. Think about what you actually know vs. what you're guessing.
- If supporting context provides facts, data, or research — use it. That is your factual foundation.
- If no context was provided, the piece must stand on argument, perspective, and voice. Opinion, narrative, and persuasion do not need invented statistics to be strong. Write with conviction, not with fabricated evidence.
- Do NOT invent specific numbers, percentages, statistics, study results, dates, named sources, or technical claims. If the piece needs a specific figure and none was provided, use honest placeholder language the author can complete: "your recent results showed," "the data from your last review," "[specific figure]."
- If you are unsure whether something is a real fact or something you're generating to sound authoritative — it is the latter. Leave it out or flag it as a placeholder.
- This applies to ALL content. A fabricated statistic in a blog is just as wrong as a fabricated lab result in an email. The standard is the same regardless of format.

## Author's Favorite Words
${favoriteWords?.length
  ? `Use these words only when they fit naturally. Never repeat more than once per piece. Never force them in.\n${favoriteWords.map((fw) => `- **${fw.word}**${fw.definition ? `: ${fw.definition}` : ""}`).join("\n")}`
  : "None specified."}
${authorContext?.trim() ? `\n## Author Background (absorb this — never reference it directly)\n${authorContext.trim()}\n` : ""}
## Output
- The piece. Nothing else. No preamble. No meta-commentary. No "Here's the piece:" or "I hope this captures..."
- ${wordCountLine}${WORD_GUIDANCE[interview.contentType] ?? `This is a custom format ("${resolveTypeLabel(interview)}"). Use the provided writing examples as your primary guide for length, structure, and conventions. If no examples are available, write a well-structured piece that feels natural for this format.`}`;

  const systemText = `${voiceBlock}\n\n${rulesBlock}`;

  const userPrompt = `Execute this structural plan:

${plan}

**Brief:**
- Topic: ${sanitizeUserInput(interview.topic)}
- Angle: ${sanitizeUserInput(interview.angle)}
- Key points: ${sanitizeUserInput(interview.keyPoints)}
${contextBlock}
Write the piece. Match the author's voice exactly. Every sentence must sound like them, not like you.`;

  // Opus: core writing engine — extended thinking for voice-faithful drafting
  const draftBinaryBlocks = context ? buildBinaryBlocks(context) : [];
  const draftBetaHeaders = getBetaHeaders(draftBinaryBlocks);

  const draftMessageContent =
    draftBinaryBlocks.length > 0
      ? [{ type: "text", text: userPrompt }, ...draftBinaryBlocks]
      : userPrompt;

  const draftReqOptions = Object.keys(draftBetaHeaders).length > 0
    ? { headers: draftBetaHeaders }
    : {};

  const budgets = getStageBudgets(interview.contentType);
  const draftBudget = isFollowup ? budgets.draftFollowup : budgets.draft;
  const draftThinkingBudget = Math.min(draftBudget.thinkingBudget, draftBudget.maxTokens - 1);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const res: any = await withRetry(() => (getAnthropic().messages.create as any)(
    {
      model: "claude-opus-4-6",
      max_tokens: draftBudget.maxTokens,
      thinking: { type: "enabled", budget_tokens: draftThinkingBudget },
      system: [{ type: "text", text: systemText, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: draftMessageContent }],
    },
    draftReqOptions
  ), "draftContent/opus");

  return extractText(res.content) || "";
}

/**
 * Stage 2b — Compare and select the best of multiple drafts
 * Analyzes each draft against the voice profile and brief, then outputs the
 * best single piece (selected or synthesized from the strongest elements).
 * Uses Opus with extended thinking — this is a voice-fidelity judgment that
 * directly determines what gets humanized. Gemini Flash was too shallow here;
 * it couldn't reliably distinguish voice authenticity between two drafts.
 */
export async function compareAndSelectBestDraft(
  drafts: string[],
  voiceProfile: VoiceAnalysis,
  interview: InterviewAnswers
): Promise<string> {
  const { draft: draftBudget } = getStageBudgets(interview.contentType);

  const systemPrompt = `You are evaluating drafts written by a ghostwriter attempting to mimic a specific author's voice. Your job is to select the best draft — or synthesize the best elements — so the result is indistinguishable from the author's actual writing.

## Author Voice Profile
${voiceProfile.rawSummary}
- Tone: ${voiceProfile.tone}
- Sentence structure: ${voiceProfile.sentenceStructure}
- Vocabulary: ${voiceProfile.vocabularyStyle}
- Punctuation habits: ${voiceProfile.punctuationHabits}
- Rhetorical devices: ${voiceProfile.rhetoricalDevices}
- Things this author NEVER does: ${voiceProfile.thingsToAvoid.join("; ")}`;

  const userPrompt = `Select the best of these ${drafts.length} drafts. The winner must sound like this specific author wrote it — not like AI. If neither draft meets that standard, take the best elements and make it meet the standard.

**Brief:**
- Topic: ${interview.topic}
- Angle: ${interview.angle}
- Key points: ${interview.keyPoints}
- Audience: ${interview.targetAudience || "the author's usual audience"}

**The Drafts:**
${drafts.map((d, i) => `--- DRAFT ${i + 1} ---\n${d}`).join("\n\n")}

Evaluate each draft on:
1. Voice authenticity — does it sound like this author or like AI? Be ruthless.
2. Brief fidelity — does it cover the topic, angle, and key points?
3. AI contamination — flag every instance: opener clichés, filler verbs ("delve", "underscore", "leverage", "utilize", "foster"), hollow hedges ("It's worth noting", "One might argue"), transition clichés ("Furthermore,", "Moreover,", "Additionally,"), closing tells ("In conclusion,"), em dash overuse, rule-of-three groupings, synonym cycling, paragraphs that restate the opening.

Produce the final version. If it contains any AI patterns, remove them before outputting. The output must be publishable under this person's name without suspicion.

Output ONLY the final piece. Nothing else.`;

  // Opus with extended thinking: this is a voice-fidelity judgment that
  // determines what goes into the humanizer. Worth the quality investment.
  const thinkingBudget = Math.min(Math.ceil(draftBudget.thinkingBudget / 2), 32000, draftBudget.maxTokens - 1);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const res: any = await withRetry(() => (getAnthropic().messages.create as any)({
    model: "claude-opus-4-6",
    max_tokens: draftBudget.maxTokens,
    thinking: { type: "enabled", budget_tokens: thinkingBudget },
    system: [{ type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: userPrompt }],
  }), "compareAndSelectBestDraft");

  return extractText(res.content) || "";
}

/**
 * Stage 2a — Propose a draft variation (deep tier only)
 * Reads the first draft and the author's voice profile, then proposes
 * 1 alternative creative direction this specific author might take
 * when writing the same piece. Returns a toneNotes string for draft 2.
 */
export async function proposeDraftVariation(
  draft: string,
  voiceProfile: VoiceAnalysis,
  interview: InterviewAnswers,
  plan: string
): Promise<{ direction: string }> {
  const userPrompt = `Propose one alternative creative direction for this ${resolveTypeLabel(interview)}. The direction must be rooted in how this specific author writes — not generic advice.

**Author Voice Profile:**
${voiceProfile.rawSummary}
- Tone: ${voiceProfile.tone}
- Sentence structure: ${voiceProfile.sentenceStructure}
- Vocabulary: ${voiceProfile.vocabularyStyle}
- Rhetorical devices: ${voiceProfile.rhetoricalDevices}
- Recurring patterns: ${voiceProfile.commonPatterns.join("; ")}

**Brief:**
- Topic: ${interview.topic}
- Angle: ${interview.angle}
- Key points: ${interview.keyPoints}
- Audience: ${interview.targetAudience || "the author's usual audience"}

**Plan:**
${plan}

**First Draft:**
${draft}

Based on this author's actual writing tendencies, propose a different structural or creative approach they would realistically take. Different opening strategy, different rhetorical lean, different emotional register, story-first vs argument-first — whatever fits their range.

Return ONLY valid JSON (no markdown, no prose, no code fences):
{
  "direction": "1-2 sentence instruction to a ghostwriter. Must be specific to this piece and this author."
}`;

  // Gemini Flash: proposing a creative direction, not generating prose
  const result = await getGemini().models.generateContent({
    model: GEMINI_FAST_MODEL,
    contents: userPrompt,
    config: { maxOutputTokens: 1024 },
  });

  const text = result.text ?? "";
  try {
    return JSON.parse(repairJson(text));
  } catch {
    // Fallback uses the author's actual rhetorical devices instead of a
    // generic direction that any writer could follow
    const fallback = voiceProfile.rhetoricalDevices
      ? `Lean harder into this author's rhetorical strengths: ${voiceProfile.rhetoricalDevices}. Restructure so the piece leads with the strongest example first.`
      : "Restructure the piece to lead with the strongest example first, then build the argument around it.";
    return { direction: fallback };
  }
}

/**
 * Stage 3 — Humanize
 * Single-pass humanizer with boosted thinking budget and structured verification.
 * Replaces the previous 3-pass approach which burned ~70% of pipeline time
 * and could undo its own fixes across passes.
 * Streams the output.
 */
export async function humanizeContent(
  draft: string,
  voiceProfile: VoiceAnalysis,
  humanizerInstructions: string,
  contentType: string = "blog",
  favoriteWords?: { word: string; definition: string }[],
  authorContext?: string,
  onPassStart?: (pass: number, total: number) => void
): Promise<ReadableStream<Uint8Array>> {
  const typeLabel = CONTENT_TYPE_LABELS[contentType] ?? contentType;

  // Voice context so the humanizer replaces AI patterns with the author's
  // actual voice instead of generic prose
  const guidelines = voiceProfile.contentGuidelines?.[contentType];
  const guidelinesBlock = guidelines?.length
    ? `\n## Format-Specific Guidelines (${typeLabel})\n${guidelines.map((g) => `- ${g}`).join("\n")}\n`
    : "";
  const categoryInsight = voiceProfile.categoryInsights?.[contentType];
  const categoryInsightBlock = categoryInsight
    ? `\n## How This Author Writes ${typeLabel}\n${categoryInsight}\n`
    : "";
  const subVoiceBlock = buildSubVoiceBlock(voiceProfile, contentType);
  const enrichedVoiceBlock = buildEnrichedVoiceBlock(voiceProfile);
  const favoriteWordsBlock = favoriteWords?.length
    ? `\n## Author's Favorite Words (use naturally when they fit — never force)\n${favoriteWords.map((fw) => `- **${fw.word}**${fw.definition ? `: ${fw.definition}` : ""}`).join("\n")}\n`
    : "";
  const authorContextBlock = authorContext?.trim()
    ? `\n## Author Background\n${authorContext.trim()}\n`
    : "";

  // System prompt: humanizer.md instructions + author voice profile + structured checklist
  const systemPrompt = [
    {
      type: "text",
      text: humanizerInstructions,
      cache_control: { type: "ephemeral" },
    },
    {
      type: "text",
      text: `---

This text is going to be published under a real person's name. If it reads like AI wrote it, their reputation is damaged. Treat this accordingly.

Apply every single pattern from the humanizer guide above. Miss nothing. Every "furthermore", every rule-of-three, every hollow hedge, every generic conclusion, every synonym cycle, every copula avoidance ("serves as", "stands as"), every filler phrase — find it and kill it.

EM DASH RULE (absolute): Replace virtually ALL em dashes (—) with commas, periods, colons, semicolons, or parentheses. At most ONE em dash may survive in the entire piece, and only if the author's punctuation habits explicitly favor them. When in doubt, remove the em dash. Do NOT introduce any new em dashes in your rewrites — this is the single most common AI tell and the one readers notice first.

Do not replace AI patterns with bland, voiceless prose. That is equally unacceptable. Replace them with THIS AUTHOR'S voice. Read the profile and excerpts below. That is how the output must read — like this specific person sat down and wrote it.

PRESERVE AUTHENTIC IMPERFECTION: Do NOT "fix" grammar, sentence fragments, casual constructions, or unconventional punctuation that matches this author's actual style. If the author writes with sentence fragments, run-ons, starts sentences with conjunctions, or uses loose grammar for rhythm, those are FEATURES of their voice, not bugs to correct. Overly polished, grammatically perfect prose is itself an AI tell. Your job is to remove AI patterns while keeping (or restoring) the author's natural level of polish, however imperfect that is. When in doubt, lean toward the rawer, more human version.

While humanizing, also watch for fabricated specifics — numbers, statistics, percentages, study citations, or data points that look suspiciously precise and were not provided as context. If you spot what appears to be an invented figure, replace it with honest placeholder language (e.g., "your recent results," "the data you mentioned," "[specific number]"). Do not let fabricated data survive into the final output.

Output the final text only. No commentary. No process notes. No preamble.

## Author Voice Profile (PRIMARY — this is the voice you are restoring)
## Author Voice Profile
**Tone:** ${voiceProfile.tone}
**Sentence Structure:** ${voiceProfile.sentenceStructure}
**Vocabulary Style:** ${voiceProfile.vocabularyStyle}
**Punctuation Habits:** ${voiceProfile.punctuationHabits}
**Paragraph Style:** ${voiceProfile.paragraphStyle}
**Rhetorical Devices:** ${voiceProfile.rhetoricalDevices}
**Recurring Patterns:**
${voiceProfile.commonPatterns.map((p) => `- ${p}`).join("\n")}
**Things to Avoid (if ANY of these appear in the output, you have failed):**
${voiceProfile.thingsToAvoid.map((p) => `- ${p}`).join("\n")}
${enrichedVoiceBlock}${categoryInsightBlock}${subVoiceBlock}${guidelinesBlock}${favoriteWordsBlock}${authorContextBlock}

## MANDATORY VERIFICATION CHECKLIST

You MUST work through this checklist in your thinking before producing output.
For each item, scan the ENTIRE draft, count occurrences, and fix every one.
Do NOT skip items. Do NOT leave any for "later." There is no later.

**PASS 1 — Find and destroy AI patterns:**
[ ] Count em dashes (—). Replace ALL with commas, periods, colons, semicolons, or parentheses. Maximum 1 surviving em dash in the entire piece, and only if the author's punctuation habits explicitly favor them.
[ ] Find every instance of: "furthermore", "moreover", "additionally", "in addition" used as paragraph/sentence openers. Remove or rewrite each one.
[ ] Find every instance of: "delve", "underscore", "leverage" (metaphor), "utilize", "facilitate", "navigate" (metaphor), "foster", "garner", "showcase", "pivotal", "crucial", "landscape" (abstract), "tapestry" (abstract), "testament", "vibrant", "enhance". Replace each with plain language or the author's actual vocabulary.
[ ] Find copula avoidance: "serves as", "stands as", "marks a", "represents a", "boasts", "features a". Replace with "is", "are", "has".
[ ] Find hollow hedges: "It's worth noting", "It's important to note", "One might argue", "It's crucial to understand", "Needless to say". Delete or rewrite.
[ ] Find filler phrases: "In order to", "Due to the fact that", "At this point in time", "has the ability to", "In the event that". Simplify each.
[ ] Find rule-of-three groupings (X, Y, and Z patterns that feel forced). Break up any that aren't natural to the author.
[ ] Find synonym cycling (same concept called by 4 different names across sentences). Pick one term and stick with it.
[ ] Find generic conclusions: "the future looks bright", "exciting times ahead", "represents a major step", "continues to evolve". Replace with specifics or cut.
[ ] Find negative parallelisms: "Not only X but Y", "It's not just X; it's Y". Simplify.
[ ] Find -ing phrase padding: "highlighting...", "underscoring...", "reflecting...", "showcasing...", "contributing to...". Cut or rewrite as direct statements.
[ ] Find collaborative artifacts: "Here's...", "I hope this helps", "Let me know", "Great question!". Delete.

**PASS 2 — Verify formatting:**
[ ] Remove emojis entirely.
[ ] Convert title-case headings to sentence case.
[ ] Replace curly quotes with straight quotes.
[ ] Check for excessive boldface. Remove mechanical bolding.
[ ] Convert inline-header vertical lists (bolded label + colon) to flowing prose where appropriate.

**PASS 3 — Voice and fabrication audit:**
[ ] Read the piece aloud mentally. Does every sentence sound like THIS author? Not "good writing." THIS author.
[ ] Check for fabricated specifics: numbers, statistics, percentages, study citations, dates, or data points that look suspiciously precise and weren't in the provided context. Replace with honest placeholder language.
[ ] Confirm sentence length variation matches the author's patterns.
[ ] Confirm paragraph length matches the author's style.
[ ] Check that the opening sounds like how this author starts pieces, not a generic hook.
[ ] Check that the closing sounds like how this author ends pieces, not a generic wrap-up.

**AFTER completing the checklist:** Output the final text only. No commentary. No process notes. No preamble. No checklist results.`,
    },
  ];

  const { humanize: humanizeBudget } = getStageBudgets(contentType);
  // Single pass gets 2x the original per-pass thinking budget.
  // One deep pass with ample thinking outperforms 3 rushed passes that
  // can undo each other's fixes.
  const thinkingBudget = Math.min(humanizeBudget.thinkingBudget * 2, 128000, humanizeBudget.maxTokens - 1);

  onPassStart?.(1, 1);

  // Single streamed pass with structured checklist verification
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const stream: any = await withRetry(() => (getAnthropic().messages.stream as any)({
    model: "claude-opus-4-6",
    max_tokens: humanizeBudget.maxTokens,
    thinking: { type: "enabled", budget_tokens: thinkingBudget },
    system: systemPrompt,
    messages: [{
      role: "user",
      content: `Humanize this ${typeLabel}. Work through the MANDATORY VERIFICATION CHECKLIST in your thinking. For each checklist item, scan the entire text, find every instance, and fix it. Do not skip any item. Replace all AI patterns with this author's voice from the profile above. Output the cleaned text only.\n\n${draft}`,
    }],
  }), "humanizeContent");

  return new ReadableStream({
    async start(controller) {
      for await (const chunk of stream) {
        if (
          chunk.type === "content_block_delta" &&
          chunk.delta.type === "text_delta"
        ) {
          controller.enqueue(new TextEncoder().encode(chunk.delta.text));
        }
      }
      controller.close();
    },
  });
}

// ── Self-review ───────────────────────────────────────────────────────────────

/**
 * Re-read the draft as the author, check voice fidelity and brief adherence,
 * and make targeted surgical improvements. Has access to the same context as
 * the drafting stage so it can verify the piece uses the provided material.
 */
export async function selfReviewDraft(
  draft: string,
  voiceProfile: VoiceAnalysis,
  interview: InterviewAnswers,
  editingPreferences?: string,
  context?: GenerationContext,
  favoriteWords?: { word: string; definition: string }[],
  authorContext?: string
): Promise<string> {
  const editingBlock = editingPreferences?.trim()
    ? `\n## Author's Editing Habits\nWhen this author re-reads their own writing, they typically: ${editingPreferences.trim()}\nApply these same editorial instincts to this draft.\n`
    : "";

  const guidelines = voiceProfile.contentGuidelines?.[interview.contentType];
  const guidelinesBlock = guidelines?.length
    ? `\n## Format-Specific Guidelines (${resolveTypeLabel(interview)})\n${guidelines.map((g) => `- ${g}`).join("\n")}\n`
    : "";

  const categoryInsight = voiceProfile.categoryInsights?.[interview.contentType];
  const categoryInsightBlock = categoryInsight
    ? `\n## How This Author Writes ${resolveTypeLabel(interview)}\n${categoryInsight}\n`
    : "";

  const subVoiceBlock = buildSubVoiceBlock(voiceProfile, interview.contentType);

  const enrichedVoiceBlock = buildEnrichedVoiceBlock(voiceProfile);

  const favoriteWordsBlock = favoriteWords?.length
    ? `\n## Author's Favorite Words\n${favoriteWords.map((fw) => `- **${fw.word}**${fw.definition ? `: ${fw.definition}` : ""}`).join("\n")}\n`
    : "";

  const authorContextBlock = authorContext?.trim()
    ? `\n## Author Background\n${authorContext.trim()}\n`
    : "";

  const contextBlock = context ? buildContextBlock(context) : "";
  const binaryBlocks = context ? buildBinaryBlocks(context) : [];
  const betaHeaders = getBetaHeaders(binaryBlocks);

  const systemPrompt = `You are this author's editorial eye before the final humanization pass. Your job is to check voice fidelity, brief adherence, and fabrication — NOT to rewrite prose. Surgical fixes only.

CRITICAL — DO NOT INTRODUCE AI PATTERNS:
The humanizer runs AFTER you. Any AI patterns in YOUR edits will survive into the final output. The following in your edits is a failure:
- Em dashes (—) — use commas, periods, colons, or semicolons instead. ZERO new em dashes.
- "Furthermore," / "Moreover," / "Additionally," / "In addition," as paragraph openers
- Hollow hedges: "It's worth noting," "One might argue," "It's important to note"
- Copula avoidance: "serves as," "stands as," "represents a," "marks a"
- Filler verbs: "delve," "underscore," "leverage," "utilize," "foster," "navigate"
- Rule-of-three groupings, synonym cycling, generic positive conclusions
If you need to rewrite a sentence, use the author's voice from the profile below. Not generic prose. Not AI prose. THIS author's voice.

## Author Voice Profile
**Voice:** ${voiceProfile.rawSummary}
**Tone:** ${voiceProfile.tone}
**Sentence Structure:** ${voiceProfile.sentenceStructure}
**Vocabulary:** ${voiceProfile.vocabularyStyle}
**Things to Avoid (if ANY of these appear, fix them immediately):** ${voiceProfile.thingsToAvoid.join("; ")}
${enrichedVoiceBlock}${categoryInsightBlock}${subVoiceBlock}${guidelinesBlock}${favoriteWordsBlock}${authorContextBlock}${editingBlock}
Your review must check:
1. Voice fidelity — does every sentence sound like this specific author? Not "good writing." This author.
2. AI contamination — if any AI patterns survived the humanizer, destroy them. But do NOT introduce new ones in your fixes.
3. Brief adherence — did it cover the topic, angle, and key points? Is anything missing or weak?
4. Context usage — if supporting context was provided, did the draft use it? Are specifics woven in naturally?
5. Fabrication check — look for specific numbers, statistics, percentages, study citations, named sources, dates, or data points. Cross-reference them against the supporting context. If a claim appears in the draft but NOT in the context, it was invented. Replace it with placeholder language the author can fill in (e.g., "your recent results," "[specific figure]"). This applies to every content type.
6. Fix everything you find. Surgical fixes only — do not rewrite from scratch. Preserve the humanized phrasing wherever possible.

Output ONLY the improved draft. Nothing else.`;

  const userPrompt = `Original brief:
- Topic: ${sanitizeUserInput(interview.topic)}
- Angle: ${sanitizeUserInput(interview.angle)}
- Key points: ${sanitizeUserInput(interview.keyPoints)}
- Audience: ${interview.targetAudience ? sanitizeUserInput(interview.targetAudience) : "the author's usual audience"}
${contextBlock}
Draft to review:

${draft}`;

  const { humanize: budget } = getStageBudgets(interview.contentType);

  const messageContent =
    binaryBlocks.length > 0
      ? [{ type: "text", text: userPrompt }, ...binaryBlocks]
      : userPrompt;

  const reqOptions = Object.keys(betaHeaders).length > 0
    ? { headers: betaHeaders }
    : {};

  // Opus: self-review is the last defense for voice fidelity + fabrication checking
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const res: any = await withRetry(() => (getAnthropic().messages.create as any)(
    {
      model: "claude-opus-4-6",
      max_tokens: budget.maxTokens,
      thinking: { type: "enabled", budget_tokens: Math.min(Math.ceil(budget.thinkingBudget / 2), budget.maxTokens - 1) },
      system: [{ type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: messageContent }],
    },
    reqOptions
  ), "selfReviewDraft");

  return extractText(res.content) || draft;
}

// ── Research assessment ───────────────────────────────────────────────────────

/**
 * Quick assessment (via Gemini Flash) of whether the plan requires web research
 * before drafting. Returns targeted search queries if research is needed.
 */
export async function assessResearchNeeds(
  plan: string,
  interview: InterviewAnswers,
  context?: GenerationContext
): Promise<{ needed: boolean; queries: string[] }> {
  const contextSummary = context?.items.length
    ? `The writer has provided ${context.items.length} context item(s): ${context.items
        .map((item) => {
          if (item.url) return `URL: ${item.url}`;
          if (item.fileName) return `File: ${item.fileName}`;
          if (item.text) return `Text note (${item.tag})`;
          return `${item.tag} item`;
        })
        .join(", ")}`
    : "No supporting context has been provided.";

  const systemInstruction = `You decide whether a ghostwriter needs web research before writing. The content type does NOT determine this — the TOPIC does. A blog can be pure opinion or heavily data-dependent. An email can be casual or reference medical results. Judge by what the plan actually needs.

Return ONLY valid JSON — no prose, no code fences.
Return: { "needed": boolean, "queries": ["search query 1", ...] }

needed=true when:
- The plan references or implies specific facts, statistics, data points, study results, current events, named sources, or technical claims that are NOT already in the provided context
- The topic inherently involves verifiable data (medical, scientific, financial, legal, technical) and no context supplies that data
- The piece would be stronger or safer with factual grounding from real sources

needed=false when:
- The piece is opinion, personal narrative, creative writing, or persuasion that doesn't depend on external facts
- The provided context already covers the factual needs of the plan
- The topic is the author's personal experience, feelings, or perspective
- The content is conversational (casual emails, social banter, personal messages) with no factual claims

If needed, suggest 1-3 focused, specific search queries. Keep them targeted — "SaaS churn rate benchmarks 2025" not "SaaS industry trends". Do not suggest research for things only the author would know (their own results, experiences, opinions).`;

  // Gemini Flash: fast, cheap assessment call
  const result = await getGemini().models.generateContent({
    model: GEMINI_FAST_MODEL,
    contents: `Content type: ${resolveTypeLabel(interview)}
Topic: ${interview.topic}
Angle: ${interview.angle}

Plan:
${plan}

Available context: ${contextSummary}

Does this plan need web research before drafting?`,
    config: {
      systemInstruction,
      maxOutputTokens: 1024,
    },
  });

  const text = result.text ?? "";
  try {
    return JSON.parse(repairJson(text));
  } catch {
    return { needed: false, queries: [] };
  }
}

// ── Targeted revision ─────────────────────────────────────────────────────────

/**
 * Apply specific feedback to a finished draft.
 * Only makes the changes described — does not rewrite anything else.
 * Returns the revised text (non-streaming) so callers can pipe it
 * through the humanizer before presenting to the user.
 */
export async function reviseDraft(
  draft: string,
  feedback: string,
  voiceProfile: VoiceAnalysis,
  contentType: string = "blog"
): Promise<string> {
  const { humanize: budget } = getStageBudgets(contentType);

  const systemPrompt = `Apply ONLY the changes described in the feedback. Touch nothing else. Do not rewrite, restructure, or "improve" anything the feedback does not mention. Preserve the author's voice, phrasing, and formatting exactly as-is for everything not covered.

Author's voice: ${voiceProfile.rawSummary}
Things this author never does: ${voiceProfile.thingsToAvoid.join("; ")}

Do not introduce any AI patterns in your edits. No em dash overuse, no "furthermore", no hollow hedges, no filler transitions. If the feedback requires new text, write it in this author's voice.

Output the complete revised draft. Nothing else.`;

  const userPrompt = `Draft:\n\n${draft}\n\n---\n\nFeedback (apply these changes only):\n${feedback}\n\nRevised draft:`;

  // Gemini Flash: surgical revision (collected, not streamed —
  // the output goes through the humanizer before reaching the client)
  const result = await getGemini().models.generateContent({
    model: GEMINI_FAST_MODEL,
    contents: userPrompt,
    config: {
      systemInstruction: systemPrompt,
      maxOutputTokens: budget.maxTokens,
    },
  });

  return result.text ?? draft;
}

// ── Grok Responses API helper (web_search built-in tool) ─────────────────────

/**
 * Call Grok via the xAI Responses API with built-in web_search.
 * The model autonomously decides when to search; results are folded
 * into the final response automatically by xAI's servers.
 */
async function grokWithWebSearch(
  instructions: string,
  input: string,
  maxOutputTokens: number = 16000,
): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const res: any = await withRetry(() => (getXai().responses as any).create({
    model: "grok-4-1-fast-reasoning",
    instructions,
    input,
    tools: [{ type: "web_search" }],
    max_output_tokens: maxOutputTokens,
  }), "grokWithWebSearch");

  // Extract text from the response output items
  if (typeof res.output_text === "string") return res.output_text;
  // Fallback: iterate output items
  if (Array.isArray(res.output)) {
    const texts: string[] = [];
    for (const item of res.output) {
      if (item.type === "message" && Array.isArray(item.content)) {
        for (const block of item.content) {
          if (block.type === "output_text" || block.type === "text") {
            texts.push(block.text);
          }
        }
      }
    }
    if (texts.length > 0) return texts.join("");
  }
  return "";
}

// ── Research agent (Grok + web_search — replaces Gemini + Google Search) ──────

/**
 * Multi-step research using Grok 4.1 with built-in web search.
 * Grok reasons about what to search, executes searches autonomously,
 * cross-references findings, and produces a structured research brief.
 * Replaces the single-shot Gemini + Google Search grounding approach.
 */
export async function conductResearchGrok(
  prompt: string,
  interviewContext?: { topic?: string; angle?: string; contentType?: string }
): Promise<string> {
  const typeLabelHint = interviewContext?.contentType
    ? (CONTENT_TYPE_LABELS[interviewContext.contentType] ?? interviewContext.contentType)
    : "piece";
  const contextHint = interviewContext?.topic
    ? ` Context: writing a ${typeLabelHint} about "${interviewContext.topic}"${interviewContext.angle ? ` (angle: ${interviewContext.angle})` : ""}.`
    : "";

  const instructions = `You are a research agent preparing a structured brief for a professional ghostwriter.${contextHint}

Your job is to build a comprehensive, fact-checked research foundation. Use web search aggressively — don't settle for one source when three would be stronger.

RESEARCH PROTOCOL:
1. Start with the core topic — search for authoritative overviews, recent data, key statistics
2. Go deeper on specific claims — find primary sources, actual studies, named experts
3. Look for counterarguments and alternative perspectives — strong writing acknowledges complexity
4. Find recent developments (last 12 months) that the writer should know about
5. Cross-reference key claims across multiple sources — if only one source says it, flag it as unverified

OUTPUT FORMAT — Structured markdown brief:
- Key facts, figures, and data points WITH inline source attribution ("According to [Source Name], ...")
- Relevant statistics with dates and context (not just numbers — what do they mean?)
- Important background the writer needs to understand the topic
- Notable arguments and counterarguments from credible voices
- Specific examples and case studies with real names and details
- Recent developments and current state of the topic
- Any commonly repeated claims that turned out to be misleading or outdated

RULES:
- Every factual claim MUST have a source. No orphan facts.
- Prefer primary sources (studies, official reports, named experts) over aggregator sites
- Include publication dates so the writer knows how current the data is
- If you find conflicting information, present both sides with sources
- Be specific — "revenue grew 23% to $4.2B in Q3 2025" not "revenue grew significantly"
- Format clearly with headers and bullets. The ghostwriter will use this directly as context.`;

  return withRetry(
    () => grokWithWebSearch(instructions, prompt, 16000),
    "conductResearchGrok"
  );
}

// ── Fabrication checker (Grok + web_search) ──────────────────────────────────

/**
 * Verify factual claims in a draft by searching the web.
 * Returns the draft with fabricated claims replaced by placeholders,
 * or the original draft if no fabrications are found.
 */
export async function checkFabrications(
  draft: string,
  interview: InterviewAnswers,
  context?: GenerationContext,
): Promise<{ cleanDraft: string; fabricationsFound: number }> {
  const contextSummary = context?.items.length
    ? `The writer was provided ${context.items.length} context item(s) as source material.`
    : "No source material was provided — the piece was written from the author's perspective and voice profile only.";

  const instructions = `You are a fact-checker reviewing a draft before publication under a real person's name. Your job is to find and flag any fabricated specifics — invented statistics, fake studies, made-up quotes, wrong dates, or claims that don't hold up.

VERIFICATION PROTOCOL:
1. Scan the draft for every specific factual claim: numbers, percentages, statistics, study citations, named sources, dates, company names, product names, historical events, scientific claims
2. For each claim, search the web to verify it
3. Classify each claim as: VERIFIED (found corroborating source), UNVERIFIABLE (can't confirm or deny), or FABRICATED (contradicted by evidence or no evidence exists)
4. Replace FABRICATED claims with honest placeholder language the author can fill in

RULES:
- Opinion, perspective, and argument do NOT need verification — only specific factual claims
- If the author says "I believe X" or "in my experience," that's their opinion — leave it alone
- Common knowledge doesn't need verification ("the sky is blue")
- If a claim is close but slightly wrong (e.g. wrong year, wrong percentage), fix it with the correct data and add a [VERIFIED: corrected from original] note
- If a claim is completely fabricated, replace it with placeholder language like "[specific statistic]" or "according to [source]"
- Preserve the author's voice and tone in all replacements

${contextSummary}

OUTPUT FORMAT — Return valid JSON only:
{
  "fabricationsFound": <number of claims replaced>,
  "cleanDraft": "<the full draft with fabrications replaced by placeholders>"
}`;

  const userPrompt = `Content type: ${CONTENT_TYPE_LABELS[interview.contentType] ?? interview.contentType}
Topic: ${interview.topic}

Draft to fact-check:

${draft}`;

  try {
    const result = await grokWithWebSearch(instructions, userPrompt, 32000);
    const parsed = JSON.parse(repairJson(result));
    return {
      cleanDraft: parsed.cleanDraft || draft,
      fabricationsFound: parsed.fabricationsFound || 0,
    };
  } catch {
    // If parsing fails, return draft unchanged
    return { cleanDraft: draft, fabricationsFound: 0 };
  }
}

// ── Draft comparison (Grok — replaces Opus) ──────────────────────────────────

/**
 * Compare multiple drafts against the voice profile and brief.
 * Uses Grok's extended reasoning — this is analytical judgment, not writing.
 * Cheaper than Opus and arguably deeper for comparison tasks.
 */
export async function compareDraftsGrok(
  drafts: string[],
  voiceProfile: VoiceAnalysis,
  interview: InterviewAnswers
): Promise<string> {
  const systemPrompt = `You are evaluating drafts written by a ghostwriter attempting to mimic a specific author's voice. Your job is to select the best draft — or synthesize the best elements — so the result is indistinguishable from the author's actual writing.

REASONING PROTOCOL:
Think deeply before producing output. For each draft:
1. Read it as if you were the author's editor who knows their voice intimately
2. Mark every sentence that sounds like AI instead of this specific human
3. Check brief fidelity — did it cover everything requested?
4. Check for AI contamination: opener clichés, filler verbs ("delve", "underscore", "leverage", "utilize", "foster"), hollow hedges ("It's worth noting", "One might argue"), transition clichés ("Furthermore,", "Moreover,", "Additionally,"), closing tells ("In conclusion,"), em dash overuse, rule-of-three groupings, synonym cycling

## Author Voice Profile
${voiceProfile.rawSummary}
- Tone: ${voiceProfile.tone}
- Sentence structure: ${voiceProfile.sentenceStructure}
- Vocabulary: ${voiceProfile.vocabularyStyle}
- Punctuation habits: ${voiceProfile.punctuationHabits}
- Rhetorical devices: ${voiceProfile.rhetoricalDevices}
- Human imperfections: ${voiceProfile.humanImperfections ?? "not specified"}
- Authentic quirks: ${voiceProfile.authenticQuirks ?? "not specified"}
- Things this author NEVER does: ${voiceProfile.thingsToAvoid.join("; ")}`;

  const userPrompt = `Select the best of these ${drafts.length} drafts. The winner must sound like this specific author wrote it — not like AI.

**Brief:**
- Topic: ${interview.topic}
- Angle: ${interview.angle}
- Key points: ${interview.keyPoints}
- Audience: ${interview.targetAudience || "the author's usual audience"}

**The Drafts:**
${drafts.map((d, i) => `--- DRAFT ${i + 1} ---\n${d}`).join("\n\n")}

Produce the final version. If neither draft fully meets the standard, take the best elements from each and combine them. Clean up any AI patterns you find. The output must be publishable under this person's name without suspicion.

Output ONLY the final piece. Nothing else.`;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const res: any = await withRetry(() => getXai().chat.completions.create({
    model: XAI_WRITING_MODEL,
    max_completion_tokens: 64000,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
  }), "compareDraftsGrok");

  const msg = res.choices[0].message;
  const raw = msg.content ?? msg.reasoning_content ?? "";
  return raw || drafts[0]; // fallback to first draft if empty
}

// ── Brief quality prediction (Grok) ──────────────────────────────────────────

/**
 * Analyze a brief + voice profile and predict output quality issues
 * BEFORE the pipeline runs. Flags vague briefs, missing context for
 * data-heavy topics, and mismatches between the brief and voice profile.
 * Returns null if the brief looks good.
 */
export async function assessBriefQuality(
  interview: InterviewAnswers,
  voiceProfile: VoiceAnalysis,
  context?: GenerationContext,
): Promise<{ score: number; warnings: string[] } | null> {
  const contextSummary = context?.items.length
    ? `${context.items.length} context item(s) provided: ${context.items.map((item) => {
        if (item.url) return `URL: ${item.url}`;
        if (item.fileName) return `File: ${item.fileName}`;
        if (item.text) return `Text note (${item.text.slice(0, 50)}...)`;
        return `${item.tag} item`;
      }).join(", ")}`
    : "No supporting context provided.";

  const typeLabel = CONTENT_TYPE_LABELS[interview.contentType] ?? interview.contentType;

  const systemPrompt = `You predict whether a ghostwriting brief will produce strong output or weak output. You've seen thousands of briefs — you know what works and what doesn't.

REASONING PROTOCOL:
Think step by step about every dimension:
1. Is the topic specific enough to write about? "Marketing" is too vague. "Why B2B SaaS companies should stop gating content" is specific.
2. Does the angle give the ghostwriter a clear thesis or argument? An angle-less piece becomes a Wikipedia summary.
3. Are key points substantive or just topic labels? "Talk about pricing" vs "Argue that value-based pricing outperforms per-seat for tools under $50/mo"
4. Does this content type need data/research? A personal essay doesn't. A technical whitepaper does.
5. Is there a mismatch between the content type and the brief's depth? A 3000-word research paper with a one-line topic will produce filler.
6. Is there enough context to support factual claims? If the topic implies statistics but no context provides them, the AI will fabricate.

SCORE: 1-10 where 10 is a brief that will definitely produce strong output and 1 will definitely produce weak output.`;

  const userPrompt = `Content type: ${typeLabel}
Topic: ${interview.topic}
Angle: ${interview.angle || "(not specified)"}
Key points: ${interview.keyPoints || "(not specified)"}
Target audience: ${interview.targetAudience || "(not specified)"}
Word count target: ${interview.wordCountTarget || "(not specified)"}
Context: ${contextSummary}

Author writes: ${voiceProfile.rawSummary}

Rate this brief 1-10 and list any specific warnings (things that will cause weak output).

Return ONLY valid JSON:
{
  "score": <1-10>,
  "warnings": ["specific warning 1", "specific warning 2"]
}

If score >= 7, return empty warnings array. Only warn about things that will actually cause problems.`;

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res: any = await withRetry(() => getXai().chat.completions.create({
      model: "grok-4-1-fast-non-reasoning",
      max_tokens: 2048,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    }), "assessBriefQuality");

    const raw = res.choices[0].message?.content ?? "";
    const parsed = JSON.parse(repairJson(raw));
    if (parsed.score >= 7 || !parsed.warnings?.length) return null;
    return { score: parsed.score, warnings: parsed.warnings };
  } catch {
    return null; // Don't block the pipeline on assessment failure
  }
}

// ── Voice fidelity scoring (Grok — post-generation quality gate) ─────────────

/**
 * Score how well a finished draft matches the author's voice profile.
 * Runs after humanization as a quality gate. Returns a score (0-100)
 * and flags specific sentences that break voice.
 * If the score is below threshold, the flagged sentences inform a
 * targeted re-humanization pass.
 */
export async function scoreVoiceFidelity(
  draft: string,
  voiceProfile: VoiceAnalysis,
  contentType: string,
): Promise<{ score: number; flags: string[] }> {
  const typeLabel = CONTENT_TYPE_LABELS[contentType] ?? contentType;

  const systemPrompt = `You are a voice authenticity auditor. You've studied this author's writing extensively and can identify when prose doesn't match their voice. Your job is to score a finished draft on voice fidelity and flag every sentence that doesn't sound like this person.

REASONING PROTOCOL:
Read the entire draft twice:
1. First pass: overall impression. Does it FEEL like this author? Gut reaction.
2. Second pass: sentence-by-sentence. For each sentence, ask: "Would this specific human write this sentence exactly this way?" If no, flag it and explain why.

SCORING GUIDE:
- 90-100: Indistinguishable from the author. A reader who knows them would not suspect AI.
- 80-89: Strong match with a few tells. Minor adjustments would fix it.
- 70-79: Decent match but several sentences feel off. The voice is there but inconsistent.
- 60-69: Mixed. Some parts sound like them, others sound like generic AI prose.
- Below 60: Significant voice mismatch. Needs substantial rework.

## Author Voice Profile
**Summary:** ${voiceProfile.rawSummary}
**Tone:** ${voiceProfile.tone}
**Sentence Structure:** ${voiceProfile.sentenceStructure}
**Vocabulary:** ${voiceProfile.vocabularyStyle}
**Punctuation:** ${voiceProfile.punctuationHabits}
**Paragraph Style:** ${voiceProfile.paragraphStyle}
**Rhetorical Devices:** ${voiceProfile.rhetoricalDevices}
**Human Imperfections:** ${voiceProfile.humanImperfections ?? "not specified"}
**Authentic Quirks:** ${voiceProfile.authenticQuirks ?? "not specified"}
**Things this author NEVER does:** ${voiceProfile.thingsToAvoid.join("; ")}
**Emotional Patterns:** ${voiceProfile.emotionalPatterns ?? "not specified"}
**Transition Style:** ${voiceProfile.transitionStyle ?? "not specified"}`;

  const userPrompt = `Score this ${typeLabel} on voice fidelity (0-100). Flag any sentences or passages that don't match this author's voice.

Draft:

${draft}

Return ONLY valid JSON:
{
  "score": <0-100>,
  "flags": ["<sentence or passage that doesn't match voice> — <why it fails>"]
}

Be ruthless. If the piece sounds like polished AI prose where the author writes raw and casual, that's a voice failure even if the grammar is "correct." The goal is authenticity, not quality.`;

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res: any = await withRetry(() => getXai().chat.completions.create({
      model: XAI_WRITING_MODEL,
      max_completion_tokens: 32000,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    }), "scoreVoiceFidelity");

    const msg = res.choices[0].message;
    const raw = msg.content ?? msg.reasoning_content ?? "";
    const parsed = JSON.parse(repairJson(raw));
    return {
      score: parsed.score ?? 0,
      flags: Array.isArray(parsed.flags) ? parsed.flags : [],
    };
  } catch {
    // Don't block the pipeline on scoring failure
    return { score: 100, flags: [] };
  }
}

// ── Voice repair (targeted fix for low-scoring drafts) ───────────────────────

/** Minimum voice fidelity score. Below this, the pipeline runs a repair pass. */
export const VOICE_FIDELITY_THRESHOLD = 80;

/**
 * Surgically fix specific voice-fidelity failures flagged by scoreVoiceFidelity.
 * Does NOT re-humanize the whole piece — only rewrites the flagged sentences
 * to match the author's voice. Uses Grok reasoning to keep costs down.
 */
export async function repairVoice(
  draft: string,
  voiceProfile: VoiceAnalysis,
  flags: string[],
  contentType: string,
): Promise<string> {
  if (flags.length === 0) return draft;

  const typeLabel = CONTENT_TYPE_LABELS[contentType] ?? contentType;

  const systemPrompt = `You are surgically repairing specific sentences in a ${typeLabel} that don't match the author's voice. Fix ONLY the flagged sentences. Touch NOTHING else — every other word, comma, and paragraph break stays exactly as-is.

REASONING PROTOCOL:
For each flag:
1. Find the exact sentence or passage in the draft
2. Understand WHY it fails (the flag explains this)
3. Rewrite it to match the author's voice profile below
4. Verify your rewrite sounds like this specific human, not like generic prose

## Author Voice Profile
**Summary:** ${voiceProfile.rawSummary}
**Tone:** ${voiceProfile.tone}
**Sentence Structure:** ${voiceProfile.sentenceStructure}
**Vocabulary:** ${voiceProfile.vocabularyStyle}
**Punctuation:** ${voiceProfile.punctuationHabits}
**Human Imperfections:** ${voiceProfile.humanImperfections ?? "not specified"}
**Authentic Quirks:** ${voiceProfile.authenticQuirks ?? "not specified"}
**Things this author NEVER does:** ${voiceProfile.thingsToAvoid.join("; ")}

RULES:
- Fix ONLY the flagged sentences. Do not "improve" surrounding text.
- Do not introduce AI patterns (em dashes, "furthermore", hollow hedges, filler verbs)
- Match the author's level of polish — if they write rough, your fixes should be rough
- Output the COMPLETE draft with fixes applied. Nothing else.`;

  const userPrompt = `Fix these specific voice failures:

${flags.map((f, i) => `${i + 1}. ${f}`).join("\n")}

Draft:

${draft}

Output the complete draft with ONLY the flagged sentences rewritten. Everything else stays identical.`;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const res: any = await withRetry(() => getXai().chat.completions.create({
    model: XAI_WRITING_MODEL,
    max_completion_tokens: 64000,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
  }), "repairVoice");

  const msg = res.choices[0].message;
  const raw = msg.content ?? msg.reasoning_content ?? "";
  return raw || draft;
}
