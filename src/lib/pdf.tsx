// Polished PDF report renderer for MicroManus agent deliverables.
// Parses markdown with `marked`'s lexer and maps tokens to styled
// @react-pdf/renderer components. Built-in fonts only (no network fetch).
// Robust by design: unknown tokens degrade to plain text; never throws.

import React from "react";
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  renderToBuffer,
} from "@react-pdf/renderer";
import { marked, type Token, type Tokens } from "marked";

const INK = "#1a1a1a";
const INK_DIM = "#555555";
const ACCENT = "#c85a2a";
const LINE = "#d8d4cc";
const CODE_BG = "#f3f1ec";

const styles = StyleSheet.create({
  page: {
    paddingTop: 64,
    paddingBottom: 64,
    paddingHorizontal: 56,
    fontFamily: "Times-Roman",
    fontSize: 11,
    lineHeight: 1.5,
    color: INK,
  },
  // Title header block (first page)
  headerBlock: {
    marginBottom: 28,
    paddingBottom: 16,
    borderBottomWidth: 2,
    borderBottomColor: ACCENT,
  },
  kicker: {
    fontFamily: "Helvetica-Bold",
    fontSize: 8,
    letterSpacing: 2,
    color: ACCENT,
    marginBottom: 10,
  },
  title: {
    fontFamily: "Helvetica-Bold",
    fontSize: 26,
    lineHeight: 1.2,
    color: INK,
    marginBottom: 10,
  },
  meta: {
    fontFamily: "Helvetica",
    fontSize: 9,
    color: INK_DIM,
  },
  h1: {
    fontFamily: "Helvetica-Bold",
    fontSize: 18,
    color: INK,
    marginTop: 20,
    marginBottom: 8,
  },
  h2: {
    fontFamily: "Helvetica-Bold",
    fontSize: 14,
    color: INK,
    marginTop: 16,
    marginBottom: 6,
  },
  h3: {
    fontFamily: "Helvetica-Bold",
    fontSize: 12,
    color: INK,
    marginTop: 12,
    marginBottom: 4,
  },
  paragraph: {
    marginBottom: 10,
    textAlign: "justify",
  },
  listItem: {
    flexDirection: "row",
    marginBottom: 4,
    paddingLeft: 8,
  },
  bullet: {
    width: 16,
    color: ACCENT,
    fontFamily: "Helvetica-Bold",
  },
  listItemBody: {
    flex: 1,
  },
  blockquote: {
    borderLeftWidth: 3,
    borderLeftColor: LINE,
    paddingLeft: 12,
    marginBottom: 10,
    color: INK_DIM,
    fontStyle: "italic",
  },
  codeBlock: {
    fontFamily: "Courier",
    fontSize: 9,
    backgroundColor: CODE_BG,
    padding: 10,
    marginBottom: 10,
    borderRadius: 3,
    lineHeight: 1.4,
    color: INK,
  },
  hr: {
    borderBottomWidth: 1,
    borderBottomColor: LINE,
    marginVertical: 12,
  },
  strong: { fontFamily: "Times-Bold" },
  em: { fontFamily: "Times-Italic" },
  code: {
    fontFamily: "Courier",
    fontSize: 9.5,
    backgroundColor: CODE_BG,
    color: ACCENT,
  },
  link: { color: ACCENT, textDecoration: "underline" },
  footer: {
    position: "absolute",
    bottom: 32,
    left: 56,
    right: 56,
    flexDirection: "row",
    justifyContent: "space-between",
    fontFamily: "Helvetica",
    fontSize: 8,
    color: INK_DIM,
    borderTopWidth: 1,
    borderTopColor: LINE,
    paddingTop: 6,
  },
});

let keySeq = 0;
function nextKey(): string {
  keySeq += 1;
  return `k${keySeq}`;
}

// The built-in PDF fonts (Times/Helvetica/Courier) are WinAnsi-encoded and
// throw on glyphs they can't encode — ₹, emoji, arrows, CJK/Devanagari, etc.
// That's what makes create_pdf_report fail on Indian-context reports. Map the
// common ones to ASCII and drop the rest so rendering can never crash.
const SYMBOL_MAP: Record<string, string> = {
  "₹": "Rs. ", "→": " -> ", "←": " <- ", "↔": " <-> ", "⇒": " => ",
  "⇐": " <= ", "≈": "~", "≠": "!=", "≥": ">=", "≤": "<=", "×": "x",
  "÷": "/", "•": "•", "✓": "[x]", "✔": "[x]", "✅": "[x]", "✗": "[ ]",
  "✘": "[ ]", "❌": "[ ]", "★": "*", "☆": "*", "▪": "-", "▸": ">", "·": "·",
};

// Codepoints > 0xFF that ARE encodable in WinAnsi (the CP1252 hi-punctuation).
const WINANSI_EXTRA = new Set(
  "€‚ƒ„…†‡ˆ‰Š‹Œ Ž ‘’“”•–—˜™š›œ žŸ".split("").map((c) => c.codePointAt(0))
);

/** Make a string safe for the built-in PDF fonts — never throws on render. */
function sanitizeForPdf(input: string): string {
  if (!input) return "";
  let out = "";
  for (const ch of input) {
    const mapped = SYMBOL_MAP[ch];
    if (mapped !== undefined) {
      out += mapped;
      continue;
    }
    const cp = ch.codePointAt(0)!;
    if (cp <= 0xff || WINANSI_EXTRA.has(cp)) out += ch; // encodable → keep
    // else: emoji, variation selectors, CJK, Devanagari, … → drop silently
  }
  // Collapse whitespace runs left by dropped glyphs, but preserve newlines.
  return out.replace(/[ \t]{2,}/g, " ");
}

/** Render marked inline tokens to react-pdf <Text> fragments. */
function renderInline(
  tokens: Token[] | undefined,
  fallback: string
): React.ReactNode {
  if (!tokens || tokens.length === 0) return fallback;
  return tokens.map((t) => {
    const key = nextKey();
    switch (t.type) {
      case "strong":
        return (
          <Text key={key} style={styles.strong}>
            {renderInline((t as Tokens.Strong).tokens, (t as Tokens.Strong).text)}
          </Text>
        );
      case "em":
        return (
          <Text key={key} style={styles.em}>
            {renderInline((t as Tokens.Em).tokens, (t as Tokens.Em).text)}
          </Text>
        );
      case "codespan":
        return (
          <Text key={key} style={styles.code}>
            {" "}
            {(t as Tokens.Codespan).text}{" "}
          </Text>
        );
      case "link": {
        const link = t as Tokens.Link;
        return (
          <Text key={key} style={styles.link}>
            {renderInline(link.tokens, link.text)}
          </Text>
        );
      }
      case "br":
        return <Text key={key}>{"\n"}</Text>;
      case "del":
        return (
          <Text key={key}>
            {renderInline((t as Tokens.Del).tokens, (t as Tokens.Del).text)}
          </Text>
        );
      default: {
        const anyTok = t as { text?: string; raw?: string };
        return <Text key={key}>{anyTok.text ?? anyTok.raw ?? ""}</Text>;
      }
    }
  });
}

function renderListItem(
  item: Tokens.ListItem,
  ordered: boolean,
  index: number
): React.ReactNode {
  const marker = ordered ? `${index + 1}.` : "•";
  return (
    <View key={nextKey()} style={styles.listItem} wrap={false}>
      <Text style={styles.bullet}>{marker}</Text>
      <Text style={styles.listItemBody}>
        {renderInline(item.tokens, item.text)}
      </Text>
    </View>
  );
}

/** Render a top-level block token. */
function renderBlock(token: Token): React.ReactNode {
  const key = nextKey();
  switch (token.type) {
    case "heading": {
      const h = token as Tokens.Heading;
      const style = h.depth === 1 ? styles.h1 : h.depth === 2 ? styles.h2 : styles.h3;
      return (
        <Text key={key} style={style}>
          {renderInline(h.tokens, h.text)}
        </Text>
      );
    }
    case "paragraph": {
      const p = token as Tokens.Paragraph;
      return (
        <Text key={key} style={styles.paragraph}>
          {renderInline(p.tokens, p.text)}
        </Text>
      );
    }
    case "list": {
      const list = token as Tokens.List;
      const start = typeof list.start === "number" ? list.start : 1;
      return (
        <View key={key} style={{ marginBottom: 10 }}>
          {list.items.map((it, i) =>
            renderListItem(it, list.ordered, (list.ordered ? start - 1 : 0) + i)
          )}
        </View>
      );
    }
    case "blockquote": {
      const bq = token as Tokens.Blockquote;
      return (
        <View key={key} style={styles.blockquote}>
          {(bq.tokens ?? []).map((inner) => renderBlock(inner))}
        </View>
      );
    }
    case "code": {
      const c = token as Tokens.Code;
      return (
        <Text key={key} style={styles.codeBlock}>
          {c.text}
        </Text>
      );
    }
    case "hr":
      return <View key={key} style={styles.hr} />;
    case "space":
      return null;
    case "table": {
      // Degrade a GFM table to readable text rows.
      const tbl = token as Tokens.Table;
      const header = tbl.header.map((c) => c.text).join("  |  ");
      const rows = tbl.rows.map((r) => r.map((c) => c.text).join("  |  "));
      return (
        <View key={key} style={{ marginBottom: 10 }}>
          <Text style={styles.strong}>{header}</Text>
          {rows.map((r) => (
            <Text key={nextKey()}>{r}</Text>
          ))}
        </View>
      );
    }
    default: {
      const anyTok = token as { text?: string; raw?: string };
      const text = anyTok.text ?? anyTok.raw ?? "";
      if (!text.trim()) return null;
      return (
        <Text key={key} style={styles.paragraph}>
          {text}
        </Text>
      );
    }
  }
}

function formatDate(): string {
  return new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/** Render a markdown report to a PDF Buffer. Never throws on bad markdown. */
export async function renderReportPdf(
  title: string,
  markdown: string
): Promise<Buffer> {
  keySeq = 0;
  // Sanitize before lexing so every downstream Text node is font-safe.
  const md = sanitizeForPdf(markdown ?? "");
  let tokens: Token[] = [];
  try {
    tokens = marked.lexer(md);
  } catch {
    tokens = [{ type: "paragraph", raw: md, text: md } as Tokens.Paragraph];
  }

  const blocks = tokens
    .map((t) => {
      try {
        return renderBlock(t);
      } catch {
        return null;
      }
    })
    .filter(Boolean);

  const safeTitle = sanitizeForPdf((title || "Research Report").trim());

  const doc = (
    <Document title={safeTitle} author="MicroManus">
      <Page size="A4" style={styles.page}>
        <View style={styles.headerBlock} fixed={false}>
          <Text style={styles.kicker}>MICROMANUS · RESEARCH REPORT</Text>
          <Text style={styles.title}>{safeTitle}</Text>
          <Text style={styles.meta}>{formatDate()}</Text>
        </View>
        {blocks}
        <View style={styles.footer} fixed>
          <Text>Generated by MicroManus</Text>
          <Text
            render={({ pageNumber, totalPages }) =>
              `${pageNumber} / ${totalPages}`
            }
          />
        </View>
      </Page>
    </Document>
  );

  return renderToBuffer(doc);
}
