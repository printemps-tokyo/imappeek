/** Quoted-Printable and Base64 decoders producing raw bytes (RFC 2045). */

/** Decode a Quoted-Printable string to bytes. `underscoreToSpace` is for RFC 2047 'Q'. */
export function decodeQuotedPrintable(input: string, underscoreToSpace = false): Uint8Array {
  const out: number[] = [];
  for (let i = 0; i < input.length; i++) {
    const ch = input[i] as string;
    if (ch === "=") {
      const hex = input.slice(i + 1, i + 3);
      if (hex === "\r\n" || hex === "\n") {
        // Soft line break: skip the newline.
        i += hex.length;
        continue;
      }
      if (/^[0-9A-Fa-f]{2}$/.test(hex)) {
        out.push(parseInt(hex, 16));
        i += 2;
        continue;
      }
      out.push(ch.charCodeAt(0)); // Stray '='; keep it literally.
      continue;
    }
    if (ch === "_" && underscoreToSpace) {
      out.push(0x20);
      continue;
    }
    out.push(ch.charCodeAt(0));
  }
  return new Uint8Array(out);
}

/** Decode a Base64 string (ignoring whitespace) to bytes. */
export function decodeBase64(input: string): Uint8Array {
  const clean = input.replace(/[^A-Za-z0-9+/=]/g, "");
  // Buffer is a Node builtin; base64 decoding is robust and dependency-free.
  return new Uint8Array(Buffer.from(clean, "base64"));
}
