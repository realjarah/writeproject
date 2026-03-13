import { PDFParse } from "pdf-parse";

/**
 * Extract clean text from a PDF buffer using pdf-parse.
 * Returns the full text content with paragraph breaks preserved.
 * Throws on parse failure so callers can handle errors.
 */
export async function extractPdfText(buffer: Buffer): Promise<string> {
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    const result = await parser.getText();
    const text = result.text
      // Collapse runs of 3+ newlines to double newline (paragraph break)
      .replace(/\n{3,}/g, "\n\n")
      // Collapse runs of spaces/tabs to single space (but keep newlines)
      .replace(/[^\S\n]+/g, " ")
      .trim();
    return text;
  } finally {
    await parser.destroy().catch(() => {});
  }
}
