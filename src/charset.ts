/** Decode bytes to a string using a MIME charset label, with sensible fallbacks. */

/** Normalize a charset label to one the platform TextDecoder understands. */
export function normalizeCharset(label: string | undefined): string {
  const c = (label ?? "utf-8").trim().toLowerCase().replace(/^["']|["']$/g, "");
  if (c === "" || c === "us-ascii" || c === "ascii" || c === "ansi_x3.4-1968") {
    return "utf-8"; // ASCII is a subset of UTF-8.
  }
  if (c === "utf8") return "utf-8";
  if (c === "cp932" || c === "windows-932" || c === "ms932") return "shift_jis";
  if (c === "cp936" || c === "ms936") return "gbk";
  if (c === "latin1" || c === "cp1252") return "windows-1252";
  return c;
}

/**
 * Decode a byte buffer as text. Unknown charsets fall back to UTF-8, then to a
 * lossy Latin-1 pass so a body is never lost to a decoding error.
 */
export function decodeBytes(bytes: Uint8Array, label?: string): string {
  const charset = normalizeCharset(label);
  try {
    return new TextDecoder(charset, { fatal: false }).decode(bytes);
  } catch {
    try {
      return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
    } catch {
      let out = "";
      for (const b of bytes) out += String.fromCharCode(b);
      return out;
    }
  }
}

/** Decode a UTF-16LE buffer (used by .msg Unicode property streams). */
export function decodeUtf16Le(bytes: Uint8Array): string {
  return new TextDecoder("utf-16le", { fatal: false }).decode(bytes);
}
