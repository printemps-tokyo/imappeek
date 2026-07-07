/** RFC 2047 "encoded-word" decoding for MIME header values. */
import { decodeBytes } from "./charset.js";
import { decodeBase64, decodeQuotedPrintable } from "./quoted-printable.js";

// =?charset?B|Q?text?=
const ENCODED_WORD = /=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g;

/**
 * Decode all RFC 2047 encoded-words in a header value. Adjacent encoded-words
 * are joined without the intervening whitespace (per the spec), while ordinary
 * runs of text are preserved as-is.
 */
export function decodeEncodedWords(value: string): string {
  let out = "";
  let lastEnd = 0;
  let prevWasEncoded = false;

  ENCODED_WORD.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = ENCODED_WORD.exec(value)) !== null) {
    const between = value.slice(lastEnd, match.index);
    // Whitespace separating two encoded-words is not significant.
    if (!(prevWasEncoded && between.trim() === "")) {
      out += between;
    }

    const [, charset, encoding, text] = match;
    const bytes =
      (encoding as string).toUpperCase() === "B"
        ? decodeBase64(text as string)
        : decodeQuotedPrintable(text as string, true);
    out += decodeBytes(bytes, charset);

    lastEnd = match.index + match[0].length;
    prevWasEncoded = true;
  }
  out += value.slice(lastEnd);
  return out;
}
