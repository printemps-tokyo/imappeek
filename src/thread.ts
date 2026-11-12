/**
 * Group listed messages into conversations, client side: replies are linked
 * to their parents through Message-ID, In-Reply-To and References (RFC 5322),
 * and messages without those headers fall back to their subject without
 * Re:/Fwd: prefixes. Only the messages listed are threaded, so a reply whose
 * original is not among them still joins the others that share its root.
 */

export interface ThreadInput {
  seq: number;
  date?: string;
  subject?: string;
  messageId?: string;
  inReplyTo?: string;
  references?: string[];
}

export interface Thread<T extends ThreadInput> {
  subject: string;
  /** Messages oldest first, each with its reply depth within the thread. */
  items: { item: T; depth: number }[];
}

/** The message ids in a Message-ID / In-Reply-To / References value. */
export function messageIds(value: string | undefined): string[] {
  return value ? (value.match(/<[^<>\s]+>/g) ?? []) : [];
}

/** A subject without reply and forward prefixes (Re:, RE:, Fwd:, FW:, AW:, 返信:, 転送:). */
export function baseSubject(subject: string | undefined): string {
  let s = (subject ?? "").trim();
  for (;;) {
    const next = s.replace(/^(re|fwd?|aw|wg|sv|tr|返信|転送)\s*(\[\d+\])?\s*[:：]\s*/i, "");
    if (next === s) break;
    s = next;
  }
  return s.trim();
}

function time(date: string | undefined): number {
  const t = date ? Date.parse(date) : NaN;
  return Number.isFinite(t) ? t : 0;
}

export function buildThreads<T extends ThreadInput>(items: T[]): Thread<T>[] {
  const byId = new Map<string, T>();
  for (const it of items) if (it.messageId) byId.set(it.messageId, it);
  const parentOf = (it: T): T | undefined => {
    const refs = [...(it.references ?? []), ...(it.inReplyTo ? [it.inReplyTo] : [])];
    for (let i = refs.length - 1; i >= 0; i--) {
      const p = byId.get(refs[i]!);
      if (p && p !== it) return p;
    }
    return undefined;
  };
  // A message that starts a thread is keyed by its own id; replies by the
  // id their references start with, which is the same root. Messages with
  // no ids at all are grouped by subject.
  const rootKey = (it: T): string => {
    const first = it.references?.[0] ?? it.inReplyTo;
    if (first) return first;
    if (it.messageId) return it.messageId;
    return `subject:${baseSubject(it.subject).toLowerCase()}`;
  };
  const groups = new Map<string, T[]>();
  for (const it of items) {
    const key = rootKey(it);
    const g = groups.get(key) ?? [];
    g.push(it);
    groups.set(key, g);
  }
  const threads: Thread<T>[] = [];
  for (const members of groups.values()) {
    members.sort((a, b) => time(a.date) - time(b.date) || a.seq - b.seq);
    const depth = (it: T): number => {
      let d = 0;
      const seen = new Set<T>([it]);
      for (let p = parentOf(it); p && !seen.has(p) && members.includes(p); p = parentOf(p)) {
        seen.add(p);
        d++;
      }
      return d;
    };
    threads.push({
      subject: baseSubject(members[0]!.subject) || "(no subject)",
      items: members.map((item) => ({ item, depth: depth(item) })),
    });
  }
  const latest = (t: Thread<T>): number => Math.max(...t.items.map((i) => time(i.item.date)));
  return threads.sort((a, b) => latest(b) - latest(a));
}
