"use client";

import { useState, type ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { Globe, FileText } from "lucide-react";
import type { AgentStep } from "@/lib/types";

/* ------------------------------------------------------------------ */
/* Source extraction + favicon helpers                                 */
/* ------------------------------------------------------------------ */

export interface Source {
  href: string;
  host: string;
  title: string;
}

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url.replace(/^https?:\/\//, "").split("/")[0] ?? url;
  }
}

/** Short human label for a host, e.g. news.ycombinator.com -> "ycombinator". */
export function domainSlug(host: string): string {
  const labels = host.replace(/^www\./, "").split(".").filter(Boolean);
  if (labels.length <= 1) return labels[0] ?? host;
  return labels[labels.length - 2];
}

export function faviconUrl(host: string): string {
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=32`;
}

const MD_LINK = /\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)/g;
const AUTO_LINK = /<(https?:\/\/[^>\s]+)>/g;
const BARE_LINK = /(?<![("<])\bhttps?:\/\/[^\s)<>\]]+/g;

/**
 * Our own generated PDF artifacts live under the Supabase storage bucket path
 * below. The model links them in its answer ("Download report…"), but they are
 * NOT research sources — exclude them so the Sources rail shows only the real
 * websites the agent read.
 */
const ARTIFACT_LINK = /\/storage\/v1\/object\/[^\s)]*\/artifacts\//i;

/** Pull every http(s) link out of a markdown string, deduped by href. */
export function extractSources(content: string): Source[] {
  if (!content) return [];
  const byHref = new Map<string, Source>();
  const add = (href: string, title: string) => {
    const clean = href.replace(/[.,;)]+$/, "");
    if (byHref.has(clean)) return;
    if (ARTIFACT_LINK.test(clean)) return; // skip our own PDF download links
    const host = hostOf(clean);
    const label = title && !/^https?:\/\//.test(title) ? title.trim() : host;
    byHref.set(clean, { href: clean, host, title: label || host });
  };
  let m: RegExpExecArray | null;
  while ((m = MD_LINK.exec(content))) add(m[2], m[1]);
  while ((m = AUTO_LINK.exec(content))) add(m[1], "");
  while ((m = BARE_LINK.exec(content))) add(m[0], "");
  return [...byHref.values()];
}

/**
 * Sources the agent actually read — the URLs it opened via the fetch_url tool
 * (stored as the step summary). This is the authoritative source list even
 * when the model cites everything in the PDF instead of the chat answer.
 * Merged with any inline links in the answer; artifact/PDF links excluded.
 */
export function messageSources(
  content: string,
  steps?: AgentStep[] | null
): Source[] {
  const byHref = new Map<string, Source>();
  for (const s of extractSources(content)) byHref.set(s.href, s);
  for (const step of steps ?? []) {
    if (step.type !== "tool_call" || step.tool !== "fetch_url") continue;
    const url = (step.summary ?? "").trim();
    if (!/^https?:\/\//.test(url) || ARTIFACT_LINK.test(url)) continue;
    if (byHref.has(url)) continue;
    const host = hostOf(url);
    byHref.set(url, { href: url, host, title: host });
  }
  return [...byHref.values()];
}

/* ------------------------------------------------------------------ */
/* Favicon with graceful fallback                                      */
/* ------------------------------------------------------------------ */

export function Favicon({ host, size = 16 }: { host: string; size?: number }) {
  const [err, setErr] = useState(false);
  if (err || !host) {
    return <Globe size={size} className="shrink-0 text-ink-dim" />;
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={faviconUrl(host)}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      onError={() => setErr(true)}
      className="shrink-0 rounded-sm"
      style={{ width: size, height: size }}
    />
  );
}

/* ------------------------------------------------------------------ */
/* Inline citation chip (markdown <a> override)                        */
/* ------------------------------------------------------------------ */

function childrenToText(node: ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string") return node;
  if (typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(childrenToText).join("");
  if (typeof node === "object" && "props" in node) {
    return childrenToText((node as { props: { children?: ReactNode } }).props.children);
  }
  return "";
}

export function CitationLink({
  href,
  children,
}: {
  href?: string;
  children?: ReactNode;
}) {
  const url = href ?? "";
  const host = hostOf(url);
  const slug = domainSlug(host);
  const raw = childrenToText(children).trim();
  const isBare = !raw || /^https?:\/\//.test(raw) || /^\[?\d+\]?$/.test(raw);
  const title = isBare ? host : raw;

  // Our own generated PDF: render as a "Download PDF" chip, not a source pill.
  if (ARTIFACT_LINK.test(url)) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="mx-0.5 inline-flex items-center gap-1 rounded border border-accent/40 bg-accent-dim px-1.5 py-px align-middle text-[0.72rem] leading-none text-accent no-underline transition-opacity hover:opacity-80"
      >
        <FileText size={12} />
        <span className="max-w-[16rem] truncate">{isBare ? "Download PDF" : raw}</span>
      </a>
    );
  }

  return (
    <span className="group/cite relative inline-flex align-baseline">
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="mx-0.5 inline-flex items-center gap-1 rounded border border-line bg-surface-2 px-1 py-px align-middle font-mono text-[0.68rem] leading-none text-ink-dim no-underline transition-colors hover:border-accent/50 hover:text-accent"
      >
        <Favicon host={host} size={12} />
        <span className="max-w-[9rem] truncate">{slug}</span>
      </a>
      <span className="pointer-events-none absolute bottom-full left-0 z-30 mb-1 hidden w-72 group-hover/cite:block">
        <span className="mm-pop-in pointer-events-auto block rounded-lg border border-line bg-surface p-2.5 shadow-xl">
          <span className="mb-1 flex items-center gap-1.5">
            <Favicon host={host} size={14} />
            <span className="truncate font-mono text-[0.7rem] text-ink-dim">{host}</span>
          </span>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="pointer-events-auto block text-[0.8rem] leading-snug text-ink hover:text-accent"
          >
            {title}
          </a>
        </span>
      </span>
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* "Sources" row — overlapping favicons + hover list                   */
/* ------------------------------------------------------------------ */

/** Rich source row: favicon + domain slug on line 1, page title on line 2. */
export function SourceRow({ source }: { source: Source }) {
  const slug = domainSlug(source.host);
  const showTitle = source.title && source.title !== source.host;
  return (
    <a
      href={source.href}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-start gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-surface-2"
    >
      <span className="mt-0.5">
        <Favicon host={source.host} size={15} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-mono text-[0.65rem] text-ink-dim">{slug}</span>
        {showTitle && (
          <span className="mt-0.5 line-clamp-1 text-[0.8rem] leading-snug text-ink">
            {source.title}
          </span>
        )}
      </span>
    </a>
  );
}

export function SourcesRow({ sources }: { sources: Source[] }) {
  if (sources.length === 0) return null;
  const seenHost = new Set<string>();
  const faviconHosts: string[] = [];
  for (const s of sources) {
    if (seenHost.has(s.host)) continue;
    seenHost.add(s.host);
    faviconHosts.push(s.host);
    if (faviconHosts.length >= 8) break;
  }

  return (
    <div className="group/sources relative mt-3 inline-flex">
      <button
        type="button"
        className="flex items-center gap-2 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs text-ink-dim transition-colors hover:border-accent/40 hover:text-ink"
      >
        <span className="flex -space-x-1.5">
          {faviconHosts.map((h) => (
            <span
              key={h}
              className="flex h-4 w-4 items-center justify-center rounded-full border border-surface bg-surface-2"
            >
              <Favicon host={h} size={11} />
            </span>
          ))}
        </span>
        <span className="font-mono">
          {sources.length} source{sources.length === 1 ? "" : "s"}
        </span>
      </button>

      <div className="pointer-events-none absolute bottom-full left-0 z-30 mb-1.5 hidden w-80 group-hover/sources:block">
        <div className="mm-pop-in pointer-events-auto max-h-72 overflow-y-auto rounded-lg border border-line bg-surface p-1.5 shadow-xl">
          {sources.map((s) => (
            <SourceRow key={s.href} source={s} />
          ))}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Shared markdown component map (used by messages + artifact viewer)  */
/* ------------------------------------------------------------------ */

export const markdownComponents: Components = {
  a: ({ href, children }) => <CitationLink href={href}>{children}</CitationLink>,
  code: ({ className, children, ...props }) => {
    const isBlock = /language-/.test(className ?? "");
    if (isBlock) {
      return (
        <code className={`${className ?? ""} block`} {...props}>
          {children}
        </code>
      );
    }
    return (
      <code
        className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[0.85em] text-ink"
        {...props}
      >
        {children}
      </code>
    );
  },
  pre: ({ children }) => (
    <pre className="my-3 overflow-x-auto rounded-lg border border-line bg-surface-2 p-3 font-mono text-[0.82em] leading-relaxed">
      {children}
    </pre>
  ),
  h1: ({ children }) => (
    <h1 className="mt-5 mb-2 text-xl font-semibold tracking-tight text-ink">{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 className="mt-5 mb-2 text-lg font-semibold tracking-tight text-ink">{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 className="mt-4 mb-1.5 text-base font-semibold tracking-tight text-ink">{children}</h3>
  ),
  p: ({ children }) => <p className="my-2.5 leading-relaxed">{children}</p>,
  ul: ({ children }) => <ul className="my-2.5 ml-5 list-disc space-y-1">{children}</ul>,
  ol: ({ children }) => <ol className="my-2.5 ml-5 list-decimal space-y-1">{children}</ol>,
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  blockquote: ({ children }) => (
    <blockquote className="my-3 border-l-2 border-accent/50 pl-3 text-ink-dim italic">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="my-5 border-line" />,
  table: ({ children }) => (
    <div className="my-3.5 overflow-x-auto rounded-lg border border-line">
      <table className="w-full border-collapse text-[0.8rem]">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-surface-2">{children}</thead>,
  th: ({ children }) => (
    <th className="border-b border-line px-3 py-2.5 text-left font-semibold text-ink [&:not(:first-child)]:border-l">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="border-t border-line px-3 py-2.5 align-top leading-relaxed [&:not(:first-child)]:border-l">
      {children}
    </td>
  ),
  strong: ({ children }) => <strong className="font-semibold text-ink">{children}</strong>,
};

/** Convenience wrapper so callers don't re-import remark plugins. */
export function Markdown({ children }: { children: string }) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
      {children}
    </ReactMarkdown>
  );
}
