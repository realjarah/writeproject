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
    .map((s, i) => `--- Sample ${i + 1} [${s.category.toUpperCase()}] ---\n${s.content}`)
    .join("\n\n");

  const categories = Array.from(new Set(samples.map((s) => s.category)));
  const categorySection =
    categories.length > 1
      ? `\nNote: samples span multiple formats (${categories.join(", ")}). Include a "categoryInsights" field with per-format style notes where the author's voice shifts noticeably between formats.\n`
      : "";

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 8000,
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
  }
}

Rules:
- Only include keys in categoryInsights that are represented in the samples. Omit the field entirely if only one format is present.
- Only include keys in contentGuidelines for formats actually represented in the samples. Each value is an array of 6–8 strings. Guidelines must reflect this author's specific tendencies—not boilerplate format advice.`,
      },
    ],
  });

  const text =
    message.content[0].type === "text" ? message.content[0].text : "";
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
      if (item.fetchedText) {
        lines.push(item.fetchedText.trim());
      } else {
        lines.push("(Content at this URL could not be retrieved.)");
      }
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
      if (item.includePlaceholders) {
        lines.push(
          `_Where this data would benefit from visualization, insert [CHART: description], [TABLE: description], or [FIGURE: description] placeholder markers._`
        );
      }
    } else if (item.text) {
      lines.push(`--- Context ${i + 1}: [${tag}] Note ---`);
      lines.push(item.text.trim());
      if (item.includePlaceholders) {
        lines.push(
          `_Where this content would benefit from visualization, insert [CHART: description], [TABLE: description], or [FIGURE: description] placeholder markers._`
        );
      }
    }

    if (item.instructions?.trim()) {
      lines.push(`→ How to use this: ${item.instructions.trim()}`);
    } else if (item.tag === "reference") {
      lines.push(`→ Cite this source in your writing where you draw from it.`);
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

// ── Stage budgets (scales with format complexity / output length) ─────────────

interface StageBudget { maxTokens: number; thinkingBudget: number }
interface StageBudgets { plan: StageBudget; draft: StageBudget; humanize: StageBudget }

const STAGE_BUDGETS: Record<string, StageBudgets> = {
  // Academic / very long-form — full benefit of large context window
  research:      { plan: { maxTokens: 12000, thinkingBudget: 8000  }, draft: { maxTokens: 60000, thinkingBudget: 20000 }, humanize: { maxTokens: 50000, thinkingBudget: 14000 } },
  whitepaper:    { plan: { maxTokens: 10000, thinkingBudget: 7000  }, draft: { maxTokens: 50000, thinkingBudget: 16000 }, humanize: { maxTokens: 40000, thinkingBudget: 12000 } },
  technical:     { plan: { maxTokens: 10000, thinkingBudget: 6000  }, draft: { maxTokens: 40000, thinkingBudget: 12000 }, humanize: { maxTokens: 32000, thinkingBudget: 10000 } },
  case_study:    { plan: { maxTokens: 8000,  thinkingBudget: 5000  }, draft: { maxTokens: 30000, thinkingBudget: 12000 }, humanize: { maxTokens: 24000, thinkingBudget: 8000  } },
  // Standard long-form
  report:        { plan: { maxTokens: 8000,  thinkingBudget: 5000  }, draft: { maxTokens: 24000, thinkingBudget: 10000 }, humanize: { maxTokens: 20000, thinkingBudget: 8000  } },
  essay:         { plan: { maxTokens: 8000,  thinkingBudget: 5000  }, draft: { maxTokens: 24000, thinkingBudget: 10000 }, humanize: { maxTokens: 20000, thinkingBudget: 8000  } },
  speech:        { plan: { maxTokens: 8000,  thinkingBudget: 5000  }, draft: { maxTokens: 20000, thinkingBudget: 10000 }, humanize: { maxTokens: 16000, thinkingBudget: 8000  } },
  script:        { plan: { maxTokens: 8000,  thinkingBudget: 5000  }, draft: { maxTokens: 20000, thinkingBudget: 10000 }, humanize: { maxTokens: 16000, thinkingBudget: 8000  } },
  proposal:      { plan: { maxTokens: 8000,  thinkingBudget: 5000  }, draft: { maxTokens: 20000, thinkingBudget: 10000 }, humanize: { maxTokens: 16000, thinkingBudget: 8000  } },
  // Business medium
  press_release: { plan: { maxTokens: 6000,  thinkingBudget: 4000  }, draft: { maxTokens: 8000,  thinkingBudget: 5000  }, humanize: { maxTokens: 6000,  thinkingBudget: 4000  } },
  resume:        { plan: { maxTokens: 6000,  thinkingBudget: 4000  }, draft: { maxTokens: 8000,  thinkingBudget: 5000  }, humanize: { maxTokens: 6000,  thinkingBudget: 4000  } },
  cover_letter:  { plan: { maxTokens: 5000,  thinkingBudget: 3000  }, draft: { maxTokens: 6000,  thinkingBudget: 4000  }, humanize: { maxTokens: 5000,  thinkingBudget: 3000  } },
  email:         { plan: { maxTokens: 4000,  thinkingBudget: 2000  }, draft: { maxTokens: 4000,  thinkingBudget: 2000  }, humanize: { maxTokens: 4000,  thinkingBudget: 2000  } },
  // Short-form
  social:          { plan: { maxTokens: 3000,  thinkingBudget: 2000  }, draft: { maxTokens: 2000,  thinkingBudget: 1500  }, humanize: { maxTokens: 2000,  thinkingBudget: 1500  } },
  twitter_thread:  { plan: { maxTokens: 4000,  thinkingBudget: 3000  }, draft: { maxTokens: 6000,  thinkingBudget: 3000  }, humanize: { maxTokens: 6000,  thinkingBudget: 3000  } },
  caption:         { plan: { maxTokens: 2000,  thinkingBudget: 1500  }, draft: { maxTokens: 1500,  thinkingBudget: 1000  }, humanize: { maxTokens: 1500,  thinkingBudget: 1000  } },
  text_message:    { plan: { maxTokens: 2000,  thinkingBudget: 1500  }, draft: { maxTokens: 1500,  thinkingBudget: 1000  }, humanize: { maxTokens: 1500,  thinkingBudget: 1000  } },
};

const DEFAULT_BUDGETS: StageBudgets = {
  plan:     { maxTokens: 8000,  thinkingBudget: 5000  },
  draft:    { maxTokens: 20000, thinkingBudget: 10000 },
  humanize: { maxTokens: 16000, thinkingBudget: 8000  },
};

export function getStageBudgets(contentType: string): StageBudgets {
  return STAGE_BUDGETS[contentType] ?? DEFAULT_BUDGETS;
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
  favoriteWords?: { word: string; definition: string }[]
): Promise<string> {
  const contextBlock = context ? buildContextBlock(context) : "";
  const binaryBlocks = context ? buildBinaryBlocks(context) : [];
  const hasPDFs = binaryBlocks.some((b) => b.type === "document");

  const guidelines = voiceProfile.contentGuidelines?.[interview.contentType];
  const guidelinesBlock = guidelines?.length
    ? `\n**Format-specific guidelines for ${resolveTypeLabel(interview)}:**\n${guidelines.map((g) => `- ${g}`).join("\n")}\n`
    : "";

  const categoryInsight = voiceProfile.categoryInsights?.[interview.contentType];
  const categoryInsightBlock = categoryInsight
    ? `\n**How this author's voice shows up in ${resolveTypeLabel(interview)}:** ${categoryInsight}\n`
    : "";

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

  const userPrompt = `You are about to ghost-write a ${resolveTypeLabel(interview)}.

Before writing a single word, produce a detailed structural plan.
${examplesBlock}
**Brief:**
- Topic: ${interview.topic}
- Angle / argument: ${interview.angle}
- Key points to cover: ${interview.keyPoints}
- Audience: ${interview.targetAudience || "the author's usual audience"}
- Tone notes: ${interview.toneNotes || "none"}${interview.wordCountTarget ? `\n- Target length: ${interview.wordCountTarget}` : ""}
${contextBlock}
**Author voice summary:** ${voiceProfile.rawSummary}
${categoryInsightBlock}${guidelinesBlock}${favoriteWordsBlock}
**Plan requirements:**
- The exact opening move — what's the hook? Be specific.
- How the argument builds and where the emotional beats land
- Section-by-section breakdown with the purpose of each beat
- How each piece of context gets woven in naturally (if any provided)
- The closing move and what the reader leaves with
- Structural choices that specifically play to this author's voice and the format guidelines above

Return ONLY the plan. Do not write the piece yet.`;

  const messageContent =
    binaryBlocks.length > 0
      ? [{ type: "text", text: userPrompt }, ...binaryBlocks]
      : userPrompt;

  const reqOptions = hasPDFs
    ? { headers: { "anthropic-beta": "pdfs-2024-09-25" } }
    : {};

  const { plan: planBudget } = getStageBudgets(interview.contentType);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const res = await (anthropic.messages.create as any)(
    {
      model: "claude-opus-4-6",
      max_tokens: planBudget.maxTokens,
      thinking: { type: "enabled", budget_tokens: planBudget.thinkingBudget },
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
  context?: GenerationContext,
  sampleExamples?: { content: string; category: string }[],
  favoriteWords?: { word: string; definition: string }[]
): Promise<string> {
  const contextBlock = context ? buildContextBlock(context) : "";
  const binaryBlocks = context ? buildBinaryBlocks(context) : [];
  const hasPDFs = binaryBlocks.some((b) => b.type === "document");

  const guidelines = voiceProfile.contentGuidelines?.[interview.contentType];
  const guidelinesBlock = guidelines?.length
    ? `\n## Format-Specific Guidelines (${resolveTypeLabel(interview)})\n${guidelines.map((g) => `- ${g}`).join("\n")}\n`
    : "";

  const categoryInsight = voiceProfile.categoryInsights?.[interview.contentType];
  const categoryInsightBlock = categoryInsight
    ? `\n## How This Author Writes ${resolveTypeLabel(interview)}\n${categoryInsight}\n`
    : "";

  const examplesSection = sampleExamples?.length
    ? `\n## Author's Actual Writing Samples (absorb these — write with the exact same voice)\n${
        sampleExamples
          .map((s, i) => `### Example ${i + 1} [${s.category}]\n${s.content}`)
          .join("\n\n")
      }\n`
    : "";

  const wordCountLine = interview.wordCountTarget
    ? `Target length: ${interview.wordCountTarget}. `
    : "";

  const systemPrompt = `You are a ghost-writer. Write ${resolveTypeLabel(interview)} that sounds EXACTLY like the author below. No preamble. No meta-commentary. Output only the piece.

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
${examplesSection}${categoryInsightBlock}${guidelinesBlock}
## Forbidden AI Writing Patterns (never use — these are instant giveaways)
- Opener clichés: "In today's fast-paced world", "In the digital age", "It goes without saying", "In an era where"
- AI filler verbs: "delve into", "underscore", "leverage" (as metaphor), "utilize", "facilitate", "navigate" (as metaphor), "foster"
- Hollow hedge phrases: "It's worth noting that", "It's important to note", "It's crucial to understand", "Needless to say", "One might argue"
- Transition clichés as paragraph openers: "Furthermore,", "Moreover,", "Additionally,", "In addition,"
- Closing tell: "In conclusion,", "To summarize,", "To wrap up,", "As we've seen,"
- Performative mirroring: restating the intro as if it's a fresh insight in the final paragraph
- Qualification stacking: "However, it's worth considering that, while generally speaking, one could argue…"
- Hollow superlatives: "It is undeniable that", "There is no doubt that", "It is clear that", "Evidently,"
- Over-structured output: bolding every paragraph header when flowing prose is more natural for this format

## Author's Favorite Words
${favoriteWords?.length
  ? `Use these words only when they fit the context naturally. Never repeat them more than once per piece. Never force them in.\n${favoriteWords.map((fw) => `- **${fw.word}**${fw.definition ? `: ${fw.definition}` : ""}`).join("\n")}`
  : "None specified — use your best judgment."}

## Output Rules
- Write ONLY the piece. Nothing else.
- ${wordCountLine}${WORD_GUIDANCE[interview.contentType] ?? `This is a custom format ("${resolveTypeLabel(interview)}"). Use the provided writing examples as your primary guide for length, structure, and conventions. If no examples are available, write a well-structured piece that feels natural for this format.`}`;

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

  const { draft: draftBudget } = getStageBudgets(interview.contentType);

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
 */
export async function compareAndSelectBestDraft(
  drafts: string[],
  voiceProfile: VoiceAnalysis,
  interview: InterviewAnswers
): Promise<string> {
  const { draft: draftBudget } = getStageBudgets(interview.contentType);

  const userPrompt = `You are evaluating ${drafts.length} ghost-written versions of a ${resolveTypeLabel(interview)} to select and deliver the single best piece.

**Author Voice Profile:**
${voiceProfile.rawSummary}
- Tone: ${voiceProfile.tone}
- Sentence structure: ${voiceProfile.sentenceStructure}
- Vocabulary: ${voiceProfile.vocabularyStyle}
- Things this author never does: ${voiceProfile.thingsToAvoid.join("; ")}

**Original Brief:**
- Topic: ${interview.topic}
- Angle: ${interview.angle}
- Key points: ${interview.keyPoints}
- Audience: ${interview.targetAudience || "the author's usual audience"}

**The Drafts:**
${drafts.map((d, i) => `--- DRAFT ${i + 1} ---\n${d}`).join("\n\n")}

Using extended thinking, analyze each draft for:
1. Voice authenticity — does it sound specifically like this author (not like generic AI prose)?
2. Brief fidelity — does it faithfully cover the topic, angle, and all key points?
3. Quality, impact, and resonance — does it have a strong hook, forward momentum, and a satisfying close?
4. AI-pattern detection — flag any of these if present: opener clichés ("In today's fast-paced world", "It goes without saying"), filler verbs ("delve into", "underscore", "leverage" used metaphorically, "utilize"), hollow hedges ("It's worth noting", "It's important to note"), transition clichés as openers ("Furthermore,", "Moreover,"), closing tells ("In conclusion,", "To summarize,"), or a final paragraph that simply restates the opening

Then produce the FINAL BEST VERSION by either:
- Selecting the strongest draft as-is, OR
- Synthesizing the best elements from multiple drafts into one superior piece

If the selected/synthesized piece contains any AI patterns flagged above, remove or rewrite those sections before outputting.

Output ONLY the final piece. No preamble, no "I chose draft X", no commentary. Just the finished text.`;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const res = await (anthropic.messages.create as any)({
    model: "claude-opus-4-6",
    max_tokens: draftBudget.maxTokens,
    thinking: { type: "enabled", budget_tokens: draftBudget.thinkingBudget },
    messages: [{ role: "user", content: userPrompt }],
  });

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
  humanizerInstructions: string,
  contentType: string = "blog"
): Promise<ReadableStream<Uint8Array>> {
  const systemPrompt = `${humanizerInstructions}

---

IMPORTANT OVERRIDE FOR THIS SESSION: You are preparing text for final publication. Work through the complete humanization process in your extended thinking — identify AI patterns, draft a rewrite, self-audit ("what still makes this obviously AI generated?"), revise. Then output ONLY the final humanized piece. No section headers, no audit bullets, no process notes, no summary of changes. Just the finished text.

Also maintain this specific author's voice throughout:
- Their style: ${voiceProfile.rawSummary}
- Things this author never does: ${voiceProfile.thingsToAvoid.join("; ")}`;

  const userPrompt = `Humanize the following piece:\n\n${draft}`;

  const { humanize: humanizeBudget } = getStageBudgets(contentType);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const stream = await (anthropic.messages.stream as any)({
    model: "claude-opus-4-6",
    max_tokens: humanizeBudget.maxTokens,
    thinking: { type: "enabled", budget_tokens: humanizeBudget.thinkingBudget },
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

  const systemPrompt = `You are a precise editor making surgical changes to a draft.

Apply ONLY the specific changes described in the feedback. Do not rewrite, restructure, or improve anything that was not mentioned. Preserve the author's entire voice, style, phrasing, and formatting for everything not covered by the feedback.

Author's voice summary: ${voiceProfile.rawSummary}
Things this author never does: ${voiceProfile.thingsToAvoid.join("; ")}

Output only the complete revised draft — no commentary, no explanation, no preamble.`;

  const userPrompt = `Draft:\n\n${draft}\n\n---\n\nFeedback (apply these changes only):\n${feedback}\n\nOutput the revised draft now.`;

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
