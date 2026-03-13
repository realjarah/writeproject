import { load as cheerioLoad } from "cheerio";
import { GenerationContext, ContextItem } from "./content-types";

/** Max characters per fetched URL (~50K words). Prevents a single huge page from blowing context. */
const MAX_FETCH_CHARS = 200_000;

/** Max binary download size for PDF URLs (45MB to match upload limits). */
const MAX_PDF_BYTES = 45 * 1024 * 1024;

const FETCH_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/pdf,text/plain,*/*",
};

/**
 * Extract clean prose text from HTML using cheerio (proper DOM parser).
 * Strips non-content elements, preserves paragraph structure.
 */
export function htmlToText(html: string): string {
  const $ = cheerioLoad(html);

  // Remove elements that are never content
  $("script, style, nav, header, footer, aside, noscript, iframe, svg, form, [role='navigation'], [role='banner'], [role='contentinfo'], [aria-hidden='true']").remove();

  // Prefer article/main content if available — falls back to body
  let $content = $("article, main, [role='main']").first();
  if (!$content.length) $content = $("body");
  if (!$content.length) return "";

  // Get text, letting cheerio handle entity decoding
  // Insert newlines around block elements for paragraph preservation
  $content.find("p, div, li, h1, h2, h3, h4, h5, h6, blockquote, section, tr, br").each(function () {
    const el = $(this);
    const tagName = (this as any).tagName?.toLowerCase?.() ?? "";
    if (tagName === "br") {
      el.replaceWith("\n");
    } else {
      // Add newlines around block elements
      el.prepend("\n");
      el.append("\n");
    }
  });

  const text = $content
    .text()
    // Collapse runs of 3+ newlines to double newline
    .replace(/\n{3,}/g, "\n\n")
    // Collapse runs of spaces/tabs (but not newlines) to single space
    .replace(/[^\S\n]+/g, " ")
    // Clean up lines that are just whitespace
    .replace(/\n +/g, "\n")
    .trim();

  return text;
}

/**
 * Extract the page title from HTML.
 */
export function extractTitle(html: string): string {
  const $ = cheerioLoad(html);
  const title = $("title").first().text().trim();
  // Strip common site name suffixes (e.g. "Article Title | Site Name")
  return title.replace(/\s*[|\-–—](?:\s.*)?$/, "").trim();
}

/**
 * Attempt to fetch a URL and return its content as clean text.
 * Handles HTML, plain text, and PDF URLs.
 * Returns null on any failure so callers can degrade gracefully.
 */
export async function fetchUrlAsText(url: string): Promise<string | null> {
  try {
    // Validate URL scheme — only allow http(s) to prevent SSRF / protocol abuse
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      console.warn(`[fetchUrlAsText] Blocked non-HTTP URL scheme: ${parsed.protocol}`);
      return null;
    }

    const res = await fetch(url, {
      headers: FETCH_HEADERS,
      redirect: "follow",
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) {
      console.warn(`[fetchUrlAsText] HTTP ${res.status} for ${url}`);
      return null;
    }

    const contentType = res.headers.get("content-type") ?? "";
    let text: string;

    if (contentType.includes("text/html") || contentType.includes("application/xhtml")) {
      const html = await res.text();
      text = htmlToText(html);
    } else if (contentType.includes("application/pdf") || url.toLowerCase().endsWith(".pdf")) {
      // PDF URL — download and parse with pdf-parse
      const buf = await downloadAsBuffer(res);
      if (!buf) return null;
      try {
        const { extractPdfText } = await import("@/lib/parse-pdf");
        text = await extractPdfText(buf);
      } catch (err) {
        console.warn(`[fetchUrlAsText] PDF parse failed for ${url}:`, err instanceof Error ? err.message : err);
        return null;
      }
    } else if (contentType.includes("text/")) {
      text = (await res.text()).trim();
    } else if (contentType.includes("application/json")) {
      // JSON — return pretty-printed for context
      text = (await res.text()).trim();
    } else {
      console.warn(`[fetchUrlAsText] Unsupported content type "${contentType}" for ${url}`);
      return null;
    }

    // Truncate huge pages to prevent blowing the context window
    if (text.length > MAX_FETCH_CHARS) {
      console.warn(`[fetchUrlAsText] Truncating ${url} from ${text.length} to ${MAX_FETCH_CHARS} chars`);
      text = text.slice(0, MAX_FETCH_CHARS) + "\n\n[… truncated]";
    }

    return text || null;
  } catch (err) {
    console.warn(`[fetchUrlAsText] Failed to fetch ${url}:`, err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * Download a response body as a Buffer, with a size limit.
 * Returns null if the response exceeds MAX_PDF_BYTES.
 */
async function downloadAsBuffer(res: Response): Promise<Buffer | null> {
  const contentLength = res.headers.get("content-length");
  if (contentLength && parseInt(contentLength, 10) > MAX_PDF_BYTES) {
    console.warn(`[downloadAsBuffer] Content-Length ${contentLength} exceeds limit`);
    return null;
  }

  const chunks: Uint8Array[] = [];
  let totalSize = 0;
  const reader = res.body?.getReader();
  if (!reader) return null;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalSize += value.length;
      if (totalSize > MAX_PDF_BYTES) {
        console.warn(`[downloadAsBuffer] Download exceeded ${MAX_PDF_BYTES} bytes, aborting`);
        reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  return Buffer.concat(chunks);
}

/**
 * Fetch a URL and return both text and title (used by the import-url API route).
 * Returns an object with text, title, and optional error.
 */
export async function fetchUrlWithTitle(url: string): Promise<{ text: string; title: string } | { error: string }> {
  const parsed = new URL(url); // caller should validate first
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { error: "Only http and https URLs are supported" };
  }

  const res = await fetch(url, {
    headers: FETCH_HEADERS,
    redirect: "follow",
    signal: AbortSignal.timeout(20_000),
  });

  if (!res.ok) {
    return { error: `Could not fetch URL (HTTP ${res.status})` };
  }

  const contentType = res.headers.get("content-type") ?? "";

  if (contentType.includes("text/html") || contentType.includes("application/xhtml")) {
    const html = await res.text();
    const title = extractTitle(html);
    const text = htmlToText(html);
    if (!text) return { error: "No readable content found at this URL." };
    return { text, title };
  }

  if (contentType.includes("application/pdf") || url.toLowerCase().endsWith(".pdf")) {
    const buf = await downloadAsBuffer(res);
    if (!buf) return { error: "PDF too large to download." };
    try {
      const { extractPdfText } = await import("@/lib/parse-pdf");
      const text = await extractPdfText(buf);
      if (!text) return { error: "Could not extract text from this PDF." };
      const title = parsed.pathname.split("/").pop()?.replace(/\.pdf$/i, "").replace(/[-_]/g, " ") ?? "";
      return { text, title };
    } catch {
      return { error: "Failed to parse PDF from URL." };
    }
  }

  if (contentType.includes("text/")) {
    const text = (await res.text()).trim();
    if (!text) return { error: "No content found at this URL." };
    return { text, title: "" };
  }

  return { error: "URL does not point to readable content." };
}

/**
 * Resolve all URL context items to fetched text before the generation pipeline.
 * Items that fail to resolve keep their original shape (url only, no fetchedText)
 * so buildContextBlock can note they were unavailable.
 * Uses allSettled so one slow/hanging URL doesn't block the rest.
 */
export async function resolveContext(
  context: GenerationContext
): Promise<GenerationContext> {
  const results = await Promise.allSettled(
    context.items.map(async (item): Promise<ContextItem> => {
      if (!item.url) return item;
      const text = await fetchUrlAsText(item.url);
      if (text === null) return item;
      return { ...item, fetchedText: text };
    })
  );

  const items = results.map((result, i) => {
    if (result.status === "fulfilled") return result.value;
    console.warn(`[resolveContext] Failed to resolve item ${i}:`, result.reason);
    return context.items[i];
  });

  return { items };
}
