/** Render a message list or a single message as text or JSON. Pure. */
import type { Mail } from "./mail.js";
import type { MessageSummary } from "./session.js";

function paint(text: string, code: string, color: boolean): string {
  return color ? `\x1b[${code}m${text}\x1b[0m` : text;
}

function clip(s: string, width: number): string {
  const oneLine = s.replace(/\s+/g, " ").trim();
  return oneLine.length > width ? `${oneLine.slice(0, width - 1)}…` : oneLine;
}

/** Render the recent-message list as an aligned table. */
export function renderList(messages: MessageSummary[], color: boolean): string {
  if (messages.length === 0) return "(mailbox is empty)\n";
  const lines: string[] = [];
  for (const m of messages) {
    const mark = m.seen ? "  " : paint("* ", "33", color);
    const idx = paint(`#${m.seq}`.padEnd(6), "90", color);
    const date = (m.date ? shortDate(m.date) : "").padEnd(17);
    const from = clip(m.from ?? "(unknown)", 26).padEnd(26);
    const subject = m.seen ? clip(m.subject ?? "", 44) : paint(clip(m.subject ?? "", 44), "1", color);
    lines.push(`${mark}${idx}${date}  ${from}  ${subject}`);
  }
  lines.push("");
  const unread = messages.filter((m) => !m.seen).length;
  lines.push(paint(`${messages.length} shown, ${unread} unread (* = unread)`, "90", color));
  return `${lines.join("\n")}\n`;
}

/** A compact, locale-independent date like "2026-07-01 09:32". */
function shortDate(raw: string): string {
  const ms = Date.parse(raw);
  if (Number.isNaN(ms)) return raw.slice(0, 16);
  const d = new Date(ms);
  const p = (n: number): string => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** Render a single message: key headers then the text body. */
export function renderMessage(mail: Mail, color: boolean, maxBody?: number): string {
  const lines: string[] = [];
  const field = (name: string, value?: string): void => {
    if (value && value.trim() !== "") lines.push(`${paint(`${name}:`.padEnd(9), "36", color)}${value}`);
  };
  field("Date", mail.date);
  field("From", mail.from);
  field("To", mail.to);
  field("Cc", mail.cc);
  field("Subject", mail.subject);
  lines.push("");

  let body = mail.text ?? "";
  if (maxBody && maxBody > 0 && body.length > maxBody) {
    body = `${body.slice(0, maxBody)}\n... [truncated ${body.length - maxBody} chars]`;
  }
  lines.push(body);

  if (mail.attachments.length > 0) {
    lines.push("");
    lines.push(paint(`--- attachments (${mail.attachments.length}) ---`, "90", color));
    for (const a of mail.attachments) lines.push(`  ${a.filename}  ${a.size} bytes`);
  }
  return `${lines.join("\n")}\n`;
}
