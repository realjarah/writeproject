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

export async function generateContent(
  voiceProfile: VoiceAnalysis,
  interview: InterviewAnswers
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

  const userPrompt = `Write ${contentTypeLabels[interview.contentType]} using the following brief:

**Topic:** ${interview.topic}
**Angle / Point of View:** ${interview.angle}
**Key Points to Cover:** ${interview.keyPoints}
**Sources / Data to Reference:** ${
    interview.sourcesOrData || "None provided — draw on general knowledge."
  }
**Target Audience:** ${interview.targetAudience || "The author's usual audience."}
**Extra Tone Notes:** ${interview.toneNotes || "None."}

Write it now.`;

  const stream = await anthropic.messages.stream({
    model: "claude-opus-4-6",
    max_tokens: 4096,
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
