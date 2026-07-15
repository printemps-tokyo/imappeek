import { describe, expect, it } from "vitest";
import { renderList, renderMessage } from "../src/render.js";
import { stringWidth } from "../src/width.js";
import type { MessageSummary } from "../src/session.js";
import type { Mail } from "../src/mail.js";

/** Display column at which `marker` (ASCII) starts within a rendered line. */
function columnOf(line: string, marker: string): number {
  const idx = line.indexOf(marker);
  return idx < 0 ? -1 : stringWidth(line.slice(0, idx));
}

describe("renderList", () => {
  it("leaves ASCII rows unchanged in column layout", () => {
    const rows: MessageSummary[] = [{ seq: 1, from: "Bob", subject: "Hello there", seen: true }];
    const line = renderList(rows, false).split("\n")[0]!;
    // mark(2) + idx(6) + date(17) + gap(2) + from(26) + gap(2) = 55 cells.
    expect(columnOf(line, "Hello")).toBe(55);
  });

  it("aligns the subject column across ASCII and CJK senders", () => {
    const ascii = renderList([{ seq: 1, from: "Bob", subject: "Report", seen: true }], false).split("\n")[0]!;
    const cjk = renderList([{ seq: 1, from: "山田太郎", subject: "Report", seen: true }], false).split("\n")[0]!;
    expect(columnOf(ascii, "Report")).toBe(columnOf(cjk, "Report"));
    expect(columnOf(cjk, "Report")).toBe(55);
  });

  it("truncates a wide sender and still pads to the exact column width", () => {
    const longFrom = "あ".repeat(40); // 80 display cells, must clip to 26
    const line = renderList([{ seq: 1, from: longFrom, subject: "X", seen: true }], false).split("\n")[0]!;
    expect(columnOf(line, "X")).toBe(55);
    // The clipped sender ends with an ellipsis rather than a split character.
    expect(line).toContain("…");
  });

  it("keeps a CJK subject readable without a following column to misalign", () => {
    const out = renderList([{ seq: 7, from: "Alice", subject: "会議の議事録を共有します", seen: false }], false);
    expect(out).toContain("会議の議事録を共有します");
  });
});

describe("renderMessage", () => {
  it("aligns the header label column with CJK header values", () => {
    const mail: Mail = {
      format: "eml",
      headers: [],
      date: "2026-07-15",
      from: "山田太郎 <yamada@example.com>",
      subject: "議事録の共有",
      text: "本文です",
      attachments: [],
    };
    const out = renderMessage(mail, false);
    const lines = out.split("\n");
    const from = lines.find((l) => l.startsWith("From"))!;
    const subject = lines.find((l) => l.startsWith("Subject"))!;
    // Every value begins at display column 9 regardless of the value's script.
    expect(columnOf(from, "山田")).toBe(9);
    expect(columnOf(subject, "議事録")).toBe(9);
  });
});
