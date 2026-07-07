/**
 * Pure helpers for the IMAP wire protocol (RFC 3501). The one genuinely tricky
 * part of reading IMAP is literals: a line ending in `{n}` means the next n
 * octets are raw data that may contain CRLFs and even text that looks like a
 * tagged completion. `scanResponse` walks a buffer literal-aware so the client
 * knows exactly when a command's response is complete.
 */

export type ImapStatus = "OK" | "NO" | "BAD";

export interface ScanResult {
  complete: boolean;
  status?: ImapStatus;
  /** The tagged status line text, e.g. "A001 OK LOGIN completed". */
  statusLine?: string;
  /** Bytes consumed through the completion line (only when complete). */
  consumed?: number;
}

const LITERAL_AT_END = /\{(\d+)\}$/;

/**
 * Scan a response buffer for the tagged completion line for `tag`, skipping
 * over `{n}` literals. Returns complete=false when more data is needed.
 */
export function scanResponse(buf: Uint8Array, tag: string): ScanResult {
  const text = latin1(buf);
  let i = 0;
  while (i < text.length) {
    const nl = text.indexOf("\r\n", i);
    if (nl === -1) return { complete: false };
    const line = text.slice(i, nl);
    const lit = LITERAL_AT_END.exec(line);
    if (lit) {
      // Skip the CRLF and the literal octets, then keep scanning.
      i = nl + 2 + Number(lit[1]);
      continue;
    }
    if (line.startsWith(`${tag} `)) {
      const m = /^\S+\s+(OK|NO|BAD)\b/.exec(line);
      if (m) {
        return { complete: true, status: m[1] as ImapStatus, statusLine: line, consumed: nl + 2 };
      }
    }
    i = nl + 2;
  }
  return { complete: false };
}

/** Decode bytes as latin1 (1:1) for structural scanning. */
export function latin1(buf: Uint8Array): string {
  let s = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < buf.length; i += CHUNK) {
    s += String.fromCharCode(...buf.subarray(i, i + CHUNK));
  }
  return s;
}

/** Extract the first `{n}` literal's octets from a FETCH response. */
export function extractFirstLiteral(buf: Uint8Array): Uint8Array | undefined {
  const text = latin1(buf);
  const m = /\{(\d+)\}\r\n/.exec(text);
  if (!m) return undefined;
  const start = m.index + m[0].length;
  const n = Number(m[1]);
  return buf.subarray(start, start + n);
}

/** Parse the message count from an untagged `* N EXISTS` line. */
export function parseExists(response: string): number | undefined {
  const m = /^\* (\d+) EXISTS/m.exec(response);
  return m ? Number(m[1]) : undefined;
}

/** Parse the ids from an untagged `* SEARCH a b c` line. */
export function parseSearch(response: string): number[] {
  const m = /^\* SEARCH([^\r\n]*)/m.exec(response);
  if (!m) return [];
  return m[1]!
    .trim()
    .split(/\s+/)
    .filter((t) => /^\d+$/.test(t))
    .map(Number);
}

/** Quote a string as an IMAP quoted-string (for LOGIN / SELECT arguments). */
export function imapQuote(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}
