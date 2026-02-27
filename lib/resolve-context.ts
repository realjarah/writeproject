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

/**
 * Attempt to fetch a URL and return its content as clean text.
 * Returns null on any failure so callers can degrade gracefully.
 */
export async function fetchUrlAsText(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; WriteGhost/1.0; +content-fetch)",
        Accept: "text/html,text/plain,*/*",
      },
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) return null;

    const contentType = res.headers.get("content-type") ?? "";
    if (contentType.includes("text/html")) {
      const html = await res.text();
      return htmlToText(html) || null;
    }
    if (contentType.includes("text/")) {
      return (await res.text()).trim() || null;
    }
    return null; // binary or unknown
  } catch {
    return null;
  }
}

/**
 * Resolve all URL context items to fetched text before the generation pipeline.
 * Items that fail to resolve keep their original shape (url only, no fetchedText)
 * so buildContextBlock can note they were unavailable.
 */
export async function resolveContext(
  context: GenerationContext
): Promise<GenerationContext> {
  const items = await Promise.all(
    context.items.map(async (item): Promise<ContextItem> => {
      if (!item.url) return item;
      const text = await fetchUrlAsText(item.url);
      if (!text) return item; // keep url, no fetchedText — signals failure
      return { ...item, fetchedText: text };
    })
  );
  return { items };
}
