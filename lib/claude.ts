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
//   Agent 3 (Opus): Editor — self-review using voice profile only
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
  const categoryKeyList = categories
    .map((c) => `"${c}" (${CONTENT_TYPE_LABELS[c] ?? c})`)
    .join(", ");
  const categorySection =
    categories.length > 1
      ? `\nNote: samples span multiple formats: ${categoryKeyList}. Include a "categoryInsights" field with per-format style notes where the author's voice shifts noticeably between formats. Use EXACTLY the category keys listed above — not synonyms, not abbreviations.\n`
      : "";

  // Build example categoryInsights using the actual categories from the samples
  const exampleCategoryInsights = categories.length > 1
    ? `"categoryInsights": { ${categories.slice(0, 3).map(c => `"${c}": "how their voice shows up specifically in ${CONTENT_TYPE_LABELS[c] ?? c} writing"`).join(", ")} }`
    : `"categoryInsights": {}`;

  // Build example contentGuidelines using actual categories
  const exampleContentGuidelines = categories.length > 0
    ? `"contentGuidelines": { ${categories.slice(0, 2).map(c => `"${c}": ["6–8 specific, actionable guidelines bridging THIS author's voice with ${CONTENT_TYPE_LABELS[c] ?? c} conventions"]`).join(", ")} }`
    : `"contentGuidelines": {}`;

  const systemPrompt = `You are a writing style analyst. Your job is to deeply analyze writing samples from a single author and extract a comprehensive voice profile that a ghostwriter could use to write indistinguishably as this person. Take your time. Read every sample multiple times. Notice patterns across samples, not just within them.

CRITICAL — CAPTURE IMPERFECTION: Real humans do NOT write perfectly. This author's "mistakes" are part of their voice. Look for sentence fragments, run-on sentences, comma splices, starting sentences with "And" or "But", unconventional punctuation, abrupt transitions, loose grammar used for rhythm, unfinished thoughts, stream-of-consciousness passages. These are NOT flaws to note — they are FEATURES to replicate. A ghostwriter who "fixes" these will sound like AI, not like this person.

Also look for the author's unique tics — unexpected metaphor patterns, trademark phrases, words they overuse (intentionally or not), idiosyncratic formatting, the way they handle emotional moments vs analytical ones, how they transition (or don't transition) between ideas. The goal is to capture everything that makes this person's writing THEIRS, especially the things a grammar checker would flag.`;

  const userPrompt = `Analyze the following writing samples from a single author and extract a detailed voice profile that could be used to ghost-write in their exact style.
${categorySection}
${samplesText}

Return ONLY valid JSON with this exact structure (no markdown, no extra text):
{
  "tone": "description of the overall tone and personality that comes through",
  "sentenceStructure": "how they structure sentences - length, complexity, rhythm patterns",
  "vocabularyStyle": "word choice tendencies - formal/casual, simple/complex, specific vocabulary they favor",
  "punctuationHabits": "how they use punctuation - em dashes, ellipses, semicolons, etc.",
  "paragraphStyle": "paragraph length, transitions, how they open and close paragraphs",
  "rhetoricalDevices": "rhetorical moves they make - analogies, questions, callbacks, lists, etc.",
  "commonPatterns": ["specific recurring phrases or structural patterns", "another pattern"],
  "thingsToAvoid": ["writing patterns NOT present in their work that should be avoided", "another thing to avoid"],
  "rawSummary": "a 2-3 sentence plain English summary of their writing style for easy reference",
  "humanImperfections": "grammar rules this author breaks on purpose or by habit - fragments, run-ons, comma splices, starting with conjunctions, etc. Be specific.",
  "authenticQuirks": "unique tics - trademark phrases, overused words, unexpected metaphors, idiosyncratic formatting, distinctive word combos",
  "emotionalPatterns": "how they handle emotional intensity vs analytical passages - sudden shifts, understatement, humor as deflection, etc.",
  "transitionStyle": "how they connect ideas - abrupt shifts, callbacks, stream-of-consciousness, smooth transitions, or no transitions at all",
  ${exampleCategoryInsights},
  ${exampleContentGuidelines}
}

Rules:
- CRITICAL: The keys in categoryInsights and contentGuidelines MUST use EXACTLY the category keys from the sample headers above (${categories.map(c => `"${c}"`).join(", ")}). Do not invent keys, abbreviate them, or use synonyms. "twitter_thread" not "thread". "social" not "tweet". "text_message" not "text". Use the exact strings.
- Only include keys in categoryInsights that are represented in the samples. Omit the field entirely if only one format is present.
- Only include keys in contentGuidelines for formats actually represented in the samples. Each value is an array of 6–8 strings. Guidelines must reflect this author's specific tendencies—not boilerplate format advice.
- humanImperfections, authenticQuirks, emotionalPatterns, and transitionStyle are REQUIRED. Be detailed and specific — these fields are what prevent the ghostwriter from producing generic, over-polished AI prose.`;

  // Grok 4.1 reasoning: 2M context window lets us feed ALL samples at once
  // without truncation. High reasoning budget lets it deeply analyze patterns
  // across the full corpus. This is the foundation — everything downstream
  // depends on voice profile quality.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const res: any = await withRetry(() => getXai().chat.completions.create({
    model: XAI_WRITING_MODEL,
    max_completion_tokens: 32000,
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
  if (categorySamples.length === 0) {
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

  const systemPrompt = `You are a writing style analyst specializing in format-specific voice analysis. You have already analyzed this author's overall voice. Now you need to understand how their voice specifically manifests when writing ${categoryLabel} content.`;

  const userPrompt = `The author's overall voice summary: "${mainVoiceSummary}"

Below are their ${categoryLabel} writing samples. Analyze how their voice specifically shows up in this format.

${samplesText}

Return ONLY valid JSON:
{
  "summary": "2-3 sentence description of how this author writes ${categoryLabel} content specifically",
  "toneShift": "how their tone shifts (if at all) when writing ${categoryLabel} vs their general voice",
  "structuralPatterns": "structural tendencies specific to their ${categoryLabel} writing",
  "vocabularyNotes": "vocabulary or register shifts in this format",
  "keyGuidelines": ["4-6 specific, actionable guidelines for ghostwriting ${categoryLabel} content as this author"]
}`;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const res: any = await withRetry(() => getXai().chat.completions.create({
    model: XAI_WRITING_MODEL,
    max_completion_tokens: 8000,
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

  // Only run sub-voice calls for categories that actually have samples
  const categoriesWithSamples = selectedCategories.filter(cat =>
    samples.some(s => s.category === cat)
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
  textbook_chapter:    "Write as long as the scope demands — comprehensive coverage is critical. Structured with learning objectives, clear section headers, explanations, worked examples, key-term definitions, and end-of-chapter review questions or exercises. Authoritative but accessible. Integrate figures/diagrams references where appropriate.",
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
  review: StageBudget;
}

const STAGE_BUDGETS: Record<string, StageBudgets> = {
  // ── Very long-form (128k draft) ───────────────────────────────────────────
  research:      { plan: { maxTokens: 32000, thinkingBudget: 16000 }, draft: { maxTokens: 128000, thinkingBudget: 64000 }, draftFollowup: { maxTokens: 128000, thinkingBudget: 32000 }, review: { maxTokens: 128000, thinkingBudget: 64000 } },
  whitepaper:    { plan: { maxTokens: 32000, thinkingBudget: 16000 }, draft: { maxTokens: 128000, thinkingBudget: 64000 }, draftFollowup: { maxTokens: 128000, thinkingBudget: 32000 }, review: { maxTokens: 128000, thinkingBudget: 64000 } },
  business_plan: { plan: { maxTokens: 32000, thinkingBudget: 16000 }, draft: { maxTokens: 128000, thinkingBudget: 64000 }, draftFollowup: { maxTokens: 128000, thinkingBudget: 32000 }, review: { maxTokens: 128000, thinkingBudget: 64000 } },
  handbook:      { plan: { maxTokens: 32000, thinkingBudget: 16000 }, draft: { maxTokens: 128000, thinkingBudget: 64000 }, draftFollowup: { maxTokens: 128000, thinkingBudget: 32000 }, review: { maxTokens: 128000, thinkingBudget: 64000 } },
  technical:     { plan: { maxTokens: 32000, thinkingBudget: 16000 }, draft: { maxTokens: 128000, thinkingBudget: 48000 }, draftFollowup: { maxTokens: 128000, thinkingBudget: 24000 }, review: { maxTokens: 100000, thinkingBudget: 48000 } },
  course:        { plan: { maxTokens: 32000, thinkingBudget: 16000 }, draft: { maxTokens: 128000, thinkingBudget: 48000 }, draftFollowup: { maxTokens: 128000, thinkingBudget: 24000 }, review: { maxTokens: 100000, thinkingBudget: 48000 } },
  // ── Standard long-form (64k–80k draft) ────────────────────────────────────
  case_study:    { plan: { maxTokens: 16000, thinkingBudget: 10000 }, draft: { maxTokens: 80000,  thinkingBudget: 32000 }, draftFollowup: { maxTokens: 80000,  thinkingBudget: 16000 }, review: { maxTokens: 64000,  thinkingBudget: 32000 } },
  report:        { plan: { maxTokens: 16000, thinkingBudget: 10000 }, draft: { maxTokens: 80000,  thinkingBudget: 32000 }, draftFollowup: { maxTokens: 80000,  thinkingBudget: 16000 }, review: { maxTokens: 64000,  thinkingBudget: 32000 } },
  rfp:           { plan: { maxTokens: 16000, thinkingBudget: 10000 }, draft: { maxTokens: 64000,  thinkingBudget: 32000 }, draftFollowup: { maxTokens: 64000,  thinkingBudget: 16000 }, review: { maxTokens: 48000,  thinkingBudget: 32000 } },
  scope_of_work: { plan: { maxTokens: 16000, thinkingBudget: 10000 }, draft: { maxTokens: 64000,  thinkingBudget: 32000 }, draftFollowup: { maxTokens: 64000,  thinkingBudget: 16000 }, review: { maxTokens: 48000,  thinkingBudget: 32000 } },
  guide:         { plan: { maxTokens: 16000, thinkingBudget: 10000 }, draft: { maxTokens: 64000,  thinkingBudget: 32000 }, draftFollowup: { maxTokens: 64000,  thinkingBudget: 16000 }, review: { maxTokens: 48000,  thinkingBudget: 32000 } },
  essay:         { plan: { maxTokens: 16000, thinkingBudget: 10000 }, draft: { maxTokens: 64000,  thinkingBudget: 32000 }, draftFollowup: { maxTokens: 64000,  thinkingBudget: 16000 }, review: { maxTokens: 64000,  thinkingBudget: 32000 } },
  proposal:      { plan: { maxTokens: 16000, thinkingBudget: 10000 }, draft: { maxTokens: 64000,  thinkingBudget: 32000 }, draftFollowup: { maxTokens: 64000,  thinkingBudget: 16000 }, review: { maxTokens: 48000,  thinkingBudget: 32000 } },
  speech:        { plan: { maxTokens: 16000, thinkingBudget: 10000 }, draft: { maxTokens: 48000,  thinkingBudget: 24000 }, draftFollowup: { maxTokens: 48000,  thinkingBudget: 12000 }, review: { maxTokens: 48000,  thinkingBudget: 24000 } },
  script:        { plan: { maxTokens: 16000, thinkingBudget: 10000 }, draft: { maxTokens: 48000,  thinkingBudget: 24000 }, draftFollowup: { maxTokens: 48000,  thinkingBudget: 12000 }, review: { maxTokens: 48000,  thinkingBudget: 24000 } },
  // ── Medium (16k–32k draft) ────────────────────────────────────────────────
  blog:          { plan: { maxTokens: 16000, thinkingBudget: 10000 }, draft: { maxTokens: 32000,  thinkingBudget: 16000 }, draftFollowup: { maxTokens: 32000,  thinkingBudget: 10000 }, review: { maxTokens: 32000,  thinkingBudget: 24000 } },
  newsletter:    { plan: { maxTokens: 12000, thinkingBudget: 8000  }, draft: { maxTokens: 24000,  thinkingBudget: 12000 }, draftFollowup: { maxTokens: 24000,  thinkingBudget: 8000  }, review: { maxTokens: 24000,  thinkingBudget: 16000 } },
  press_release: { plan: { maxTokens: 12000, thinkingBudget: 8000  }, draft: { maxTokens: 16000,  thinkingBudget: 10000 }, draftFollowup: { maxTokens: 16000,  thinkingBudget: 6000  }, review: { maxTokens: 16000,  thinkingBudget: 12000 } },
  textbook_chapter: { plan: { maxTokens: 16000, thinkingBudget: 12000 }, draft: { maxTokens: 64000, thinkingBudget: 32000 }, draftFollowup: { maxTokens: 64000, thinkingBudget: 16000 }, review: { maxTokens: 64000, thinkingBudget: 32000 } },
  lesson_plan:   { plan: { maxTokens: 12000, thinkingBudget: 8000  }, draft: { maxTokens: 16000,  thinkingBudget: 10000 }, draftFollowup: { maxTokens: 16000,  thinkingBudget: 6000  }, review: { maxTokens: 16000,  thinkingBudget: 12000 } },
  resume:        { plan: { maxTokens: 12000, thinkingBudget: 8000  }, draft: { maxTokens: 16000,  thinkingBudget: 10000 }, draftFollowup: { maxTokens: 16000,  thinkingBudget: 6000  }, review: { maxTokens: 16000,  thinkingBudget: 10000 } },
  cover_letter:  { plan: { maxTokens: 10000, thinkingBudget: 6000  }, draft: { maxTokens: 12000,  thinkingBudget: 8000  }, draftFollowup: { maxTokens: 12000,  thinkingBudget: 5000  }, review: { maxTokens: 12000,  thinkingBudget: 10000 } },
  // ── Short (4k–8k draft) ───────────────────────────────────────────────────
  letter:          { plan: { maxTokens: 8000,  thinkingBudget: 4000  }, draft: { maxTokens: 8000,   thinkingBudget: 4000  }, draftFollowup: { maxTokens: 8000,   thinkingBudget: 3000  }, review: { maxTokens: 8000,   thinkingBudget: 8000  } },
  review:          { plan: { maxTokens: 8000,  thinkingBudget: 4000  }, draft: { maxTokens: 8000,   thinkingBudget: 4000  }, draftFollowup: { maxTokens: 8000,   thinkingBudget: 3000  }, review: { maxTokens: 8000,   thinkingBudget: 8000  } },
  email:           { plan: { maxTokens: 8000,  thinkingBudget: 4000  }, draft: { maxTokens: 8000,   thinkingBudget: 4000  }, draftFollowup: { maxTokens: 8000,   thinkingBudget: 3000  }, review: { maxTokens: 8000,   thinkingBudget: 8000  } },
  bio:             { plan: { maxTokens: 6000,  thinkingBudget: 4000  }, draft: { maxTokens: 4000,   thinkingBudget: 3000  }, draftFollowup: { maxTokens: 4000,   thinkingBudget: 2000  }, review: { maxTokens: 4000,   thinkingBudget: 8000  } },
  product_description: { plan: { maxTokens: 6000, thinkingBudget: 4000 }, draft: { maxTokens: 4000, thinkingBudget: 3000 }, draftFollowup: { maxTokens: 4000, thinkingBudget: 2000 }, review: { maxTokens: 4000, thinkingBudget: 8000 } },
  list:            { plan: { maxTokens: 6000,  thinkingBudget: 4000  }, draft: { maxTokens: 4000,   thinkingBudget: 3000  }, draftFollowup: { maxTokens: 4000,   thinkingBudget: 2000  }, review: { maxTokens: 4000,   thinkingBudget: 8000  } },
  social:          { plan: { maxTokens: 6000,  thinkingBudget: 4000  }, draft: { maxTokens: 4000,   thinkingBudget: 3000  }, draftFollowup: { maxTokens: 4000,   thinkingBudget: 2000  }, review: { maxTokens: 4000,   thinkingBudget: 8000  } },
  twitter_thread:  { plan: { maxTokens: 8000,  thinkingBudget: 6000  }, draft: { maxTokens: 12000,  thinkingBudget: 8000  }, draftFollowup: { maxTokens: 12000,  thinkingBudget: 5000  }, review: { maxTokens: 12000,  thinkingBudget: 16000 } },
  // ── Very short (3k draft) ─────────────────────────────────────────────────
  caption:         { plan: { maxTokens: 4000,  thinkingBudget: 3000  }, draft: { maxTokens: 3000,   thinkingBudget: 2000  }, draftFollowup: { maxTokens: 3000,   thinkingBudget: 1500  }, review: { maxTokens: 3000,   thinkingBudget: 6000  } },
  text_message:    { plan: { maxTokens: 4000,  thinkingBudget: 3000  }, draft: { maxTokens: 3000,   thinkingBudget: 2000  }, draftFollowup: { maxTokens: 3000,   thinkingBudget: 1500  }, review: { maxTokens: 3000,   thinkingBudget: 6000  } },
  thank_you_note:  { plan: { maxTokens: 4000,  thinkingBudget: 3000  }, draft: { maxTokens: 3000,   thinkingBudget: 2000  }, draftFollowup: { maxTokens: 3000,   thinkingBudget: 1500  }, review: { maxTokens: 3000,   thinkingBudget: 6000  } },
  ad_copy:         { plan: { maxTokens: 4000,  thinkingBudget: 3000  }, draft: { maxTokens: 3000,   thinkingBudget: 2000  }, draftFollowup: { maxTokens: 3000,   thinkingBudget: 1500  }, review: { maxTokens: 3000,   thinkingBudget: 6000  } },
  ai_prompt:       { plan: { maxTokens: 4000,  thinkingBudget: 3000  }, draft: { maxTokens: 3000,   thinkingBudget: 2000  }, draftFollowup: { maxTokens: 3000,   thinkingBudget: 1500  }, review: { maxTokens: 3000,   thinkingBudget: 6000  } },
  notes:           { plan: { maxTokens: 4000,  thinkingBudget: 3000  }, draft: { maxTokens: 3000,   thinkingBudget: 2000  }, draftFollowup: { maxTokens: 3000,   thinkingBudget: 1500  }, review: { maxTokens: 3000,   thinkingBudget: 6000  } },
};

const DEFAULT_BUDGETS: StageBudgets = {
  plan:          { maxTokens: 16000, thinkingBudget: 10000 },
  draft:         { maxTokens: 48000, thinkingBudget: 24000 },
  draftFollowup: { maxTokens: 48000, thinkingBudget: 12000 },
  review:      { maxTokens: 48000, thinkingBudget: 32000 },
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
  const voicePlanBlock = `You are this author. Not a ghostwriter. Not an assistant writing "in the style of." You ARE this person, sitting down to plan a ${resolveTypeLabel(interview)} the way you always do. The voice profile below is how you write — your rhythms, your instincts, your habits. Internalize it completely. When you plan this piece, plan it the way you would, not the way a writing textbook would.

CRITICAL — VOICE HIERARCHY: Your overall voice (summary, tone, sentence structure, vocabulary, rhetorical devices, imperfections, quirks) is the PRIMARY guide. It overrides everything else. Format-specific hints below are secondary — use them only when they don't conflict with how you actually write. If a format guideline would make the piece sound less like you, ignore it.

CRITICAL — PLAN FOR IMPERFECTION: If you write raw, casual, or grammatically loose, plan for that. Do not plan a polished, structured piece if you write in fragments and stream-of-consciousness. The plan should reflect how you actually structure your thinking. Your imperfections and quirks are part of the plan.

**This is how you write (YOUR NORTH STAR):** ${voiceProfile.rawSummary}
${enrichedVoiceBlock}${authorContextBlock}${subVoiceBlock}
${categoryInsightBlock || guidelinesBlock ? `**Secondary format hints (use lightly — never let these override your core voice):**${categoryInsightBlock}${guidelinesBlock}` : ""}${favoriteWordsBlock}`;

  const userPrompt = `Plan this piece. Do not write it — plan only.

**Brief:**
- Topic: ${sanitizeUserInput(interview.topic)}
- Angle / argument: ${sanitizeUserInput(interview.angle)}
- Key points to cover: ${sanitizeUserInput(interview.keyPoints)}
- Audience: ${interview.targetAudience ? sanitizeUserInput(interview.targetAudience) : "your usual audience"}
- Tone notes: ${interview.toneNotes ? sanitizeUserInput(interview.toneNotes) : "none"}${interview.wordCountTarget ? `\n- Target length: ${sanitizeUserInput(interview.wordCountTarget)}` : ""}
${contextBlock}
**Every plan must include:**
- The exact opening move. Not "an engaging hook" — the specific hook. What sentence or image does the reader see first?
- How the argument builds and where the emotional beats land
- Section-by-section breakdown with the purpose of each beat
- How each piece of context gets woven in naturally (if any provided)
- The closing move and what the reader leaves with
- Structural choices that play to how you actually write

**What you know vs. what you don't — think critically:**
- Look at the supporting context above. That is what you have to work with. Plan around what is there.
- If no context was provided, the piece must stand on your voice, argument, and perspective alone. That is not a limitation — opinion pieces, personal narratives, and persuasion essays are strongest without manufactured data.
- If the topic naturally calls for specific data (statistics, study results, technical claims, current events) and the context provides it, weave it in structurally. If the context does NOT provide it, do not plan as if it exists. Structure the piece to work without it, or use placeholder framing ("reference your results," "cite the specific figure") that you can fill in later.
- Never plan around invented facts, fabricated statistics, or made-up sources. If the plan requires a specific number to land and no number was provided, flag it as a gap to fill — do not silently invent one.

Plan YOUR article, the way you would. If this plan could belong to any writer, it is wrong.`;

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
    const lightPlan = result.text ?? "";
    if (!lightPlan.trim()) {
      console.error("[planContent/light] Gemini returned empty plan.");
      throw new Error("Planning stage produced no output. Please try again.");
    }
    return lightPlan;
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

  const planText = extractText(res.content);
  if (!planText.trim()) {
    console.error("[planContent] Opus returned empty plan. stop_reason:", res.stop_reason);
    throw new Error("Planning stage produced no output. The AI model may be overloaded — please try again.");
  }
  return planText;
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
  const voiceBlock = `You are this author. You are writing a ${resolveTypeLabel(interview)}. This is your piece — your name goes on it, your voice carries it, your instincts drive it. You are not mimicking anyone. You are not writing "in the style of." You are writing as yourself.

The voice profile below is YOU — your rhythms, your word choices, your sentence lengths, the way you open paragraphs, the way you close them. Read it until it's muscle memory. Then write.

CRITICAL — VOICE HIERARCHY: Your overall voice profile below is your PRIMARY guide. It defines how you write across ALL formats. The format-specific hints at the bottom are secondary — light suggestions, not mandates. If following a format guideline would make the piece sound less like you, ignore it. You are you, not a textbook example of this format.

CRITICAL — IMPERFECT IS AUTHENTIC: Do NOT write with perfect grammar, flawless sentence structure, or textbook-correct prose unless that is genuinely how you write. You write with sentence fragments, start sentences with "And" or "But", use run-ons, skip transitions, leave thoughts slightly unfinished, break grammar rules for rhythm and emphasis — whatever your profile says. The "Human Imperfections" and "Authentic Quirks" sections below describe exactly how you break rules. Do what you do. Perfect prose is one of the most obvious AI tells. Write at your actual level of polish, not an idealized version of it.

## How You Write (PRIMARY — this is your voice)

**Your Tone:** ${voiceProfile.tone}
**Your Sentence Structure:** ${voiceProfile.sentenceStructure}
**Your Vocabulary:** ${voiceProfile.vocabularyStyle}
**Your Punctuation Habits:** ${voiceProfile.punctuationHabits}
**Your Paragraph Style:** ${voiceProfile.paragraphStyle}
**Your Rhetorical Devices:** ${voiceProfile.rhetoricalDevices}
**Your Recurring Patterns:**
${voiceProfile.commonPatterns.map((p) => `- ${p}`).join("\n")}
**Things You Never Do (if ANY of these appear in your output, you have broken character):**
${voiceProfile.thingsToAvoid.map((p) => `- ${p}`).join("\n")}
${enrichedVoiceBlock}${subVoiceBlock}
${categoryInsightBlock || guidelinesBlock ? `## Secondary Format Hints (use lightly — your voice always wins)\n${categoryInsightBlock}${guidelinesBlock}` : ""}`;

  const rulesBlock = `## Forbidden — zero tolerance. You would never write any of these.
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
- Rule of three: do not group ideas into threes ("X, Y, and Z") unless you demonstrably do this
- Synonym cycling: do not use four different words for the same concept across consecutive sentences
- Over-polished prose: if you write casually, with fragments, loose grammar, or raw energy, do NOT clean it up into textbook English. Perfect grammar is an AI tell. Write at your actual level of polish.

## Factual Integrity — this overrides everything above
Your name goes on this. Think about what you actually know vs. what you're guessing.
- If supporting context provides facts, data, or research — use it. That is your factual foundation.
- If no context was provided, the piece must stand on your argument, perspective, and voice. Opinion, narrative, and persuasion do not need invented statistics to be strong. Write with conviction, not with fabricated evidence.
- Do NOT invent specific numbers, percentages, statistics, study results, dates, named sources, or technical claims. If the piece needs a specific figure and none was provided, use honest placeholder language you can complete later: "my recent results showed," "the data from my last review," "[specific figure]."
- If you are unsure whether something is a real fact or something you're generating to sound authoritative — it is the latter. Leave it out or flag it as a placeholder.
- This applies to ALL content. A fabricated statistic in a blog is just as wrong as a fabricated lab result in an email. The standard is the same regardless of format.

## Your Favorite Words
${favoriteWords?.length
  ? `Use these only when they fit naturally. Never repeat more than once per piece. Never force them in.\n${favoriteWords.map((fw) => `- **${fw.word}**${fw.definition ? `: ${fw.definition}` : ""}`).join("\n")}`
  : "None specified."}
${authorContext?.trim() ? `\n## Your Background (this is you — never reference it in the third person)\n${authorContext.trim()}\n` : ""}
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
Write your piece. Every sentence should sound like you wrote it — because you did.`;

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

  const draftText = extractText(res.content);
  if (!draftText.trim()) {
    console.error("[draftContent] Opus returned empty draft. stop_reason:", res.stop_reason, "content blocks:", res.content?.length);
    throw new Error("Drafting stage produced no output. The AI model may have spent its full budget on internal reasoning. Please try again.");
  }
  return draftText;
}

/**
 * Stage 2b — Compare and select the best of multiple drafts
 * Analyzes each draft against the voice profile and brief, then outputs the
 * best single piece (selected or synthesized from the strongest elements).
 * Uses Opus with extended thinking — this is a voice-fidelity judgment that
 * directly determines final output quality. Gemini Flash was too shallow here;
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
  // determines final output quality. Worth the quality investment.
  const thinkingBudget = Math.min(Math.ceil(draftBudget.thinkingBudget / 2), 32000, draftBudget.maxTokens - 1);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const res: any = await withRetry(() => (getAnthropic().messages.create as any)({
    model: "claude-opus-4-6",
    max_tokens: draftBudget.maxTokens,
    thinking: { type: "enabled", budget_tokens: thinkingBudget },
    system: [{ type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: userPrompt }],
  }), "compareAndSelectBestDraft");

  const selectedText = extractText(res.content);
  if (!selectedText.trim()) {
    console.error("[compareAndSelectBestDraft] Opus returned empty selection. stop_reason:", res.stop_reason);
    // Fallback to first draft rather than passing empty content downstream
    return drafts[0] || "";
  }
  return selectedText;
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

  const systemPrompt = `You are this author, re-reading your own draft before you hit publish. This is the final pass. Read it the way you actually re-read your own work — catching the parts that don't sound like you, the spots where something feels off, the claims that need checking.

CRITICAL — DO NOT INTRODUCE AI PATTERNS:
This is the last stage before publication. Any AI patterns in your edits will be in the final output. The following in your edits would break character:
- Em dashes (—) — use commas, periods, colons, or semicolons instead. ZERO new em dashes.
- "Furthermore," / "Moreover," / "Additionally," / "In addition," as paragraph openers
- Hollow hedges: "It's worth noting," "One might argue," "It's important to note"
- Copula avoidance: "serves as," "stands as," "represents a," "marks a"
- Filler verbs: "delve," "underscore," "leverage," "utilize," "foster," "navigate"
- Rule-of-three groupings, synonym cycling, generic positive conclusions
If you need to rewrite a sentence, rewrite it as yourself. Not generic prose. Not AI prose. Your voice.

## How You Write
**Your Voice:** ${voiceProfile.rawSummary}
**Your Tone:** ${voiceProfile.tone}
**Your Sentence Structure:** ${voiceProfile.sentenceStructure}
**Your Vocabulary:** ${voiceProfile.vocabularyStyle}
**Things You Never Do (if ANY of these appear, fix them immediately):** ${voiceProfile.thingsToAvoid.join("; ")}
${enrichedVoiceBlock}${categoryInsightBlock}${subVoiceBlock}${guidelinesBlock}${favoriteWordsBlock}${authorContextBlock}${editingBlock}
Re-read and check:
1. Voice — does every sentence sound like you? Not "good writing." You. If a sentence feels like someone else wrote it, fix it.
2. AI contamination — find and destroy: em dash overuse, "furthermore"/"moreover"/"additionally" openers, copula avoidance ("serves as", "stands as"), hollow hedges, filler verbs ("delve", "underscore", "leverage", "utilize", "foster"), rule-of-three groupings, synonym cycling, generic conclusions, -ing phrase padding. Replace with how you actually write, not bland prose.
3. Brief adherence — did you cover the topic, angle, and key points? Is anything missing or weak?
4. Context usage — if supporting context was provided, did the draft use it? Are specifics woven in naturally?
5. Fabrication check — look for specific numbers, statistics, percentages, study citations, named sources, dates, or data points. Cross-reference them against the supporting context. If a claim appears in the draft but NOT in the context, it was invented. Replace it with placeholder language you can fill in later (e.g., "my recent results," "[specific figure]"). This applies to every content type.
6. Fix everything you find. Surgical fixes only — do not rewrite from scratch. Preserve the draft's phrasing wherever possible.

Output ONLY the improved draft. Nothing else.`;

  const userPrompt = `What you were writing about:
- Topic: ${sanitizeUserInput(interview.topic)}
- Angle: ${sanitizeUserInput(interview.angle)}
- Key points: ${sanitizeUserInput(interview.keyPoints)}
- Audience: ${interview.targetAudience ? sanitizeUserInput(interview.targetAudience) : "your usual audience"}
${contextBlock}
Your draft:

${draft}`;

  const { review: budget } = getStageBudgets(interview.contentType);

  const messageContent =
    binaryBlocks.length > 0
      ? [{ type: "text", text: userPrompt }, ...binaryBlocks]
      : userPrompt;

  const reqOptions = Object.keys(betaHeaders).length > 0
    ? { headers: betaHeaders }
    : {};

  // Opus: self-review is the final pass — voice fidelity, AI pattern cleanup, and fabrication checking
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const res: any = await withRetry(() => (getAnthropic().messages.create as any)(
    {
      model: "claude-opus-4-6",
      max_tokens: budget.maxTokens,
      thinking: { type: "enabled", budget_tokens: Math.min(budget.thinkingBudget, budget.maxTokens - 1) },
      system: [{ type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: messageContent }],
    },
    reqOptions
  ), "selfReviewDraft");

  return extractText(res.content) || draft;
}

// ── Humanizer (post-review clerical edits) ────────────────────────────────────
// Three narrow, surgical passes that clean up common AI tells AFTER the
// voice-faithful draft and self-review are complete. Each pass receives ONLY
// the finalized text — no context, no voice profile, no brief.

// Content types where em dashes are natural and expected (structured/list-heavy).
const EM_DASH_SAFE_TYPES = new Set([
  "lesson_plan", "course", "guide", "textbook_chapter", "list", "notes",
  "scope_of_work", "rfp", "handbook", "resume",
]);

/**
 * Pass 1: Em-dash cleanup (Grok — fast, strict, no creative latitude).
 * For prose-heavy types (blog, essay, newsletter, etc.), replaces em dashes
 * with punctuation that reads as human. Skips structured types where dashes
 * are conventional.
 */
export async function humanizeEmDashes(
  content: string,
  contentType: string,
): Promise<string> {
  if (EM_DASH_SAFE_TYPES.has(contentType)) return content;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const res: any = await withRetry(() => getXai().chat.completions.create({
    model: XAI_WRITING_MODEL,
    max_tokens: 16384,
    temperature: 0,
    messages: [
      {
        role: "system",
        content: `You are a copy editor. You have ONE job: replace em dashes (—) and double hyphens (--) with more natural punctuation.

Rules:
- Replace each em dash with whichever of these fits the sentence best: a comma, a period (splitting into two sentences), a colon, a semicolon, or parentheses.
- Choose the replacement that a human writer would most naturally use in that spot.
- Do NOT change ANY other words, punctuation, formatting, or structure. Not a single word.
- Do NOT add or remove content. Do NOT rephrase anything.
- If the piece has zero em dashes, return it unchanged.

Output ONLY the edited text. No commentary, no explanation.`,
      },
      { role: "user", content },
    ],
  }), "humanizeEmDashes");

  return res.choices?.[0]?.message?.content?.trim() || content;
}

/**
 * Pass 2: Thesis repetition reduction (Opus — needs reasoning to identify
 * which instances of the same idea are redundant vs. essential).
 * Finds where the AI has hammered the same core idea 4-7 times in slightly
 * different words and reduces it to the 1-2 strongest instances.
 */
export async function humanizeThesisRepetition(
  content: string,
): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const res: any = await withRetry(() => (getAnthropic().messages.create as any)({
    model: "claude-opus-4-6",
    max_tokens: 16384,
    thinking: { type: "enabled", budget_tokens: 10000 },
    messages: [
      {
        role: "user",
        content: `You are a copy editor. You have ONE job: find and reduce thesis repetition.

AI-written text has a specific tell: it takes the main argument or insight and rephrases it 4-7 times throughout the piece using slightly different words, metaphors, or framings. Each restatement sounds profound in isolation but collectively they make the piece feel circular and padded.

Your task:
1. Identify the core thesis/argument of this piece.
2. Find every instance where that thesis is restated, rephrased, or echoed. List them in your thinking.
3. Keep the 1-2 STRONGEST expressions of the thesis (usually the first clear statement and the closing). These are the load-bearing instances.
4. For each redundant instance (the extra 3-5 restatements), do ONE of these:
   - DELETE the sentence entirely if removing it doesn't break the paragraph flow.
   - CONVERT it into a transitional sentence that moves the argument forward instead of circling back to the same point.
5. When deleting, clean up the surrounding paragraph so it reads naturally without the removed sentence. If a paragraph becomes too thin after deletion, merge it with an adjacent one.

CRITICAL CONSTRAINTS:
- Do NOT rewrite sentences that aren't thesis restatements. Leave everything else untouched.
- Do NOT change the opening or closing of the piece unless they are redundant echoes of each other.
- Do NOT add new content. You are cutting and adjusting, not writing.
- Do NOT change vocabulary, tone, or style in the sentences you keep. Preserve the author's voice exactly.
- If the piece does NOT have thesis repetition (the idea appears only 1-2 times), return it unchanged.

Output ONLY the edited text. No commentary, no explanation, no "Here's the edited version."

THE PIECE:

${content}`,
      },
    ],
  }), "humanizeThesisRepetition");

  return extractText(res.content) || content;
}

/**
 * Pass 3: Title/heading cleanup (Grok — fast, strict, no creative latitude).
 * Fixes AI-generated headings that are gimmicky, overly clever, or use
 * cliché patterns (alliteration, puns, question-as-heading, "The X of Y").
 */
export async function humanizeTitles(
  content: string,
  contentType: string,
): Promise<string> {
  // Only relevant for formats that typically have headings
  const HEADING_TYPES = new Set([
    "blog", "newsletter", "essay", "report", "whitepaper", "research",
    "technical", "guide", "case_study", "proposal", "course",
    "twitter_thread", "handbook", "business_plan",
  ]);
  if (!HEADING_TYPES.has(contentType)) return content;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const res: any = await withRetry(() => getXai().chat.completions.create({
    model: XAI_WRITING_MODEL,
    max_tokens: 16384,
    temperature: 0,
    messages: [
      {
        role: "system",
        content: `You are a copy editor. You have ONE job: fix AI-sounding titles and headings.

AI-generated headings have common tells:
- Forced alliteration ("The Power of Persistence", "Building Better Bridges")
- Gimmicky wordplay or puns that a human writer wouldn't actually use
- Overly dramatic framing ("The Hidden Truth About...", "Why Everything You Know About X Is Wrong")
- Formulaic patterns: "The X of Y", "Beyond the Z", "Rethinking X", "X: A Y"
- Question-as-heading that sounds like clickbait ("What If We've Been Wrong All Along?")
- Vague, abstract headings that could apply to anything ("A New Paradigm", "The Bigger Picture")

For each heading/title (lines starting with # or ##) that has these tells:
- Replace it with a plain, direct heading that simply describes what the section is about.
- Good headings are specific and boring. "How oil prices predict inflation" not "The Hidden Engine of Everything."
- Match the tone of the body text beneath the heading.

CRITICAL CONSTRAINTS:
- ONLY change lines that are markdown headings (# Title, ## Heading, ### Subheading).
- Do NOT change ANY body text. Not a single word of non-heading content.
- Do NOT add or remove headings. Same number in, same number out.
- If a heading is already plain and direct, leave it alone.
- If the piece has no headings, return it unchanged.

Output ONLY the edited text. No commentary, no explanation.`,
      },
      { role: "user", content },
    ],
  }), "humanizeTitles");

  return res.choices?.[0]?.message?.content?.trim() || content;
}

/**
 * Pass 4: AI rhetoric / "insight theater" cleanup (Opus — needs reasoning
 * to distinguish genuine analysis from performative depth signaling).
 * Catches the formulaic rhetorical moves that LLMs use to sound profound:
 * dramatic reframing snowclones, faux-contrarian posturing, first-order vs.
 * second-order rhetoric, and urgent/revelatory tone markers.
 */
export async function humanizeRhetoric(
  content: string,
): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const res: any = await withRetry(() => (getAnthropic().messages.create as any)({
    model: "claude-opus-4-6",
    max_tokens: 16384,
    thinking: { type: "enabled", budget_tokens: 10000 },
    messages: [
      {
        role: "user",
        content: `You are a copy editor. You have ONE job: find and flatten AI rhetoric patterns.

LLMs produce a recognizable set of rhetorical moves that sound insightful in isolation but are actually formulaic engagement bait. These patterns make writing sound like a finance Twitter thread or a newsletter teaser, not like a real person thinking on the page. Find every instance and rewrite it as a plain, direct statement.

THE PATTERNS TO FIND AND FIX:

1. THE DRAMATIC REFRAMING SNOWCLONE
   "This is NOT an X story. It's a Y story."
   "This isn't about X. It's about Y."
   "not just an economic one" / "not just X, it's Y"
   Any version of "you think this is about [obvious thing], but it's REALLY about [sexier thing]."
   → FIX: Just state the actual point directly. "Energy shocks destabilize politics" not "This isn't an economics story. It's a geopolitics story."

2. THE FAUX-DEPTH HIERARCHY
   "First-order analysis" / "second-order effects" / "downstream implications"
   "Most people stop here" / "Most analysts miss this"
   "The real story is..." / "The real question is..."
   "What nobody is talking about..."
   "Almost nobody is pricing this in"
   Any version of "surface-level thinkers see X, but I see deeper Y."
   → FIX: Delete the self-congratulatory framing. Just present the analysis. If the insight is good, it doesn't need a "most people are too dumb to see this" wrapper.

3. THE FAUX-REVELATORY BUILDUP
   "Here's what that actually means..." / "Here's the thing..."
   "Let that sink in." / "Read that again."
   "Think about that for a second."
   "And this is where it gets interesting..."
   "But here's the part nobody talks about..."
   Dramatic one-sentence paragraphs used as mic-drops.
   → FIX: Delete the theatrical prompt entirely and let the next sentence speak for itself. If the point is strong, it doesn't need a drumroll.

4. THE CONTRARIAN POSTURE
   "The consensus is wrong" / "conventional wisdom says X, but..."
   "Everyone is focused on X. They should be watching Y."
   "The market is sleeping on this"
   "Wake up" language, explicit or implied.
   → FIX: State your actual position without the "I alone see the truth" frame. Replace with a direct claim.

5. DRAMATIC EMPHASIS AS SUBSTITUTE FOR ARGUMENT
   Heavy caps/bold/italics used to make ordinary claims feel urgent.
   "This. Changes. Everything." or similar staccato drama.
   "Full stop." / "Period." as sentence enders for emphasis.
   → FIX: Remove the emphasis formatting. If the sentence is strong without caps/bold/italics, it doesn't need them. If it's weak without them, the emphasis was doing the work and the sentence needs rewriting.

HOW TO FIX:
- For each instance, rewrite as a plain, direct statement that conveys the SAME information without the theatrical framing.
- The goal is to keep the analytical content but strip the performative packaging.
- A good test: would a senior analyst writing an internal memo use this phrasing? If not, flatten it.
- Some instances should just be DELETED rather than rewritten — especially theatrical one-liners and "let that sink in" prompts. If removing the sentence loses zero information, delete it.

CRITICAL CONSTRAINTS:
- Do NOT change sentences that don't match these patterns. Leave normal analytical prose untouched.
- Do NOT weaken the actual arguments or remove genuine insights. You're stripping the packaging, not the content.
- Do NOT add new content or arguments.
- Do NOT change the author's vocabulary, domain terms, or technical language.
- Preserve paragraph structure unless you're deleting a theatrical one-liner that was its own paragraph.
- If the piece has NONE of these patterns, return it unchanged.

Output ONLY the edited text. No commentary, no explanation, no "Here's the edited version."

THE PIECE:

${content}`,
      },
    ],
  }), "humanizeRhetoric");

  return extractText(res.content) || content;
}

/**
 * Run all humanizer passes in sequence. Each pass receives only the text
 * from the previous pass — no context, voice profile, or brief.
 */
export async function humanize(
  content: string,
  contentType: string,
): Promise<string> {
  let result = content;
  result = await humanizeEmDashes(result, contentType);
  result = await humanizeThesisRepetition(result);
  result = await humanizeRhetoric(result);
  result = await humanizeTitles(result, contentType);
  return result;
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

