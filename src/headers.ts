/** Parse and unfold an RFC 5322 header block into ordered fields. */
import { decodeEncodedWords } from "./encoded-word.js";
import type { Header } from "./mail.js";

const ENCODED_WORD_TEST = /=\?[^?]+\?[BbQq]\?[^?]*\?=/;

function hasHighByte(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    if (s.charCodeAt(i) > 0x7f) return true;
  }
  return false;
}

/**
 * Decode a header value. Encoded-words carry their own charset; a value with no
 * encoded-word but with high bytes (a byte-preserving latin1 view of raw UTF-8,
 * as some agents emit) is reinterpreted as UTF-8.
 */
function decodeHeaderValue(value: string): string {
  if (ENCODED_WORD_TEST.test(value)) {
    return decodeEncodedWords(value);
  }
  if (!hasHighByte(value)) {
    return value;
  }
  const bytes = new Uint8Array(value.length);
  for (let i = 0; i < value.length; i++) bytes[i] = value.charCodeAt(i) & 0xff;
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
}

/**
 * Parse a raw header block (everything before the empty separator line) into an
 * ordered list of `{ name, value }`. Folded continuation lines (leading space or
 * tab) are joined, and encoded-words in each value are decoded.
 */
export function parseHeaderBlock(raw: string): Header[] {
  const lines = raw.replace(/\r\n/g, "\n").split("\n");
  const headers: Header[] = [];
  let current: { name: string; lines: string[] } | undefined;

  const flush = (): void => {
    if (!current) return;
    // RFC 5322 unfolding: replace the CRLF+WSP fold with a single space.
    const value = current.lines
      .map((l, i) => (i === 0 ? l : l.replace(/^[ \t]+/, " ")))
      .join("")
      .trim();
    headers.push({ name: current.name, value: decodeHeaderValue(value) });
    current = undefined;
  };

  for (const line of lines) {
    if (line === "") continue;
    if (/^[ \t]/.test(line) && current) {
      current.lines.push(line);
      continue;
    }
    const colon = line.indexOf(":");
    if (colon === -1) {
      // Not a valid header line; attach to the current value if any.
      if (current) current.lines.push(line);
      continue;
    }
    flush();
    current = { name: line.slice(0, colon).trim(), lines: [line.slice(colon + 1).replace(/^ /, "")] };
  }
  flush();
  return headers;
}

/**
 * Split a raw message (bytes decoded to a binary-safe latin1 string) at the
 * first blank line into the header block and the remaining body text.
 */
export function splitHeaderBody(raw: string): { header: string; body: string } {
  const normalized = raw.replace(/\r\n/g, "\n");
  const idx = normalized.indexOf("\n\n");
  if (idx === -1) {
    return { header: normalized, body: "" };
  }
  return { header: normalized.slice(0, idx), body: normalized.slice(idx + 2) };
}
