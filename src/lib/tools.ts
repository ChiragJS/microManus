// Agent tools exposed to the LLM: web search, URL fetch, PDF report.
// Each tool has an LlmTool schema (src/lib/llm.ts) and an executor.

import crypto from "crypto";
import type { LlmTool } from "./llm";
import type { Artifact } from "./types";
import { renderReportPdf } from "./pdf";
import { createAdminClient } from "./supabase/admin";

export const AGENT_TOOLS: LlmTool[] = [
  {
    name: "web_search",
    description:
      "Search the web via Brave Search. Returns up to 10 results as JSON [{title, url, snippet, age}] where `age` is how recently the page was published/updated (null if unknown). Run MULTIPLE targeted queries per question and cross-check facts across independent sources. For anything time-sensitive (news, current events, prices, rankings, 'latest'/'recent'/this year), set `freshness` to restrict results to recent pages and prefer results with a recent `age`.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            "A specific, targeted query. Include the year or a recency term (e.g. '2026', 'latest') when currency matters.",
        },
        freshness: {
          type: "string",
          enum: ["day", "week", "month", "year", "any"],
          description:
            "Restrict results by recency: 'day' = past 24h, 'week' = past 7 days, 'month' = past 31 days, 'year' = past 12 months, 'any' = no limit. Use a tight window for news/current events; 'any' for stable/historical facts.",
        },
      },
      required: ["query"],
      additionalProperties: false,
    },
  },
  {
    name: "fetch_url",
    description:
      "Fetch a web page (http/https only) and return its readable text content, truncated to ~18,000 characters. Use to actually READ and verify the most authoritative sources found via web_search — don't rely on search snippets for anything important.",
    parameters: {
      type: "object",
      properties: {
        url: { type: "string", description: "The absolute http(s) URL to fetch." },
      },
      required: ["url"],
      additionalProperties: false,
    },
  },
  {
    name: "create_pdf_report",
    description:
      "Render a polished PDF report from markdown and store it as a downloadable artifact. Provide a clear title and well-structured markdown (title, sections, findings, recommendations, and a sources list with links). Call this when the user asks for a report/document or the research warrants a deliverable.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string", description: "The report title." },
        markdown: {
          type: "string",
          description:
            "The full report body in markdown: headings, paragraphs, bullet/numbered lists, blockquotes, and inline links for sources.",
        },
      },
      required: ["title", "markdown"],
      additionalProperties: false,
    },
  },
];

interface BraveResult {
  title?: string;
  url?: string;
  description?: string;
  age?: string;
  page_age?: string;
}

const FRESHNESS_MAP: Record<string, string> = {
  day: "pd",
  week: "pw",
  month: "pm",
  year: "py",
};

/** Brave web search → compact JSON string of [{title, url, snippet, age}]. */
export async function webSearch(query: string, freshness?: string): Promise<string> {
  const apiKey = process.env.BRAVE_SEARCH_API_KEY;
  if (!apiKey) {
    return JSON.stringify({ error: "Web search is unavailable: BRAVE_SEARCH_API_KEY is not configured." });
  }
  if (!query || !query.trim()) {
    return JSON.stringify({ error: "Empty query." });
  }
  try {
    const brave = freshness && FRESHNESS_MAP[freshness];
    const url =
      `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=10` +
      (brave ? `&freshness=${brave}` : "");
    const res = await fetch(url, {
      headers: {
        Accept: "application/json",
        "Accept-Encoding": "gzip",
        "X-Subscription-Token": apiKey,
      },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return JSON.stringify({
        error: `Brave Search failed (${res.status}). ${body.slice(0, 200)}`,
      });
    }
    const data = await res.json();
    const results: BraveResult[] = data?.web?.results ?? [];
    const compact = results.slice(0, 10).map((r) => ({
      title: r.title ?? "",
      url: r.url ?? "",
      snippet: (r.description ?? "").replace(/<[^>]+>/g, ""),
      // Recency signal so the agent can bias toward fresh sources.
      age: r.age ?? (r.page_age ? r.page_age.slice(0, 10) : null),
    }));
    if (compact.length === 0) {
      return JSON.stringify({ results: [], note: "No results found." });
    }
    return JSON.stringify(compact);
  } catch (err) {
    return JSON.stringify({
      error: `Web search error: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
}

const FETCH_LIMIT = 18000;

/** Fetch a URL and return readable, whitespace-collapsed text (truncated). */
export async function fetchUrl(url: string): Promise<string> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return `Error: invalid URL "${url}".`;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return `Error: only http/https URLs are supported (got ${parsed.protocol}).`;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(parsed.toString(), {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });
    if (!res.ok) {
      return `Error: fetch failed with status ${res.status} for ${parsed.toString()}.`;
    }
    const contentType = res.headers.get("content-type") ?? "";
    const raw = await res.text();
    let text: string;
    if (contentType.includes("html") || /<html|<body|<div|<p[ >]/i.test(raw)) {
      text = htmlToText(raw);
    } else {
      text = raw;
    }
    text = text.replace(/[ \t\f\v]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
    if (text.length > FETCH_LIMIT) {
      text = `${text.slice(0, FETCH_LIMIT)}\n\n[truncated]`;
    }
    if (!text) return `Error: no readable text extracted from ${parsed.toString()}.`;
    return text;
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      return `Error: request to ${parsed.toString()} timed out after 15s.`;
    }
    return `Error: ${err instanceof Error ? err.message : String(err)}`;
  } finally {
    clearTimeout(timeout);
  }
}

/** Strip scripts/styles/tags → readable text. */
function htmlToText(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
    .replace(/<\/(p|div|section|article|li|h[1-6]|tr|br|header|footer)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&[a-z]+;/gi, " ");
}

/** Render a PDF, upload to the `artifacts` bucket, return an Artifact. */
export async function createPdfReport(
  title: string,
  markdown: string,
  userId: string
): Promise<Artifact> {
  const buffer = await renderReportPdf(title, markdown);
  const admin = createAdminClient();
  const path = `${userId}/${crypto.randomUUID()}.pdf`;

  const { error } = await admin.storage
    .from("artifacts")
    .upload(path, buffer, { contentType: "application/pdf", upsert: false });
  if (error) {
    throw new Error(`Failed to store PDF: ${error.message}`);
  }

  const { data } = admin.storage.from("artifacts").getPublicUrl(path);
  const safeTitle = (title || "report").trim();
  const name = `${slugify(safeTitle)}.pdf`;

  return { type: "pdf", name, url: data.publicUrl, path, title: safeTitle, markdown };
}

function slugify(s: string): string {
  const slug = s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return slug || "report";
}
