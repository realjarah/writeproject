import Anthropic from "@anthropic-ai/sdk";

// Re-export shared types and constants from the client-safe module
export type {
  ContextItemTag,
  ContextItem,
  GenerationContext,
  InterviewAnswers,
  VoiceAnalysis,
  LabeledSample,
} from "./content-types";
export { CONTENT_TYPE_LABELS, CONTENT_TYPE_GROUPS } from "./content-types";

import type {
  VoiceAnalysis,
  LabeledSample,
  ContextItem,
  GenerationContext,
  InterviewAnswers,
} from "./content-types";
import { CONTENT_TYPE_LABELS } from "./content-types";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

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

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 10000,
    messages: [
      {
        role: "user",
        content: `You are a writing style analyst. Analyze the following writing samples from a single author and extract a detailed voice profile that could be used to ghost-write in their exact style.
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
  "categoryInsights": { "blog": "how their voice shows up specifically in long-form", "thread": "their thread/social style", "caption": "their caption style" },
  "contentGuidelines": {
    "[contentType]": ["6–8 specific, actionable guidelines bridging THIS author's voice with that format's conventions. Each must be specific to this author's actual patterns—not generic writing advice. A ghostwriter must be able to apply each one immediately."]
  },
  "topicInsights": {
    "[broad topic]": "How this author specifically approaches this subject area — recurring angles, framing, terminology, emotional register, and argumentative patterns they use when writing about this topic, regardless of format."
  }
}

Rules:
- Only include keys in categoryInsights that are represented in the samples. Omit the field entirely if only one format is present.
- Only include keys in contentGuidelines for formats actually represented in the samples. Each value is an array of 6–8 strings. Guidelines must reflect this author's specific tendencies—not boilerplate format advice.
- topicInsights: Identify recurring subject areas / themes across samples. Use BROAD topic labels (e.g. "health & fitness" not "testosterone", "AI & technology" not "ChatGPT", "leadership & management" not "remote work"). Include topics that appear in 2+ samples across ANY format. For each, describe the author's specific angle, framing, and voice when writing about that subject. Omit the field entirely if no recurring topics are detected.`,
      },
    ],
  });

  const raw =
    message.content[0].type === "text" ? message.content[0].text : "";
  // Strip markdown code fences if the model wraps the JSON despite instructions
  const text = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
  return JSON.parse(text) as VoiceAnalysis;
}


// ── Shared constants ────────────────────────────────────────────────────────
// CONTENT_TYPE_LABELS and CONTENT_TYPE_GROUPS are imported from ./content-types

const WORD_GUIDANCE: Record<string, string> = {
  blog:          "600–1200 words unless the brief specifies otherwise. Short paragraphs, natural web formatting.",
  essay:         "500–1500 words. Clear thesis, structured argument, strong opening and close.",
  newsletter:    "Conversational, scannable. Clear sections with headers. 200–600 words per section.",
  whitepaper:    "Write as long as the scope demands — cover the full argument completely. Abstract → executive summary → body sections → conclusion. Data-backed throughout. Cite all [REFERENCE] context items.",
  email:         "Subject line first, then body. Short paragraphs, one clear ask or CTA. 50–400 words.",
  report:        "Structured with headers. Executive summary first. Data-driven, precise language. Write as long as the scope demands — never truncate to hit a word count. Attribute all [REFERENCE] context items as sources.",
  press_release: "Inverted pyramid: headline + dateline + lead (who/what/when/where/why) + body + boilerplate. 400–600 words.",
  proposal:      "Executive summary → problem → solution → timeline → budget (if provided) → next steps. Persuasive but factual.",
  case_study:    "Challenge → approach → results → lessons learned. 800–2000 words. Specific, quantified outcomes.",
  resume:        "Reverse chronological unless specified. Achievement-focused bullets. Quantify impact. No filler. ATS-friendly.",
  cover_letter:  "3–4 paragraphs: hook → specific connection to role → evidence → closing ask. 250–400 words.",
  research:      "Write as long as the scope demands — do not truncate to hit a word count. Academic structure: abstract, introduction, literature review, methodology, results, discussion, conclusion, references. Cover every facet of the topic. Cite every [REFERENCE] context item in-text and in the references section.",
  technical:     "Write as long as the scope demands — complete coverage beats brevity. Precision over style. Code blocks and numbered steps where relevant. Headers for navigation. Match the specified audience level. Cite [REFERENCE] context items with inline links or footnotes.",
  social:          "Single post. Twitter/X: under 280 characters total. LinkedIn: 150–300 words with line breaks. No markdown symbols.",
  twitter_thread:  "Output each tweet separated by '---' on its own line (e.g. tweet text\\n---\\nnext tweet). Each tweet MUST be under 280 characters — this is a hard platform limit, count carefully. Aim for 5–12 tweets. Each tweet should flow naturally into the next but stand alone. Plain text only — no markdown bold/italics/headers/bullets. Open strong, close with a hook or call to action.",
  caption:       "1–4 sentences. Conversational, relevant to the image or moment.",
  text_message:  "1–3 sentences max. Casual, direct. Match the sender's register.",
  speech:        "Write for the ear, not the eye. Short sentences, natural pauses, direct address. Memorable opening and close.",
  script:        "Label speakers or segments clearly. Write for spoken delivery. Conversational but structured. Include stage directions if helpful.",
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
  const uploaded = await (anthropic.beta as any).files.upload({ file });
  if (!uploaded?.id) {
    throw new Error(`Files API returned no id for ${fileName}`);
  }
  return uploaded.id;
}

/**
 * Upload all binary context items (PDFs, images) to the Files API once.
 * Mutates items in-place: sets `fileId` and clears `data` to free memory.
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
        // Clear base64 data to free memory; keep fileId for all subsequent calls
        return { ...item, fileId, data: undefined };
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
      await (anthropic.beta as any).files.delete(item.fileId);
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

export async function generateContent(
  voiceProfile: VoiceAnalysis,
  interview: InterviewAnswers,
  context?: GenerationContext
): Promise<ReadableStream<Uint8Array>> {
  const contentTypeLabels: Record<string, string> = {
    blog: "a blog post / article",
    social: "a social media post (e.g. Twitter/X or LinkedIn)",
    caption: "a short caption (e.g. Instagram or TikTok)",
  };

  const wordGuidance: Record<string, string> = {
    blog: interview.wordCountTarget
      ? `Target length: ${interview.wordCountTarget} words.`
      : "Aim for 600-1200 words unless the topic calls for more or less.",
    social:
      "Keep it punchy — typically 50-280 characters for Twitter/X, or 150-300 words for LinkedIn. Match the platform feel.",
    caption:
      "Short and punchy — 1 to 4 sentences max. Can include relevant hashtags if the author's samples suggest they use them.",
  };

  const systemPrompt = `You are a ghost-writer. Your ONLY job is to write ${contentTypeLabels[interview.contentType]} that sounds EXACTLY like the author described below. You must not reveal you are an AI, not add disclaimers, and not deviate from their voice under any circumstances.

## Author Voice Profile

**Tone:** ${voiceProfile.tone}

**Sentence Structure:** ${voiceProfile.sentenceStructure}

**Vocabulary Style:** ${voiceProfile.vocabularyStyle}

**Punctuation Habits:** ${voiceProfile.punctuationHabits}

**Paragraph Style:** ${voiceProfile.paragraphStyle}

**Rhetorical Devices:** ${voiceProfile.rhetoricalDevices}

**Recurring Patterns:**
${voiceProfile.commonPatterns.map((p) => `- ${p}`).join("\n")}

**Things to Avoid (not part of their voice):**
${voiceProfile.thingsToAvoid.map((p) => `- ${p}`).join("\n")}

**Style Summary:** ${voiceProfile.rawSummary}

## Output Rules
- Write ONLY the finished piece. No preamble, no "Here's your post:", no meta-commentary.
- ${wordGuidance[interview.contentType]}
- Sound like a real human wrote this — their human.`;

  const contextBlock = context ? buildContextBlock(context) : "";
  const binaryBlocks = context ? buildBinaryBlocks(context) : [];
  const betaHeaders = getBetaHeaders(binaryBlocks);

  const userPrompt = `Write ${contentTypeLabels[interview.contentType]} using the following brief:

**Topic:** ${sanitizeUserInput(interview.topic)}
**Angle / Point of View:** ${sanitizeUserInput(interview.angle)}
**Key Points to Cover:** ${sanitizeUserInput(interview.keyPoints)}
**Sources / Data to Reference:** ${
    interview.sourcesOrData ? sanitizeUserInput(interview.sourcesOrData) : "None provided — draw on general knowledge."
  }
**Target Audience:** ${interview.targetAudience ? sanitizeUserInput(interview.targetAudience) : "The author's usual audience."}
**Extra Tone Notes:** ${interview.toneNotes ? sanitizeUserInput(interview.toneNotes) : "None."}
${contextBlock}
Write it now.`;

  const messageContent =
    binaryBlocks.length > 0
      ? [{ type: "text", text: userPrompt }, ...binaryBlocks]
      : userPrompt;

  const streamOptions = Object.keys(betaHeaders).length > 0
    ? { headers: betaHeaders }
    : {};

  const stream = await anthropic.messages.stream(
    {
      model: "claude-opus-4-6",
      max_tokens: 4096,
      system: systemPrompt,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      messages: [{ role: "user", content: messageContent as any }],
    },
    streamOptions
  );

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
  // Academic / very long-form
  research:      { plan: { maxTokens: 32000, thinkingBudget: 16000 }, draft: { maxTokens: 128000, thinkingBudget: 64000 }, draftFollowup: { maxTokens: 128000, thinkingBudget: 32000 }, humanize: { maxTokens: 128000, thinkingBudget: 64000 } },
  whitepaper:    { plan: { maxTokens: 32000, thinkingBudget: 16000 }, draft: { maxTokens: 128000, thinkingBudget: 64000 }, draftFollowup: { maxTokens: 128000, thinkingBudget: 32000 }, humanize: { maxTokens: 128000, thinkingBudget: 64000 } },
  technical:     { plan: { maxTokens: 32000, thinkingBudget: 16000 }, draft: { maxTokens: 128000, thinkingBudget: 48000 }, draftFollowup: { maxTokens: 128000, thinkingBudget: 24000 }, humanize: { maxTokens: 100000, thinkingBudget: 48000 } },
  case_study:    { plan: { maxTokens: 16000, thinkingBudget: 10000 }, draft: { maxTokens: 80000,  thinkingBudget: 32000 }, draftFollowup: { maxTokens: 80000,  thinkingBudget: 16000 }, humanize: { maxTokens: 64000,  thinkingBudget: 32000 } },
  // Standard long-form
  report:        { plan: { maxTokens: 16000, thinkingBudget: 10000 }, draft: { maxTokens: 80000,  thinkingBudget: 32000 }, draftFollowup: { maxTokens: 80000,  thinkingBudget: 16000 }, humanize: { maxTokens: 64000,  thinkingBudget: 32000 } },
  essay:         { plan: { maxTokens: 16000, thinkingBudget: 10000 }, draft: { maxTokens: 64000,  thinkingBudget: 32000 }, draftFollowup: { maxTokens: 64000,  thinkingBudget: 16000 }, humanize: { maxTokens: 64000,  thinkingBudget: 32000 } },
  speech:        { plan: { maxTokens: 16000, thinkingBudget: 10000 }, draft: { maxTokens: 48000,  thinkingBudget: 24000 }, draftFollowup: { maxTokens: 48000,  thinkingBudget: 12000 }, humanize: { maxTokens: 48000,  thinkingBudget: 24000 } },
  script:        { plan: { maxTokens: 16000, thinkingBudget: 10000 }, draft: { maxTokens: 48000,  thinkingBudget: 24000 }, draftFollowup: { maxTokens: 48000,  thinkingBudget: 12000 }, humanize: { maxTokens: 48000,  thinkingBudget: 24000 } },
  proposal:      { plan: { maxTokens: 16000, thinkingBudget: 10000 }, draft: { maxTokens: 64000,  thinkingBudget: 32000 }, draftFollowup: { maxTokens: 64000,  thinkingBudget: 16000 }, humanize: { maxTokens: 48000,  thinkingBudget: 32000 } },
  // Business medium — humanizer needs serious thinking to scan, rewrite, audit, and revise
  blog:          { plan: { maxTokens: 16000, thinkingBudget: 10000 }, draft: { maxTokens: 32000,  thinkingBudget: 16000 }, draftFollowup: { maxTokens: 32000,  thinkingBudget: 10000 }, humanize: { maxTokens: 32000,  thinkingBudget: 24000 } },
  newsletter:    { plan: { maxTokens: 12000, thinkingBudget: 8000  }, draft: { maxTokens: 24000,  thinkingBudget: 12000 }, draftFollowup: { maxTokens: 24000,  thinkingBudget: 8000  }, humanize: { maxTokens: 24000,  thinkingBudget: 16000 } },
  press_release: { plan: { maxTokens: 12000, thinkingBudget: 8000  }, draft: { maxTokens: 16000,  thinkingBudget: 10000 }, draftFollowup: { maxTokens: 16000,  thinkingBudget: 6000  }, humanize: { maxTokens: 16000,  thinkingBudget: 12000 } },
  resume:        { plan: { maxTokens: 12000, thinkingBudget: 8000  }, draft: { maxTokens: 16000,  thinkingBudget: 10000 }, draftFollowup: { maxTokens: 16000,  thinkingBudget: 6000  }, humanize: { maxTokens: 16000,  thinkingBudget: 10000 } },
  cover_letter:  { plan: { maxTokens: 10000, thinkingBudget: 6000  }, draft: { maxTokens: 12000,  thinkingBudget: 8000  }, draftFollowup: { maxTokens: 12000,  thinkingBudget: 5000  }, humanize: { maxTokens: 12000,  thinkingBudget: 10000 } },
  email:         { plan: { maxTokens: 8000,  thinkingBudget: 4000  }, draft: { maxTokens: 8000,   thinkingBudget: 4000  }, draftFollowup: { maxTokens: 8000,   thinkingBudget: 3000  }, humanize: { maxTokens: 8000,   thinkingBudget: 8000  } },
  // Short-form — humanizer still needs full audit even for short pieces
  social:          { plan: { maxTokens: 6000,  thinkingBudget: 4000  }, draft: { maxTokens: 4000,  thinkingBudget: 3000  }, draftFollowup: { maxTokens: 4000,  thinkingBudget: 2000  }, humanize: { maxTokens: 4000,  thinkingBudget: 8000  } },
  twitter_thread:  { plan: { maxTokens: 8000,  thinkingBudget: 6000  }, draft: { maxTokens: 12000, thinkingBudget: 8000  }, draftFollowup: { maxTokens: 12000, thinkingBudget: 5000  }, humanize: { maxTokens: 12000, thinkingBudget: 16000 } },
  caption:         { plan: { maxTokens: 4000,  thinkingBudget: 3000  }, draft: { maxTokens: 3000,  thinkingBudget: 2000  }, draftFollowup: { maxTokens: 3000,  thinkingBudget: 1500  }, humanize: { maxTokens: 3000,  thinkingBudget: 6000  } },
  text_message:    { plan: { maxTokens: 4000,  thinkingBudget: 3000  }, draft: { maxTokens: 3000,  thinkingBudget: 2000  }, draftFollowup: { maxTokens: 3000,  thinkingBudget: 1500  }, humanize: { maxTokens: 3000,  thinkingBudget: 6000  } },
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

/** Content types that use the lightweight pipeline (Sonnet for planning, no self-review).
 *  Only truly short-form content — threads, emails, and resumes are voice-critical
 *  enough to warrant the full pipeline. */
export const LIGHT_TYPES = new Set([
  "caption", "text_message", "social",
]);

/** Content types where self-review is skipped (humanizer already catches AI patterns) */
export const SKIP_SELF_REVIEW_TYPES = new Set([
  "newsletter", "press_release", "cover_letter",
  // All light types also skip self-review
  "caption", "text_message", "social",
  // NOTE: email and resume intentionally get self-review — they often reference
  // specific data (medical results, job history) that needs fabrication checking.
]);

// ── Voice fingerprint (condensed samples for follow-up calls) ────────────────

/**
 * Build a condensed "voice fingerprint" from writing samples.
 * Includes short representative excerpts (opening + closing of each sample)
 * instead of full text. Used in draft calls where the plan stage already
 * absorbed the complete samples.
 */
export function buildVoiceFingerprint(
  samples: { content: string; category: string }[]
): string {
  if (!samples.length) return "";

  const excerpts = samples.map((s, i) => {
    const words = s.content.trim().split(/\s+/);
    // Take first ~80 words and last ~40 words as representative excerpts
    const opening = words.slice(0, 80).join(" ");
    const closing = words.length > 150 ? "\n[…]\n" + words.slice(-40).join(" ") : "";
    return `### Excerpt ${i + 1} [${s.category}]\n${opening}${closing}`;
  });

  return `\n## Voice Excerpts (representative openings/closings from the author's writing)\n${excerpts.join("\n\n")}\n`;
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

  const systemPrompt = `You are a research assistant preparing a structured brief for a ghostwriter.${contextHint}

Use the web_search tool to find relevant, current information. After researching, produce a well-structured markdown brief covering:
- Key facts, figures, and data points with sources
- Relevant statistics or recent studies
- Important context, background, or history
- Notable arguments, perspectives, or counterarguments
- Specific examples or case studies where relevant
- Recent developments the writer should know

Be specific and factual. Reference sources inline (e.g. "According to [Source], ..."). Format clearly with headers and bullets. The ghostwriter will use this directly as context.`;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const messages: any[] = [{ role: "user", content: prompt }];

  // Tool loop — handles web_search tool_use/tool_result cycle
  for (let round = 0; round < 10; round++) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res: any = await (anthropic.messages.create as any)({
      model: "claude-sonnet-4-6",
      max_tokens: 8000,
      tools: [{ type: "web_search_20250305", name: "web_search" }],
      system: systemPrompt,
      messages,
    });

    if (res.stop_reason !== "tool_use") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (extractText(res.content as any) || "Research could not be completed.");
    }

    // Push assistant turn, then return tool results so Claude can continue
    messages.push({ role: "assistant", content: res.content });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const toolResults = (res.content as any[])
      .filter((b) => b.type === "tool_use")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((b: any) => ({
        type: "tool_result",
        tool_use_id: b.id,
        // web_search_20250305 embeds results in the block; pass them back as content
        content: b.content != null ? JSON.stringify(b.content) : "Search completed.",
      }));

    if (toolResults.length === 0) break;
    messages.push({ role: "user", content: toolResults });
  }

  // Fallback: return text from the last assistant message in the loop
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "assistant") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const text = extractText(Array.isArray(messages[i].content) ? messages[i].content : []);
      if (text) return text;
    }
  }
  return "Research could not be completed.";
}

// ── Topic insights helper ────────────────────────────────────────────────────

/**
 * Build a prompt block containing all topic insights from the voice profile.
 * All topics are included — the model decides which are relevant to the current piece.
 */
function buildTopicInsightsBlock(voiceProfile: VoiceAnalysis): string {
  const topics = voiceProfile.topicInsights;
  if (!topics || Object.keys(topics).length === 0) return "";
  const lines = Object.entries(topics).map(
    ([topic, insight]) => `- **${topic}:** ${insight}`
  );
  return `\n**How this author approaches familiar topics (use any that are relevant):**\n${lines.join("\n")}\n`;
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
  sampleExamples?: { content: string; category: string }[],
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

  const topicInsightsBlock = buildTopicInsightsBlock(voiceProfile);

  const examplesBlock = sampleExamples?.length
    ? `\n**Author's Actual Writing (study before planning — match this voice exactly):**\n${
        sampleExamples
          .map((s, i) => `### Sample ${i + 1} [${s.category}]\n${s.content}`)
          .join("\n\n")
      }\n`
    : "";

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
  const voicePlanBlock = `You are ghost-writing a ${resolveTypeLabel(interview)}. The piece must be indistinguishable from this author's own work. Study the voice profile and samples below until you can hear them in your head. Every structural decision in your plan must serve this specific author's voice.
${examplesBlock}
**Author voice summary:** ${voiceProfile.rawSummary}
${authorContextBlock}${categoryInsightBlock}${topicInsightsBlock}${guidelinesBlock}${favoriteWordsBlock}`;

  const systemPrompt = [
    { type: "text", text: voicePlanBlock, cache_control: { type: "ephemeral" } },
  ];

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

**Factual integrity — non-negotiable:**
- Do NOT plan around specific facts, statistics, numbers, data points, study results, or named sources unless they appear in the supporting context above.
- If the topic naturally involves data (medical results, financial figures, research findings, performance metrics) and no context provides that data, plan the piece to work WITHOUT specific numbers. Use framing like "reference your recent results" or "mention the key findings" — leave room for the author to fill in their own specifics.
- A plan that invents data the author did not provide is worse than useless — it is dangerous.

Do not plan a generic article. Plan THIS author's article. If the plan could belong to any writer, it is wrong.`;

  const messageContent =
    binaryBlocks.length > 0
      ? [{ type: "text", text: userPrompt }, ...binaryBlocks]
      : userPrompt;

  const reqOptions = Object.keys(betaHeaders).length > 0
    ? { headers: betaHeaders }
    : {};

  const { plan: planBudget } = getStageBudgets(interview.contentType);

  // Light tier (caption, social, text_message): Sonnet without thinking —
  // planning a 1-4 sentence piece doesn't need Opus-level deliberation
  const isLight = LIGHT_TYPES.has(interview.contentType);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const res = await (anthropic.messages.create as any)(
    {
      model: isLight ? "claude-sonnet-4-6" : "claude-opus-4-6",
      max_tokens: planBudget.maxTokens,
      ...(isLight ? {} : { thinking: { type: "enabled", budget_tokens: planBudget.thinkingBudget } }),
      system: systemPrompt,
      messages: [{ role: "user", content: messageContent }],
    },
    reqOptions
  );

  return extractText(res.content);
}

/**
 * Stage 2 — Draft
 * Writes the raw first draft against the plan with full voice fidelity.
 *
 * @param isFollowup — If true, uses condensed voice fingerprint (excerpts) instead
 *   of full samples, and a reduced thinking budget. Used for draft 2 in deep tier
 *   where the plan stage already absorbed the complete samples.
 */
export async function draftContent(
  voiceProfile: VoiceAnalysis,
  interview: InterviewAnswers,
  plan: string,
  context?: GenerationContext,
  sampleExamples?: { content: string; category: string }[],
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

  const topicInsightsBlock = buildTopicInsightsBlock(voiceProfile);

  // Full samples for first draft, condensed fingerprint for follow-up drafts
  const examplesSection = sampleExamples?.length
    ? isFollowup
      ? buildVoiceFingerprint(sampleExamples)
      : `\n## Author's Actual Writing Samples (absorb these — write with the exact same voice)\n${
          sampleExamples
            .map((s, i) => `### Example ${i + 1} [${s.category}]\n${s.content}`)
            .join("\n\n")
        }\n`
    : "";

  const wordCountLine = interview.wordCountTarget
    ? `Target length: ${interview.wordCountTarget}. `
    : "";

  // Build system prompt as structured blocks for prompt caching.
  // The voice profile block (stable across calls) gets cache_control so the API
  // can reuse the KV cache from previous pipeline stages.
  const voiceBlock = `You are ghost-writing a ${resolveTypeLabel(interview)}. The output must be indistinguishable from this author's own work. Not "inspired by" their voice. Not "in the style of." Identical. If a reader who knows this author's writing can tell an AI wrote it, you have failed.

Read the voice profile and writing samples below. Internalize the rhythm, the word choices, the sentence lengths, the way they open paragraphs, the way they close them. Then write as them.

## Author Voice Profile

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
${examplesSection}${categoryInsightBlock}${topicInsightsBlock}${guidelinesBlock}`;

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

## Factual Integrity — this overrides everything else
- NEVER fabricate, invent, or guess specific facts, statistics, numbers, percentages, data points, dates, study results, or named sources.
- If the supporting context contains specific data, use it. If it does not, do NOT invent replacements.
- When the topic involves specifics the author has not provided (lab results, financial figures, performance metrics, research findings), use placeholder language the author can fill in: "your recent results showed," "the numbers from your last panel," "based on what you shared with me." Do NOT insert fake numbers.
- Fabricating data in someone's name — especially medical, legal, or financial data — is the single worst failure mode of this system. Treat it as more dangerous than any style violation above.

## Author's Favorite Words
${favoriteWords?.length
  ? `Use these words only when they fit naturally. Never repeat more than once per piece. Never force them in.\n${favoriteWords.map((fw) => `- **${fw.word}**${fw.definition ? `: ${fw.definition}` : ""}`).join("\n")}`
  : "None specified."}
${authorContext?.trim() ? `\n## Author Background (absorb this — never reference it directly)\n${authorContext.trim()}\n` : ""}
## Output
- The piece. Nothing else. No preamble. No meta-commentary. No "Here's the piece:" or "I hope this captures..."
- ${wordCountLine}${WORD_GUIDANCE[interview.contentType] ?? `This is a custom format ("${resolveTypeLabel(interview)}"). Use the provided writing examples as your primary guide for length, structure, and conventions. If no examples are available, write a well-structured piece that feels natural for this format.`}`;

  // Use structured system prompt with cache_control on the voice block
  // so the API can reuse KV cache across sequential pipeline calls
  const systemPrompt = [
    { type: "text", text: voiceBlock, cache_control: { type: "ephemeral" } },
    { type: "text", text: rulesBlock },
  ];

  const userPrompt = `Execute this structural plan:

${plan}

**Brief:**
- Topic: ${sanitizeUserInput(interview.topic)}
- Angle: ${sanitizeUserInput(interview.angle)}
- Key points: ${sanitizeUserInput(interview.keyPoints)}
${contextBlock}
Write the piece. Match the author's voice exactly. Every sentence must sound like them, not like you.`;

  const messageContent =
    binaryBlocks.length > 0
      ? [{ type: "text", text: userPrompt }, ...binaryBlocks]
      : userPrompt;

  const reqOptions = Object.keys(betaHeaders).length > 0
    ? { headers: betaHeaders }
    : {};

  const budgets = getStageBudgets(interview.contentType);
  const draftBudget = isFollowup ? budgets.draftFollowup : budgets.draft;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const res = await (anthropic.messages.create as any)(
    {
      model: "claude-opus-4-6",
      max_tokens: draftBudget.maxTokens,
      thinking: { type: "enabled", budget_tokens: draftBudget.thinkingBudget },
      system: systemPrompt,
      messages: [{ role: "user", content: messageContent }],
    },
    reqOptions
  );

  return extractText(res.content);
}

/**
 * Stage 2b — Compare and select the best of multiple drafts
 * Analyzes each draft against the voice profile and brief, then outputs the
 * best single piece (selected or synthesized from the strongest elements).
 * Uses Sonnet (not Opus) — this is analytical comparison, not creative generation.
 */
export async function compareAndSelectBestDraft(
  drafts: string[],
  voiceProfile: VoiceAnalysis,
  interview: InterviewAnswers
): Promise<string> {
  const { draft: draftBudget } = getStageBudgets(interview.contentType);

  const userPrompt = `Select the best of these ${drafts.length} drafts. The winner must sound like this specific author wrote it — not like AI. If neither draft meets that standard, take the best elements and make it meet the standard.

**Author Voice Profile:**
${voiceProfile.rawSummary}
- Tone: ${voiceProfile.tone}
- Sentence structure: ${voiceProfile.sentenceStructure}
- Vocabulary: ${voiceProfile.vocabularyStyle}
- Things this author NEVER does: ${voiceProfile.thingsToAvoid.join("; ")}

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

  const res = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: draftBudget.maxTokens,
    messages: [{ role: "user", content: userPrompt }],
  });

  return extractText(res.content);
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

  // Sonnet is sufficient for proposing a creative direction — it's reading
  // the draft and voice profile, not generating the actual prose
  const res = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    messages: [{ role: "user", content: userPrompt }],
  });

  const text = extractText(res.content);
  try {
    const clean = text
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```\s*$/, "")
      .trim();
    return JSON.parse(clean);
  } catch {
    return {
      direction: "Restructure the piece to lead with the strongest example first, then build the argument around it. Prioritize narrative momentum.",
    };
  }
}

/**
 * Stage 3 — Humanize
 * Strips AI patterns, audits itself, and produces the final polished piece.
 * Streams the output.
 */
export async function humanizeContent(
  draft: string,
  voiceProfile: VoiceAnalysis,
  humanizerInstructions: string,
  contentType: string = "blog",
  sampleExamples?: { content: string; category: string }[],
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
  const topicInsightsBlock = buildTopicInsightsBlock(voiceProfile);
  const fingerprintBlock = sampleExamples?.length
    ? buildVoiceFingerprint(sampleExamples)
    : "";
  const favoriteWordsBlock = favoriteWords?.length
    ? `\n## Author's Favorite Words (use naturally when they fit — never force)\n${favoriteWords.map((fw) => `- **${fw.word}**${fw.definition ? `: ${fw.definition}` : ""}`).join("\n")}\n`
    : "";
  const authorContextBlock = authorContext?.trim()
    ? `\n## Author Background\n${authorContext.trim()}\n`
    : "";

  // System prompt: humanizer.md instructions + author voice profile
  // Same prompt is used for all 3 passes — the instructions don't change,
  // just the input text gets cleaner each time
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

Apply every single pattern from the humanizer guide above. Miss nothing. Every em dash that doesn't belong, every "furthermore", every rule-of-three, every hollow hedge, every generic conclusion, every synonym cycle, every copula avoidance ("serves as", "stands as"), every filler phrase — find it and kill it.

Do not replace AI patterns with bland, voiceless prose. That is equally unacceptable. Replace them with THIS AUTHOR'S voice. Read the profile and excerpts below. That is how the output must read — like this specific person sat down and wrote it.

While humanizing, also watch for fabricated specifics — numbers, statistics, percentages, study citations, or data points that look suspiciously precise and were not provided as context. If you spot what appears to be an invented figure, replace it with honest placeholder language (e.g., "your recent results," "the data you mentioned," "[specific number]"). Do not let fabricated data survive into the final output.

Output the final text only. No commentary. No process notes. No preamble.

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
${fingerprintBlock}${categoryInsightBlock}${topicInsightsBlock}${guidelinesBlock}${favoriteWordsBlock}${authorContextBlock}`,
    },
  ];

  const { humanize: humanizeBudget } = getStageBudgets(contentType);
  const perPassBudget = Math.ceil(humanizeBudget.thinkingBudget / 3);

  // Run the humanizer 3 times. Each pass feeds its output into the next.
  // Pass 1 catches the obvious stuff. Pass 2 catches what pass 1 missed.
  // Pass 3 catches whatever is left. Same instructions every time.
  let current = draft;
  for (let pass = 1; pass <= 3; pass++) {
    onPassStart?.(pass, 3);
    const isLastPass = pass === 3;
    const passLabel = pass === 1
      ? `Humanize this ${typeLabel}. Apply every pattern from the humanizer guide. Strip every AI tell. Replace them with the author's voice from the profile above. Output the cleaned text only.`
      : `This text has been through ${pass - 1} humanization pass${pass > 2 ? "es" : ""} and AI patterns still remain. Go through it again. Find what was missed. Be more aggressive this time — anything that could be flagged as AI-generated needs to be rewritten in the author's voice. Output the cleaned text only.`;

    if (isLastPass) {
      // Stream the final pass back to the client
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const stream = await (anthropic.messages.stream as any)({
        model: "claude-opus-4-6",
        max_tokens: humanizeBudget.maxTokens,
        thinking: { type: "enabled", budget_tokens: perPassBudget },
        system: systemPrompt,
        messages: [{ role: "user", content: `${passLabel}\n\n${current}` }],
      });

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

    // Non-streaming passes — collect full output
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await (anthropic.messages.create as any)({
      model: "claude-opus-4-6",
      max_tokens: humanizeBudget.maxTokens,
      thinking: { type: "enabled", budget_tokens: perPassBudget },
      system: systemPrompt,
      messages: [{ role: "user", content: `${passLabel}\n\n${current}` }],
    });

    current = extractText(res.content);
  }

  // Unreachable — loop always returns on pass 3
  return new ReadableStream({ start(c) { c.close(); } });
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
  sampleExamples?: { content: string; category: string }[],
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

  const topicInsightsBlock = buildTopicInsightsBlock(voiceProfile);

  // Use condensed voice fingerprint for self-review (enough to verify voice fidelity)
  const samplesBlock = sampleExamples?.length
    ? buildVoiceFingerprint(sampleExamples)
    : "";

  const favoriteWordsBlock = favoriteWords?.length
    ? `\n## Author's Favorite Words\n${favoriteWords.map((fw) => `- **${fw.word}**${fw.definition ? `: ${fw.definition}` : ""}`).join("\n")}\n`
    : "";

  const authorContextBlock = authorContext?.trim()
    ? `\n## Author Background\n${authorContext.trim()}\n`
    : "";

  const contextBlock = context ? buildContextBlock(context) : "";
  const binaryBlocks = context ? buildBinaryBlocks(context) : [];
  const betaHeaders = getBetaHeaders(binaryBlocks);

  const systemPrompt = `You are this author's last line of defense before publication. Read the draft as them. If any sentence sounds like AI wrote it — a hollow hedge, a filler transition, a generic conclusion, an em dash that doesn't belong, a "furthermore" or "additionally" opening a paragraph — fix it. No AI pattern survives this stage.

## Author Voice Profile
**Voice:** ${voiceProfile.rawSummary}
**Tone:** ${voiceProfile.tone}
**Sentence Structure:** ${voiceProfile.sentenceStructure}
**Vocabulary:** ${voiceProfile.vocabularyStyle}
**Things to Avoid (if ANY of these appear, fix them immediately):** ${voiceProfile.thingsToAvoid.join("; ")}
${samplesBlock}${categoryInsightBlock}${topicInsightsBlock}${guidelinesBlock}${favoriteWordsBlock}${authorContextBlock}${editingBlock}
Your review must check:
1. Voice fidelity — does every sentence sound like this specific author? Not "good writing." This author.
2. AI contamination — hunt for hollow hedges, filler transitions, generic conclusions, over-structured formatting, em dash overuse, synonym cycling, rule-of-three groupings, copula avoidance ("serves as", "stands as"). Destroy any you find.
3. Brief adherence — did it cover the topic, angle, and key points? Is anything missing or weak?
4. Context usage — if supporting context was provided, did the draft use it? Are specifics woven in naturally?
5. Fabrication check — this is critical. Look for specific numbers, statistics, percentages, study citations, named sources, dates, or data points. If they do NOT appear in the supporting context above, they were fabricated. Replace any fabricated specifics with honest placeholder language the author can fill in (e.g., "your recent results," "the numbers from your last check," "[specific figure]"). Fabricated data published under someone's name — especially medical, legal, or financial — is unacceptable.
6. Fix everything you find. Surgical fixes only — do not rewrite from scratch.

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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const res = await (anthropic.messages.create as any)(
    {
      model: "claude-sonnet-4-6",
      max_tokens: budget.maxTokens,
      system: systemPrompt,
      messages: [{ role: "user", content: messageContent }],
    },
    reqOptions
  );

  return extractText(res.content) || draft;
}

// ── Research assessment ───────────────────────────────────────────────────────

/**
 * Quick assessment (via Haiku) of whether the plan requires web research
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

  const res = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1024,
    system: `You assess whether a ghostwriter needs to do web research before writing. Return ONLY valid JSON — no prose, no code fences.

Return: { "needed": boolean, "queries": ["search query 1", ...] }

Rules:
- needed=true if the plan references specific facts, statistics, recent events, studies, or data points that aren't already covered by the provided context
- needed=false for opinion pieces, personal essays, creative writing, or when sufficient context is provided
- For short-form content (emails, captions, social posts, text messages): needed=false UNLESS the topic inherently involves verifiable data (medical, financial, legal, scientific, technical specifications). An email referencing lab results, investment returns, or legal statutes still needs factual grounding.
- If needed, suggest 1-3 focused, specific search queries that would fill the knowledge gaps
- Keep queries targeted — "SaaS churn rate benchmarks 2025" not "SaaS industry trends"`,
    messages: [
      {
        role: "user",
        content: `Content type: ${resolveTypeLabel(interview)}
Topic: ${interview.topic}
Angle: ${interview.angle}

Plan:
${plan}

Available context: ${contextSummary}

Does this plan need web research before drafting?`,
      },
    ],
  });

  const text = extractText(res.content);
  try {
    const clean = text
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```\s*$/, "")
      .trim();
    return JSON.parse(clean);
  } catch {
    return { needed: false, queries: [] };
  }
}

// ── Targeted revision ─────────────────────────────────────────────────────────

/**
 * Apply specific feedback to a finished draft.
 * Only makes the changes described — does not rewrite anything else.
 */
export async function reviseDraft(
  draft: string,
  feedback: string,
  voiceProfile: VoiceAnalysis,
  contentType: string = "blog"
): Promise<ReadableStream<Uint8Array>> {
  const { humanize: budget } = getStageBudgets(contentType);

  const systemPrompt = `Apply ONLY the changes described in the feedback. Touch nothing else. Do not rewrite, restructure, or "improve" anything the feedback does not mention. Preserve the author's voice, phrasing, and formatting exactly as-is for everything not covered.

Author's voice: ${voiceProfile.rawSummary}
Things this author never does: ${voiceProfile.thingsToAvoid.join("; ")}

Do not introduce any AI patterns in your edits. No em dash overuse, no "furthermore", no hollow hedges, no filler transitions. If the feedback requires new text, write it in this author's voice.

Output the complete revised draft. Nothing else.`;

  const userPrompt = `Draft:\n\n${draft}\n\n---\n\nFeedback (apply these changes only):\n${feedback}\n\nRevised draft:`;

  const stream = await anthropic.messages.stream({
    model: "claude-sonnet-4-6",
    max_tokens: budget.maxTokens,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
  });

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
