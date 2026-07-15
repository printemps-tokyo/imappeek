import { describe, expect, it } from "vitest";
import { stringWidth, padToWidth, truncateToWidth, codePointWidth } from "../src/width.js";

// Build tricky strings purely from numeric escapes so the source has no
// ambiguous invisible characters.
const COMBINING_ACUTE = "é"; // e + U+0301 combining acute accent
const ZWSP = "a​b"; // zero-width space between letters
const ZWJ = "a‍b"; // zero-width joiner between letters
const BOM = "﻿"; // zero-width no-break space
const VARIATION = "A️"; // letter + variation selector-16
const FULLWIDTH_AB = "ＡＢ"; // fullwidth A B
const GRINNING = "\u{1f600}"; // grinning face emoji

describe("stringWidth", () => {
  it("counts ASCII as one cell each", () => {
    expect(stringWidth("hello")).toBe(5);
    expect(stringWidth("")).toBe(0);
  });

  it("counts CJK ideographs and kana as two cells", () => {
    expect(stringWidth("日本語")).toBe(6);
    expect(stringWidth("こんにちは")).toBe(10);
    expect(stringWidth("한국어")).toBe(6);
  });

  it("counts fullwidth forms as two and mixes with ASCII", () => {
    expect(stringWidth(FULLWIDTH_AB)).toBe(4);
    expect(stringWidth("abc日本")).toBe(7);
    expect(stringWidth("（笑）")).toBe(6); // fullwidth parens + kanji
  });

  it("treats zero-width and combining marks as zero", () => {
    expect(stringWidth(COMBINING_ACUTE)).toBe(1);
    expect(stringWidth(ZWSP)).toBe(2);
    expect(stringWidth(ZWJ)).toBe(2);
    expect(stringWidth(BOM)).toBe(0);
    expect(stringWidth(VARIATION)).toBe(1);
  });

  it("measures emoji as two cells via surrogate pairs", () => {
    expect(stringWidth(GRINNING)).toBe(2);
    expect(codePointWidth(0x1f600)).toBe(2);
    expect(stringWidth("ok" + GRINNING)).toBe(4);
  });
});

describe("padToWidth", () => {
  it("pads ASCII to the target and aligns left by default", () => {
    expect(padToWidth("ab", 5)).toBe("ab   ");
    expect(stringWidth(padToWidth("ab", 5))).toBe(5);
  });

  it("pads CJK by display width so columns line up", () => {
    const a = padToWidth("日本", 6); // width 4 -> 2 spaces
    const b = padToWidth("abcd", 6); // width 4 -> 2 spaces
    expect(stringWidth(a)).toBe(6);
    expect(stringWidth(b)).toBe(6);
    expect(a).toBe("日本  ");
  });

  it("supports right and center alignment", () => {
    expect(padToWidth("x", 4, "right")).toBe("   x");
    expect(padToWidth("x", 5, "center")).toBe("  x  ");
  });

  it("never truncates when already at or over the target", () => {
    expect(padToWidth("日本語", 4)).toBe("日本語");
  });
});

describe("truncateToWidth", () => {
  it("leaves short strings unchanged", () => {
    expect(truncateToWidth("hello", 10)).toBe("hello");
    expect(truncateToWidth("日本", 4)).toBe("日本");
  });

  it("truncates by display width and appends a fitting ellipsis", () => {
    const out = truncateToWidth("日本語件名", 6);
    expect(out).toBe("日本…");
    expect(stringWidth(out)).toBeLessThanOrEqual(6);
  });

  it("does not split a surrogate pair at the boundary", () => {
    const out = truncateToWidth(GRINNING + GRINNING + GRINNING, 3);
    expect(out).toBe(GRINNING + "…");
    // Every unit is a whole character, no lone surrogate.
    for (const ch of out) expect(ch.codePointAt(0)).toBeGreaterThan(0);
    expect([...out]).toHaveLength(2);
  });

  it("does not split a wide character across the boundary", () => {
    const out = truncateToWidth("あいうえお", 5); // budget 4 -> あい + …
    expect(out).toBe("あい…");
    expect(stringWidth(out)).toBe(5);
  });

  it("returns empty for a non-positive budget", () => {
    expect(truncateToWidth("x", 0)).toBe("");
  });
});
