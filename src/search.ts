/**
 * IMAP SEARCH criteria (RFC 3501 section 6.4.4) from simple options. ASCII
 * strings go as quoted strings; anything else as a UTF-8 literal with
 * CHARSET UTF-8, which is how non-English searches have to be sent.
 */
import { imapQuote } from "./protocol.js";

export interface SearchOptions {
  unseen?: boolean;
  from?: string;
  to?: string;
  subject?: string;
  /** Anywhere in the headers or body. */
  text?: string;
  /** On or after this date (YYYY-MM-DD). */
  since?: string;
  /** Before this date (YYYY-MM-DD). */
  before?: string;
}

export interface Segment {
  text: string;
  literal?: Uint8Array;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** YYYY-MM-DD as an IMAP date, e.g. 2026-11-02 -> 2-Nov-2026. */
export function imapDate(value: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const d = m ? new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))) : undefined;
  if (!m || !d || d.getUTCDate() !== Number(m[3]) || d.getUTCMonth() !== Number(m[2]) - 1) {
    throw new Error(`invalid date "${value}" (expected YYYY-MM-DD)`);
  }
  return `${Number(m[3])}-${MONTHS[d.getUTCMonth()]}-${m[1]}`;
}

/** Whether a string can be sent as a quoted string: printable ASCII only. */
function quotable(s: string): boolean {
  return /^[\x20-\x7e]*$/.test(s);
}

/** Whether any search option was given. */
export function hasSearch(o: SearchOptions): boolean {
  return Boolean(o.unseen || o.from || o.to || o.subject || o.text || o.since || o.before);
}

/** The SEARCH command as segments for ImapClient.commandParts. */
export function buildSearch(o: SearchOptions): Segment[] {
  const keys: [string, string][] = [];
  if (o.from !== undefined) keys.push(["FROM", o.from]);
  if (o.to !== undefined) keys.push(["TO", o.to]);
  if (o.subject !== undefined) keys.push(["SUBJECT", o.subject]);
  if (o.text !== undefined) keys.push(["TEXT", o.text]);
  const utf8 = keys.some(([, v]) => !quotable(v));
  const segments: Segment[] = [];
  let text = utf8 ? "SEARCH CHARSET UTF-8" : "SEARCH";
  if (o.unseen) text += " UNSEEN";
  if (o.since !== undefined) text += ` SINCE ${imapDate(o.since)}`;
  if (o.before !== undefined) text += ` BEFORE ${imapDate(o.before)}`;
  for (const [key, value] of keys) {
    if (quotable(value)) {
      text += ` ${key} ${imapQuote(value)}`;
    } else {
      segments.push({ text: `${text} ${key} `, literal: new TextEncoder().encode(value) });
      text = "";
    }
  }
  if (text === "SEARCH") text = "SEARCH ALL";
  segments.push({ text });
  return segments;
}
