/** A small, dependency-free HTML-to-text converter for reading email bodies. */

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  copy: "©",
  reg: "®",
  hellip: "…",
  mdash: "—",
  ndash: "–",
  rsquo: "’",
  lsquo: "‘",
  rdquo: "”",
  ldquo: "“",
  yen: "¥",
  middot: "·",
  trade: "™",
};

/** Decode HTML character references (named and numeric) in a text run. */
export function decodeEntities(text: string): string {
  return text.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/g, (whole, body: string) => {
    if (body[0] === "#") {
      const code =
        body[1] === "x" || body[1] === "X"
          ? parseInt(body.slice(2), 16)
          : parseInt(body.slice(1), 10);
      return Number.isFinite(code) && code > 0 ? String.fromCodePoint(code) : whole;
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? whole;
  });
}

// Elements after which a line break reads naturally.
const BLOCK = "address|article|aside|blockquote|br|div|dd|dl|dt|footer|form|h[1-6]|header|hr|li|main|nav|ol|p|pre|section|table|tbody|td|th|thead|tr|ul";
const BLOCK_RE = new RegExp(`</?(?:${BLOCK})(?:\\s[^>]*)?>`, "gi");

/**
 * Convert an HTML document to readable plain text: scripts and styles are
 * dropped, block-level tags become line breaks, remaining tags are stripped,
 * entities are decoded, and runaway blank lines are collapsed.
 */
export function htmlToText(html: string): string {
  let s = html;
  s = s.replace(/<!--[\s\S]*?-->/g, "");
  s = s.replace(/<(script|style|head|title)\b[\s\S]*?<\/\1>/gi, "");
  s = s.replace(/<\s*br\s*\/?>/gi, "\n");
  s = s.replace(/<\s*\/\s*(p|div|tr|li|h[1-6]|table|blockquote|section|header|footer)\s*>/gi, "\n");
  s = s.replace(BLOCK_RE, "\n");
  s = s.replace(/<[^>]+>/g, ""); // Strip any remaining tags.
  s = decodeEntities(s);
  s = s.replace(/[ \t]+\n/g, "\n").replace(/\n[ \t]+/g, "\n");
  s = s.replace(/\n{3,}/g, "\n\n");
  return s.replace(/^\s+|\s+$/g, "");
}
