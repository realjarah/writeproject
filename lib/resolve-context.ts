import { GenerationContext, ContextItem } from "./content-types";

/**
 * Strip HTML to clean prose text.
 * Removes scripts, styles, nav, header, footer, then all remaining tags.
 * Decodes common HTML entities and collapses whitespace.
 */
export function htmlToText(html: string): string {
  return html
    // Remove doctype and comments
    .replace(/<!DOCTYPE[^>]*>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    // Remove entire blocks that are never content
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<nav[\s\S]*?<\/nav>/gi, "")
    .replace(/<header[\s\S]*?<\/header>/gi, "")
    .replace(/<footer[\s\S]*?<\/footer>/gi, "")
    .replace(/<aside[\s\S]*?<\/aside>/gi, "")
    // Block-level tags → newline so paragraphs survive
    .replace(/<\/(p|div|li|h[1-6]|blockquote|section|article|main)>/gi, "\n")
    // Strip all remaining tags
    .replace(/<[^>]+>/g, "")
    // Decode entities
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&nbsp;/gi, " ")
    .replace(/&quot;/gi, '"')
    .replace(/&#8220;|&#x201C;/gi, "\u201C")
    .replace(/&#8221;|&#x201D;/gi, "\u201D")
    .replace(/&#8216;|&#x2018;/gi, "\u2018")
    .replace(/&#8217;|&#x2019;/gi, "\u2019")
    .replace(/&#8212;|&#x2014;/gi, "\u2014")
    .replace(/&#8211;|&#x2013;/gi, "\u2013")
    .replace(/&[a-z#0-9]+;/gi, " ")
    // Collapse runs of blank lines to a single blank line, trim
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+/g, " ")
    .trim();
}

/** Max characters per fetched URL (~50K words). Prevents a single huge page from blowing context. */
const MAX_FETCH_CHARS = 200_000;

/**
 * Attempt to fetch a URL and return its content as clean text.
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
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(15_000),
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
    } else if (contentType.includes("text/") || contentType.includes("application/json") || contentType.includes("application/xml")) {
      text = (await res.text()).trim();
    } else {
      console.warn(`[fetchUrlAsText] Unsupported content-type "${contentType}" for ${url}`);
      return null;
    }

    // Truncate huge pages to prevent blowing the context window
    if (text.length > MAX_FETCH_CHARS) {
      console.warn(`[fetchUrlAsText] Truncating ${url} from ${text.length} to ${MAX_FETCH_CHARS} chars`);
      text = text.slice(0, MAX_FETCH_CHARS) + "\n\n[… truncated]";
    }
    // Distinguish genuinely empty page from parse failure: an empty string
    // after cleanup means the page had no meaningful text content.
    return text || null;
  } catch (err) {
    console.warn(`[fetchUrlAsText] Failed to fetch ${url}:`, err instanceof Error ? err.message : err);
    return null;
  }
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
    // Rejected promise — keep original item without fetched text
    console.warn(`[resolveContext] Failed to resolve item ${i}:`, result.reason);
    return context.items[i];
  });

  return { items };
}
