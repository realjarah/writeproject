import { load as cheerioLoad } from "cheerio";
import { GenerationContext, ContextItem } from "./content-types";

/** Max characters per fetched URL (~50K words). Prevents a single huge page from blowing context. */
const MAX_FETCH_CHARS = 200_000;

// ── Jina Reader ──────────────────────────────────────────────────────────────
// Jina Reader renders pages in a headless browser and returns clean markdown.
// Handles SPAs (Substack, Medium, React sites), PDFs, and everything else.
// Falls back to direct fetch + cheerio if Jina is unavailable.

const JINA_BASE = "https://r.jina.ai/";
const JINA_API_KEY = process.env.JINA_API_KEY; // optional — higher rate limits with key

/**
 * Fetch a URL via Jina Reader, which renders the page in a headless browser
 * and returns clean text content. Works with SPAs, JS-rendered pages, PDFs, etc.
 * Returns null on failure.
 */
async function fetchViaJina(url: string): Promise<string | null> {
  try {
    const headers: Record<string, string> = {
      Accept: "text/plain",
      "X-No-Cache": "true",
    };
    if (JINA_API_KEY) {
      headers["Authorization"] = `Bearer ${JINA_API_KEY}`;
    }

    const res = await fetch(`${JINA_BASE}${url}`, {
      headers,
      signal: AbortSignal.timeout(30_000),
    });

    if (!res.ok) {
      console.warn(`[fetchViaJina] HTTP ${res.status} for ${url}`);
      return null;
    }

    const text = (await res.text()).trim();

    // Jina returns a header block (Title:, URL:, etc.) followed by content.
    // Strip the metadata header if present.
    const cleaned = stripJinaHeader(text);

    return cleaned || null;
  } catch (err) {
    console.warn(`[fetchViaJina] Failed for ${url}:`, err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * Fetch via Jina and return both the cleaned text and the title from the header.
 * Used by fetchUrlWithTitle to avoid a double request.
 */
async function fetchViaJinaWithTitle(url: string): Promise<{ text: string; title: string } | null> {
  try {
    const headers: Record<string, string> = {
      Accept: "text/plain",
      "X-No-Cache": "true",
    };
    if (JINA_API_KEY) {
      headers["Authorization"] = `Bearer ${JINA_API_KEY}`;
    }

    const res = await fetch(`${JINA_BASE}${url}`, {
      headers,
      signal: AbortSignal.timeout(30_000),
    });

    if (!res.ok) return null;

    const raw = (await res.text()).trim();
    const titleMatch = raw.match(/^Title:\s*(.+)$/m);
    const title = titleMatch ? titleMatch[1].trim() : "";
    const text = stripJinaHeader(raw);

    return text ? { text, title } : null;
  } catch {
    return null;
  }
}

/**
 * Jina Reader prepends metadata lines like "Title: ...", "URL: ...", etc.
 * Strip these so we get just the content.
 */
function stripJinaHeader(text: string): string {
  const lines = text.split("\n");
  let start = 0;

  // Skip leading metadata lines (Key: Value format)
  while (start < lines.length) {
    const line = lines[start].trim();
    // Metadata lines: "Title: ...", "URL: ...", "Published Time: ...", etc.
    if (/^[A-Z][A-Za-z\s]+:\s/.test(line)) {
      start++;
      continue;
    }
    // Skip blank lines between header and content
    if (line === "" && start > 0) {
      start++;
      continue;
    }
    break;
  }

  return lines.slice(start).join("\n").trim();
}

// ── Cheerio fallback ─────────────────────────────────────────────────────────

/** Max binary download size for PDF URLs (45MB to match upload limits). */
const MAX_PDF_BYTES = 45 * 1024 * 1024;

const FETCH_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/pdf,text/plain,*/*",
};

/**
 * Extract clean prose text from HTML using cheerio (proper DOM parser).
 * Used as fallback when Jina Reader is unavailable.
 */
export function htmlToText(html: string): string {
  const $ = cheerioLoad(html);

  $("script, style, nav, header, footer, aside, noscript, iframe, svg, form, [role='navigation'], [role='banner'], [role='contentinfo'], [aria-hidden='true']").remove();

  let $content = $("article, main, [role='main']").first();
  if (!$content.length) $content = $("body");
  if (!$content.length) return "";

  $content.find("p, div, li, h1, h2, h3, h4, h5, h6, blockquote, section, tr, br").each(function () {
    const el = $(this);
    const tagName = (this as any).tagName?.toLowerCase?.() ?? "";
    if (tagName === "br") {
      el.replaceWith("\n");
    } else {
      el.prepend("\n");
      el.append("\n");
    }
  });

  return $content
    .text()
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[^\S\n]+/g, " ")
    .replace(/\n +/g, "\n")
    .trim();
}

/**
 * Extract the page title from HTML.
 */
export function extractTitle(html: string): string {
  const $ = cheerioLoad(html);
  const title = $("title").first().text().trim();
  return title.replace(/\s*[|\-–—](?:\s.*)?$/, "").trim();
}

/**
 * Direct fetch fallback — used when Jina Reader is unavailable.
 * Handles HTML (via cheerio), plain text, PDF, and JSON.
 */
async function fetchDirectAsText(url: string): Promise<string | null> {
  const res = await fetch(url, {
    headers: FETCH_HEADERS,
    redirect: "follow",
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) {
    console.warn(`[fetchDirect] HTTP ${res.status} for ${url}`);
    return null;
  }

  const contentType = res.headers.get("content-type") ?? "";

  if (contentType.includes("text/html") || contentType.includes("application/xhtml")) {
    return htmlToText(await res.text());
  }
  if (contentType.includes("application/pdf") || url.toLowerCase().endsWith(".pdf")) {
    const buf = await downloadAsBuffer(res);
    if (!buf) return null;
    const { extractPdfText } = await import("@/lib/parse-pdf");
    return extractPdfText(buf);
  }
  if (contentType.includes("text/")) {
    return (await res.text()).trim();
  }
  if (contentType.includes("application/json")) {
    return (await res.text()).trim();
  }

  console.warn(`[fetchDirect] Unsupported content type "${contentType}" for ${url}`);
  return null;
}

/**
 * Download a response body as a Buffer, with a size limit.
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

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Fetch a URL and return its content as clean text.
 * Strategy: Jina Reader first (handles SPAs, JS-rendered pages, PDFs),
 * falls back to direct fetch + cheerio if Jina is unavailable.
 * Returns null on any failure.
 */
export async function fetchUrlAsText(url: string): Promise<string | null> {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      console.warn(`[fetchUrlAsText] Blocked non-HTTP URL scheme: ${parsed.protocol}`);
      return null;
    }

    // Primary: Jina Reader (renders JS, handles SPAs, PDFs, etc.)
    let text = await fetchViaJina(url);

    // Fallback: direct fetch + cheerio/pdf-parse
    if (!text) {
      console.warn(`[fetchUrlAsText] Jina failed for ${url}, trying direct fetch`);
      text = await fetchDirectAsText(url);
    }

    if (!text) return null;

    // Truncate huge pages
    if (text.length > MAX_FETCH_CHARS) {
      console.warn(`[fetchUrlAsText] Truncating ${url} from ${text.length} to ${MAX_FETCH_CHARS} chars`);
      text = text.slice(0, MAX_FETCH_CHARS) + "\n\n[… truncated]";
    }

    return text;
  } catch (err) {
    console.warn(`[fetchUrlAsText] Failed for ${url}:`, err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * Fetch a URL and return both text and title (used by the import-url API route).
 */
export async function fetchUrlWithTitle(url: string): Promise<{ text: string; title: string } | { error: string }> {
  const parsed = new URL(url);
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { error: "Only http and https URLs are supported" };
  }

  let text: string | null = null;
  let title = "";

  // Primary: Jina Reader for content (single request, extract title from header)
  const jinaResult = await fetchViaJinaWithTitle(url);
  if (jinaResult) {
    text = jinaResult.text;
    title = jinaResult.title;
  }

  // Fallback: direct fetch
  if (!text) {
    try {
      const res = await fetch(url, {
        headers: FETCH_HEADERS,
        redirect: "follow",
        signal: AbortSignal.timeout(20_000),
      });

      if (!res.ok) return { error: `Could not fetch URL (HTTP ${res.status})` };

      const contentType = res.headers.get("content-type") ?? "";

      if (contentType.includes("text/html") || contentType.includes("application/xhtml")) {
        const html = await res.text();
        title = extractTitle(html);
        text = htmlToText(html);
      } else if (contentType.includes("application/pdf") || url.toLowerCase().endsWith(".pdf")) {
        const buf = await downloadAsBuffer(res);
        if (!buf) return { error: "PDF too large to download." };
        const { extractPdfText } = await import("@/lib/parse-pdf");
        text = await extractPdfText(buf);
        title = parsed.pathname.split("/").pop()?.replace(/\.pdf$/i, "").replace(/[-_]/g, " ") ?? "";
      } else if (contentType.includes("text/")) {
        text = (await res.text()).trim();
      } else {
        return { error: "URL does not point to readable content." };
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      return { error: `Fetch failed: ${msg}` };
    }
  }

  if (!text) return { error: "No readable content found at this URL." };

  if (text.length > MAX_FETCH_CHARS) {
    text = text.slice(0, MAX_FETCH_CHARS) + "\n\n[… truncated]";
  }

  return { text, title };
}

/**
 * Resolve all URL context items to fetched text before the generation pipeline.
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
