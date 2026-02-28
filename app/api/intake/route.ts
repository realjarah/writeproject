import { NextRequest } from "next/server";
import { GoogleGenAI } from "@google/genai";

let _gemini: GoogleGenAI;
function getGemini() {
  if (!_gemini) _gemini = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
  return _gemini;
}

export async function POST(req: NextRequest) {
  const { description } = await req.json();
  if (!description?.trim()) {
    return Response.json({ error: "Description required" }, { status: 400 });
  }
  // Cap input length to prevent abuse / accidental huge payloads
  if (description.length > 10_000) {
    return Response.json({ error: "Description too long (max 10,000 characters)" }, { status: 400 });
  }

  const systemInstruction = `You analyze content briefs and extract structured fields. Return ONLY valid JSON — no prose, no code fences.

Required output shape:
{
  "contentType": string,
  "topic": string | null,
  "angle": string | null,
  "keyPoints": string | null,
  "targetAudience": string | null,
  "toneNotes": string | null,
  "summary": string,
  "questions": [{ "id": string, "label": string, "placeholder": string }]
}

contentType must be exactly one of:
  blog, essay, newsletter, whitepaper,
  email, report, press_release, proposal, case_study,
  resume, cover_letter,
  research, technical,
  social, twitter_thread, caption, text_message,
  speech, script

Detection rules (use the FIRST match):
- text_message    → "text", "SMS", "iMessage", "quick message to", casual message to a person
- caption         → Instagram, TikTok, reel, caption, story
- twitter_thread  → "twitter thread", "tweet thread", "x thread", "tweetstorm", "thread of tweets", "thread about", "write a thread"
- social          → tweet, Twitter/X, LinkedIn post, "post for social", "post about"
- email           → email, "write to [person]", "reach out to", "message to [person]"
- resume          → resume, CV, curriculum vitae
- cover_letter    → cover letter, "applying for", "job application"
- research        → research paper, academic paper, journal article, thesis, dissertation
- technical       → documentation, docs, README, API guide, how-to, tutorial, developer guide
- whitepaper      → whitepaper, "white paper", industry paper, thought leadership paper
- press_release   → press release, "for immediate release", PR announcement
- report          → report, quarterly, "Q1/Q2/Q3/Q4", findings, status update, analysis report
- case_study      → case study, "how we", success story
- proposal        → proposal, RFP, pitch, business case, "project proposal"
- speech          → speech, keynote, commencement, toast, "remarks", presentation script
- script          → podcast, video script, YouTube script, ad copy, voiceover, screenplay
- newsletter      → newsletter, digest, weekly/monthly update, subscriber email
- essay           → essay, opinion piece, "my take", personal essay, argument, "I think/believe/argue"
- blog            → article, blog post, long-form, "piece about", or default if unclear

Field extraction rules:
- topic: the subject — almost always extractable
- angle: the specific take, argument, or thesis — null only if genuinely absent; for resume/technical/report this can be null
- keyPoints: specific points to cover, comma-separated — null if none mentioned; not required for resume/email/text_message/caption/social/twitter_thread
- targetAudience: null if not mentioned (never ask for this)
- toneNotes: null if not mentioned (never ask for this)
- summary: "A [contentType label] about/for [brief topic phrase]" — one tight phrase

questions rules:
- Ask ONLY for missing required fields
- Required for blog/essay/whitepaper/newsletter/press_release/report/case_study/proposal/speech/script: angle AND keyPoints
- Required for social/caption/text_message/twitter_thread: angle only (keyPoints optional)
- Required for email: angle (what's the ask or purpose) only
- Required for research: angle (thesis/research question) AND keyPoints (methodology/sections)
- Required for technical: topic (what is being documented) if absent
- Required for resume/cover_letter: topic (role/industry targeting) if absent; angle not required
- Never required: targetAudience, toneNotes
- Make labels SPECIFIC to the topic (not generic — e.g. "What's your argument about remote work?" not "What's your angle?")
- Max 3 questions. If all required fields present, return questions: []`;

  const result = await getGemini().models.generateContent({
    model: "gemini-2.5-flash",
    contents: `Brief: """${description}"""`,
    config: {
      systemInstruction,
      maxOutputTokens: 1024,
    },
  });

  const text = (result.text ?? "").trim();

  try {
    // Robust JSON extraction: find the outermost { ... } rather than relying
    // on fragile regex to strip markdown code fences. Handles cases where the
    // model wraps JSON in prose, code fences, or both.
    const firstBrace = text.indexOf("{");
    const lastBrace = text.lastIndexOf("}");
    if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
      throw new Error("No JSON object found in response");
    }
    const jsonStr = text.slice(firstBrace, lastBrace + 1);
    const parsed = JSON.parse(jsonStr);

    // Validate contentType is one of the known types
    const validTypes = new Set([
      "blog", "essay", "newsletter", "whitepaper", "email", "report",
      "press_release", "proposal", "case_study", "resume", "cover_letter",
      "research", "technical", "social", "twitter_thread", "caption",
      "text_message", "speech", "script",
    ]);
    if (parsed.contentType && !validTypes.has(parsed.contentType)) {
      parsed.contentType = "blog"; // safe default
    }

    return Response.json(parsed);
  } catch {
    return Response.json({ error: "Failed to parse brief. Please try rephrasing." }, { status: 500 });
  }
}
