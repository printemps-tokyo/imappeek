/**
 * Display-width helpers for terminal column alignment.
 *
 * Terminals render most characters in one cell, but East Asian Wide and
 * Fullwidth characters (CJK ideographs, kana, Hangul, fullwidth forms, and most
 * emoji) occupy two cells. Zero-width code points (combining marks, joiners,
 * variation selectors) occupy none. Aligning columns with `String.length` or
 * `padEnd` therefore misaligns any row containing such text, which is the norm
 * in this Japanese-oriented toolset.
 *
 * `stringWidth` follows the Unicode East Asian Width property (Wide/Fullwidth
 * count as 2) with a compact range table. It is an approximation: it does not
 * perform grapheme-cluster segmentation, so sequences such as flag emoji or
 * emoji joined by ZWJ are measured per code point rather than as one cluster.
 * For the plain subjects and sender names shown in listings this is accurate.
 */

/** Sorted, non-overlapping [start, end] code-point ranges rendered as 0 cells. */
const ZERO_WIDTH: readonly (readonly [number, number])[] = [
  [0x0300, 0x036f], // combining diacritical marks
  [0x0483, 0x0489], // combining Cyrillic
  [0x0591, 0x05bd], // Hebrew combining
  [0x05bf, 0x05bf],
  [0x05c1, 0x05c2],
  [0x05c4, 0x05c5],
  [0x0610, 0x061a], // Arabic combining
  [0x064b, 0x065f],
  [0x0670, 0x0670],
  [0x06d6, 0x06dc],
  [0x06df, 0x06e4],
  [0x06e7, 0x06e8],
  [0x06ea, 0x06ed],
  [0x0711, 0x0711], // Syriac
  [0x0730, 0x074a],
  [0x07a6, 0x07b0], // Thaana
  [0x0900, 0x0903], // Devanagari combining (partial)
  [0x093a, 0x093c],
  [0x0941, 0x0948],
  [0x094d, 0x094d],
  [0x0951, 0x0957],
  [0x0e31, 0x0e31], // Thai combining (partial)
  [0x0e34, 0x0e3a],
  [0x0e47, 0x0e4e],
  [0x1ab0, 0x1aff], // combining diacritical marks extended
  [0x1dc0, 0x1dff], // combining diacritical marks supplement
  [0x200b, 0x200f], // ZWSP, ZWNJ, ZWJ, LRM, RLM
  [0x2028, 0x2029], // line/paragraph separators
  [0x202a, 0x202e], // bidi embeddings/overrides
  [0x2060, 0x2064], // word joiner, invisible operators
  [0x20d0, 0x20ff], // combining marks for symbols
  [0xfe00, 0xfe0f], // variation selectors
  [0xfe20, 0xfe2f], // combining half marks
  [0xfeff, 0xfeff], // zero-width no-break space (BOM)
  [0xe0100, 0xe01ef], // variation selectors supplement
];

/** Sorted, non-overlapping [start, end] code-point ranges rendered as 2 cells. */
const WIDE: readonly (readonly [number, number])[] = [
  [0x1100, 0x115f], // Hangul Jamo
  [0x2329, 0x232a], // angle brackets
  [0x2e80, 0x2e99], // CJK radicals supplement
  [0x2e9b, 0x2ef3],
  [0x2f00, 0x2fd5], // Kangxi radicals
  [0x2ff0, 0x2ffb], // ideographic description
  [0x3000, 0x303e], // CJK symbols and punctuation (incl. ideographic space)
  [0x3041, 0x3096], // Hiragana
  [0x3099, 0x30ff], // combining sound marks + Katakana
  [0x3105, 0x312f], // Bopomofo
  [0x3131, 0x318e], // Hangul compatibility Jamo
  [0x3190, 0x31e3], // Kanbun, Bopomofo extended
  [0x31f0, 0x321e], // Katakana phonetic extensions, enclosed CJK
  [0x3220, 0x3247],
  [0x3250, 0x4dbf], // enclosed CJK, CJK extension A
  [0x4e00, 0x9fff], // CJK unified ideographs
  [0xa000, 0xa4c6], // Yi syllables
  [0xa960, 0xa97c], // Hangul Jamo extended-A
  [0xac00, 0xd7a3], // Hangul syllables
  [0xf900, 0xfaff], // CJK compatibility ideographs
  [0xfe10, 0xfe19], // vertical forms
  [0xfe30, 0xfe52], // CJK compatibility forms
  [0xfe54, 0xfe66], // small form variants
  [0xfe68, 0xfe6b],
  [0xff00, 0xff60], // fullwidth forms
  [0xffe0, 0xffe6], // fullwidth signs
  [0x1b000, 0x1b001], // Kana supplement
  [0x1f004, 0x1f004], // mahjong red dragon
  [0x1f0cf, 0x1f0cf], // playing card black joker
  [0x1f18e, 0x1f18e], // negative squared AB
  [0x1f191, 0x1f19a], // squared symbols
  [0x1f200, 0x1f251], // enclosed ideographic supplement
  [0x1f300, 0x1f64f], // misc symbols, emoticons
  [0x1f900, 0x1f9ff], // supplemental symbols and pictographs
  [0x1fa70, 0x1faff], // symbols and pictographs extended-A
  [0x20000, 0x3fffd], // CJK extensions B and beyond
];

/** True when `cp` falls in one of the sorted ranges. */
function inRanges(cp: number, ranges: readonly (readonly [number, number])[]): boolean {
  let lo = 0;
  let hi = ranges.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const range = ranges[mid];
    if (range === undefined) break;
    if (cp < range[0]) hi = mid - 1;
    else if (cp > range[1]) lo = mid + 1;
    else return true;
  }
  return false;
}

/** Display width, in terminal cells, of a single Unicode code point. */
export function codePointWidth(cp: number): number {
  if (cp === 0) return 0;
  // C0/C1 control characters have no width here (callers strip them anyway).
  if (cp < 0x20 || (cp >= 0x7f && cp < 0xa0)) return 0;
  if (inRanges(cp, ZERO_WIDTH)) return 0;
  if (inRanges(cp, WIDE)) return 2;
  return 1;
}

/**
 * Display width of a string in terminal cells.
 *
 * Approximation: measured per code point, without grapheme clustering, so ZWJ
 * emoji sequences and regional-indicator flags are summed rather than treated
 * as one cluster.
 */
export function stringWidth(s: string): number {
  let width = 0;
  for (const ch of s) {
    const cp = ch.codePointAt(0);
    if (cp !== undefined) width += codePointWidth(cp);
  }
  return width;
}

export type Align = "left" | "right" | "center";

/**
 * Pad `s` with spaces so it occupies at least `targetCols` display cells.
 * If `s` is already at least that wide it is returned unchanged (never
 * truncated). `align` places the original text left, right, or centered.
 */
export function padToWidth(s: string, targetCols: number, align: Align = "left"): string {
  const deficit = targetCols - stringWidth(s);
  if (deficit <= 0) return s;
  if (align === "right") return " ".repeat(deficit) + s;
  if (align === "center") {
    const left = deficit >> 1;
    return " ".repeat(left) + s + " ".repeat(deficit - left);
  }
  return s + " ".repeat(deficit);
}

/**
 * Truncate `s` so it fits within `maxCols` display cells, appending a single
 * ellipsis ("…", width 1) when characters are dropped. Never splits a surrogate
 * pair or a wide character across the boundary.
 */
export function truncateToWidth(s: string, maxCols: number): string {
  if (maxCols <= 0) return "";
  if (stringWidth(s) <= maxCols) return s;
  const budget = maxCols - 1; // reserve one cell for the ellipsis
  let width = 0;
  let out = "";
  for (const ch of s) {
    const cp = ch.codePointAt(0);
    if (cp === undefined) continue;
    const w = codePointWidth(cp);
    if (width + w > budget) break;
    width += w;
    out += ch;
  }
  return out + "…";
}
