export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { fetchUrlAsText, htmlToText } from "@/lib/resolve-context";

export async function POST(req: NextRequest) {
  const { url } = await req.json();
  if (!url?.trim()) {
    return NextResponse.json({ error: "url required" }, { status: 400 });
  }

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; WriteGhost/1.0; +content-fetch)",
        Accept: "text/html,text/plain,*/*",
      },
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: `Could not fetch URL (HTTP ${res.status})` },
        { status: 400 }
      );
    }

    const contentType = res.headers.get("content-type") ?? "";
    let text: string;

    if (contentType.includes("text/html")) {
      const html = await res.text();
      // Extract title from <title> tag for pre-filling the sample title
      const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
      const pageTitle = titleMatch
        ? titleMatch[1].replace(/\s*[|\-–—].*$/, "").trim() // strip site name suffix
        : "";
      text = htmlToText(html);
      if (!text) {
        return NextResponse.json({ error: "No readable content found at this URL." }, { status: 400 });
      }
      return NextResponse.json({ text, title: pageTitle });
    }

    if (contentType.includes("text/")) {
      text = (await res.text()).trim();
      if (!text) {
        return NextResponse.json({ error: "No content found at this URL." }, { status: 400 });
      }
      return NextResponse.json({ text, title: "" });
    }

    return NextResponse.json(
      { error: "URL does not point to readable text content." },
      { status: 400 }
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: `Fetch failed: ${msg}` }, { status: 400 });
  }
}
