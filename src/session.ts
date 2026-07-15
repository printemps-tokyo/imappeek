/** High-level mailbox operations built on the IMAP client and MIME parser. */
import { ImapClient, type ImapOptions } from "./imap.js";
import { extractFirstLiteral, latin1, parseExists, parseSearch } from "./protocol.js";
import { parseHeaderBlock } from "./headers.js";
import { parseEml } from "./mime.js";
import { headerValue } from "./mail.js";
import type { Mail } from "./mail.js";

export interface MessageSummary {
  seq: number;
  date?: string;
  from?: string;
  subject?: string;
  /** False when the message is unread (no \Seen flag). */
  seen: boolean;
}

export interface Credentials {
  user: string;
  pass: string;
}

/** Parse the \Seen flag out of a FETCH response's FLAGS list. */
function isSeen(rawText: string): boolean {
  const m = /FLAGS \(([^)]*)\)/i.exec(rawText);
  return m ? /\\Seen/i.test(m[1]!) : false;
}

/** Connect, log in, and select the mailbox; returns the client and message count. */
export async function openMailbox(
  options: ImapOptions,
  creds: Credentials,
  mailbox: string,
): Promise<{ client: ImapClient; count: number }> {
  const client = new ImapClient(options);
  await client.connect();
  await client.login(creds.user, creds.pass);
  const selected = await client.examine(mailbox);
  const count = parseExists(latin1(selected.raw)) ?? 0;
  return { client, count };
}

/** Fetch the list-view summary (headers and flags) for one message. */
async function fetchSummary(client: ImapClient, seq: number): Promise<MessageSummary> {
  const res = await client.fetch(String(seq), "(FLAGS BODY.PEEK[HEADER.FIELDS (DATE FROM SUBJECT)])");
  const literal = extractFirstLiteral(res.raw);
  const headers = literal ? parseHeaderBlock(latin1(literal)) : [];
  return {
    seq,
    date: headerValue(headers, "date"),
    from: headerValue(headers, "from"),
    subject: headerValue(headers, "subject"),
    seen: isSeen(latin1(res.raw)),
  };
}

/** List the most recent `n` messages (headers only), newest first. */
export async function listRecent(client: ImapClient, count: number, n: number): Promise<MessageSummary[]> {
  const summaries: MessageSummary[] = [];
  const hi = count;
  const lo = Math.max(1, count - n + 1);
  for (let seq = hi; seq >= lo; seq--) {
    summaries.push(await fetchSummary(client, seq));
  }
  return summaries;
}

/** List up to `n` unread messages (SEARCH UNSEEN), newest first. */
export async function listUnseen(client: ImapClient, n: number): Promise<MessageSummary[]> {
  const res = await client.search("UNSEEN");
  const ids = parseSearch(latin1(res.raw)).sort((a, b) => b - a).slice(0, n);
  const summaries: MessageSummary[] = [];
  for (const seq of ids) {
    summaries.push(await fetchSummary(client, seq));
  }
  return summaries;
}

/** Fetch and parse one full message by sequence number. */
export async function showMessage(client: ImapClient, seq: number): Promise<Mail> {
  const res = await client.fetch(String(seq), "BODY.PEEK[]");
  const literal = extractFirstLiteral(res.raw);
  if (!literal) throw new Error(`message ${seq} not found`);
  return parseEml(literal);
}
