import Anthropic from "@anthropic-ai/sdk";

export const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

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
  categoryInsights?: Record<string, string>;
}

export interface LabeledSample {
  content: string;
  category: string;
}

export async function analyzeVoice(samples: LabeledSample[]): Promise<VoiceAnalysis> {
  const samplesText = samples
    .map((s, i) => `--- Sample ${i + 1} [${s.category.toUpperCase()}] ---\n${s.content}`)
    .join("\n\n");

  const categories = Array.from(new Set(samples.map((s) => s.category)));
  const categorySection =
    categories.length > 1
      ? `\nNote: samples span multiple formats (${categories.join(", ")}). Include a "categoryInsights" field with per-format style notes where the author's voice shifts noticeably between formats.\n`
      : "";

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2000,
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
  "categoryInsights": { "blog": "how their voice shows up specifically in long-form", "thread": "their thread/social style", "caption": "their caption style" }
}

Only include keys in categoryInsights that are actually represented in the samples. Omit the field entirely if only one format is present.`,
      },
    ],
  });

  const text =
    message.content[0].type === "text" ? message.content[0].text : "";
  return JSON.parse(text) as VoiceAnalysis;
}

export interface InterviewAnswers {
  contentType: "blog" | "social" | "caption";
  topic: string;
  angle: string;
  keyPoints: string;
  sourcesOrData: string;
  targetAudience: string;
  toneNotes: string;
  wordCountTarget?: string;
}

export type ContextItemTag = "data" | "example" | "research" | "reference" | "note";

export interface ContextItem {
  tag: ContextItemTag;
  // Source — exactly one of these is set per item:
  url?: string;       // a referenced URL
  text?: string;      // text file content or a manual text/note
  fileName?: string;  // original filename for any uploaded file
  isCSV?: boolean;
  includePlaceholders?: boolean; // for CSV: emit [CHART:] / [TABLE:] markers
  // Binary files (images, PDFs) — base64-encoded, no data: prefix
  data?: string;
  mediaType?: string; // "image/jpeg" | "image/png" | ... | "application/pdf"
  instructions?: string; // how the author wants this context used
}

export interface GenerationContext {
  items: ContextItem[];
}

// ── Shared constants ────────────────────────────────────────────────────────

export const CONTENT_TYPE_LABELS: Record<string, string> = {
  blog:    "blog post / article",
  social:  "social media post (Twitter/X or LinkedIn)",
  caption: "caption (Instagram or TikTok)",
};

const WORD_GUIDANCE: Record<string, string> = {
  blog:    "Aim for 600–1200 words unless the brief specifies otherwise.",
  social:  "Keep it tight — 50–280 characters for Twitter/X, or 150–300 words for LinkedIn.",
  caption: "Short and punchy — 1 to 4 sentences max.",
};

// ── Context helpers ──────────────────────────────────────────────────────────

// Builds the text portion of the context block.
// Binary items (images/PDFs) are referenced by name only;
// their actual content goes in separate message content blocks.
function buildContextBlock(context: GenerationContext): string {
  if (context.items.length === 0) return "";

  const parts = context.items.map((item, i) => {
    const tag = item.tag.toUpperCase();
    const lines: string[] = [];

    if (item.url) {
      lines.push(`--- Context ${i + 1}: [${tag}] ${item.url} ---`);
    } else if (item.data && item.mediaType) {
      // Binary file — content delivered as a separate message block
      const kind = item.mediaType === "application/pdf"
        ? "PDF document"
        : item.mediaType.startsWith("image/") ? "Image" : "File";
      lines.push(`--- Context ${i + 1}: [${tag}] ${kind}${item.fileName ? ` — ${item.fileName}` : ""} (attached below) ---`);
    } else if (item.fileName && item.text !== undefined) {
      // Text-based file
      lines.push(`--- Context ${i + 1}: [${tag}] ${item.fileName}${item.isCSV ? " (CSV data)" : ""} ---`);
      lines.push(`\`\`\`\n${item.text}\n\`\`\``);
      if (item.isCSV && item.includePlaceholders) {
        lines.push(
          `_Where this data would benefit from visualization, insert [CHART: description] or [TABLE: description] placeholder markers._`
        );
      }
    } else if (item.text) {
      lines.push(`--- Context ${i + 1}: [${tag}] Note ---`);
      lines.push(item.text.trim());
    }

    if (item.instructions?.trim()) {
      lines.push(`→ How to use this: ${item.instructions.trim()}`);
    }

    return lines.join("\n");
  });

  return `\n**Supporting Context:**\n${parts.join("\n\n")}\n`;
}

// Returns Anthropic content blocks for binary context items (images + PDFs).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildBinaryBlocks(context: GenerationContext): any[] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const blocks: any[] = [];
  for (const item of context.items) {
    if (!item.data || !item.mediaType) continue;
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
  const hasPDFs = binaryBlocks.some((b) => b.type === "document");

  const userPrompt = `Write ${contentTypeLabels[interview.contentType]} using the following brief:

**Topic:** ${interview.topic}
**Angle / Point of View:** ${interview.angle}
**Key Points to Cover:** ${interview.keyPoints}
**Sources / Data to Reference:** ${
    interview.sourcesOrData || "None provided — draw on general knowledge."
  }
**Target Audience:** ${interview.targetAudience || "The author's usual audience."}
**Extra Tone Notes:** ${interview.toneNotes || "None."}
${contextBlock}
Write it now.`;

  // Use multipart content when binary attachments (images/PDFs) are present.
  // PDFs require the anthropic-beta header.
  const messageContent =
    binaryBlocks.length > 0
      ? [{ type: "text", text: userPrompt }, ...binaryBlocks]
      : userPrompt;

  const streamOptions = hasPDFs
    ? { headers: { "anthropic-beta": "pdfs-2024-09-25" } }
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

// ── Multi-stage pipeline ─────────────────────────────────────────────────────

function extractText(content: Anthropic.ContentBlock[]): string {
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
  context?: GenerationContext
): Promise<string> {
  const contextBlock = context ? buildContextBlock(context) : "";
  const binaryBlocks = context ? buildBinaryBlocks(context) : [];
  const hasPDFs = binaryBlocks.some((b) => b.type === "document");

  const userPrompt = `You are about to ghost-write a ${CONTENT_TYPE_LABELS[interview.contentType]}.

Before writing a single word, produce a detailed structural plan.

**Brief:**
- Topic: ${interview.topic}
- Angle / argument: ${interview.angle}
- Key points to cover: ${interview.keyPoints}
- Audience: ${interview.targetAudience || "the author's usual audience"}
- Tone notes: ${interview.toneNotes || "none"}${interview.wordCountTarget ? `\n- Target length: ${interview.wordCountTarget}` : ""}
${contextBlock}
**Author voice summary:** ${voiceProfile.rawSummary}

**Plan requirements:**
- The exact opening move — what's the hook? Be specific.
- How the argument builds and where the emotional beats land
- Section-by-section breakdown with the purpose of each beat
- How each piece of context gets woven in naturally (if any provided)
- The closing move and what the reader leaves with
- Structural choices that specifically play to this author's voice and patterns

Return ONLY the plan. Do not write the piece yet.`;

  const messageContent =
    binaryBlocks.length > 0
      ? [{ type: "text", text: userPrompt }, ...binaryBlocks]
      : userPrompt;

  const reqOptions = hasPDFs
    ? { headers: { "anthropic-beta": "pdfs-2024-09-25" } }
    : {};

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const res = await (anthropic.messages.create as any)(
    {
      model: "claude-opus-4-6",
      max_tokens: 8000,
      thinking: { type: "enabled", budget_tokens: 5000 },
      messages: [{ role: "user", content: messageContent }],
    },
    reqOptions
  );

  return extractText(res.content);
}

/**
 * Stage 2 — Draft
 * Writes the raw first draft against the plan with full voice fidelity.
 */
export async function draftContent(
  voiceProfile: VoiceAnalysis,
  interview: InterviewAnswers,
  plan: string,
  context?: GenerationContext
): Promise<string> {
  const contextBlock = context ? buildContextBlock(context) : "";
  const binaryBlocks = context ? buildBinaryBlocks(context) : [];
  const hasPDFs = binaryBlocks.some((b) => b.type === "document");

  const systemPrompt = `You are a ghost-writer. Write ${CONTENT_TYPE_LABELS[interview.contentType]} that sounds EXACTLY like the author below. No preamble. No meta-commentary. Output only the piece.

## Author Voice Profile

**Tone:** ${voiceProfile.tone}
**Sentence Structure:** ${voiceProfile.sentenceStructure}
**Vocabulary Style:** ${voiceProfile.vocabularyStyle}
**Punctuation Habits:** ${voiceProfile.punctuationHabits}
**Paragraph Style:** ${voiceProfile.paragraphStyle}
**Rhetorical Devices:** ${voiceProfile.rhetoricalDevices}
**Recurring Patterns:**
${voiceProfile.commonPatterns.map((p) => `- ${p}`).join("\n")}
**Things to Avoid:**
${voiceProfile.thingsToAvoid.map((p) => `- ${p}`).join("\n")}

## Output Rules
- Write ONLY the piece. Nothing else.
- ${WORD_GUIDANCE[interview.contentType]}`;

  const userPrompt = `Follow this structural plan:

${plan}

**Brief recap:**
- Topic: ${interview.topic}
- Angle: ${interview.angle}
- Key points: ${interview.keyPoints}
${contextBlock}
Write the piece now.`;

  const messageContent =
    binaryBlocks.length > 0
      ? [{ type: "text", text: userPrompt }, ...binaryBlocks]
      : userPrompt;

  const reqOptions = hasPDFs
    ? { headers: { "anthropic-beta": "pdfs-2024-09-25" } }
    : {};

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const res = await (anthropic.messages.create as any)(
    {
      model: "claude-opus-4-6",
      max_tokens: 20000,
      thinking: { type: "enabled", budget_tokens: 10000 },
      system: systemPrompt,
      messages: [{ role: "user", content: messageContent }],
    },
    reqOptions
  );

  return extractText(res.content);
}

/**
 * Stage 3 — Humanize
 * Strips AI patterns, audits itself, and produces the final polished piece.
 * Streams the output.
 */
export async function humanizeContent(
  draft: string,
  voiceProfile: VoiceAnalysis,
  humanizerInstructions: string
): Promise<ReadableStream<Uint8Array>> {
  const systemPrompt = `${humanizerInstructions}

---

IMPORTANT OVERRIDE FOR THIS SESSION: You are preparing text for final publication. Work through the complete humanization process in your extended thinking — identify AI patterns, draft a rewrite, self-audit ("what still makes this obviously AI generated?"), revise. Then output ONLY the final humanized piece. No section headers, no audit bullets, no process notes, no summary of changes. Just the finished text.

Also maintain this specific author's voice throughout:
- Their style: ${voiceProfile.rawSummary}
- Things this author never does: ${voiceProfile.thingsToAvoid.join("; ")}`;

  const userPrompt = `Humanize the following piece:\n\n${draft}`;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const stream = await (anthropic.messages.stream as any)({
    model: "claude-opus-4-6",
    max_tokens: 16000,
    thinking: { type: "enabled", budget_tokens: 8000 },
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
