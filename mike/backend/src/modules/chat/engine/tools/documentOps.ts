// ABOUTME: Seren's stand-in for Mike's documentOps.ts, holding only normalizeWithMap, which verifyCitations.ts imports.
// ABOUTME: Both functions are copied unchanged from Mike's backend/src/modules/chat/engine/tools/documentOps.ts (see mike-parts.yaml).

function isPunctuation(ch: string): boolean {
  return !/[\p{L}\p{N}\s]/u.test(ch);
}

/**
 * Build a whitespace-collapsed, lowercased copy of `text`, plus a map from
 * each character index in the normalized form back to the corresponding
 * index in the original text. Used by `findInDocumentContent` (and server-side
 * citation verification) so matches are tolerant of case + whitespace variance
 * but can still return the exact original excerpt.
 *
 * With `stripPunctuation`, punctuation characters are removed from the
 * normalized form too, making matching tolerant of punctuation drift (e.g. a
 * model that adds a stray comma or drops a period). The index map still points
 * back at the surviving original characters so the recovered excerpt is exact.
 */
export function normalizeWithMap(
  text: string,
  opts: { stripPunctuation?: boolean } = {},
): { norm: string; origIdx: number[] } {
  const stripPunctuation = opts.stripPunctuation ?? false;
  const norm: string[] = [];
  const origIdx: number[] = [];
  let prevSpace = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (/\s/.test(ch)) {
      if (!prevSpace) {
        norm.push(" ");
        origIdx.push(i);
        prevSpace = true;
      }
    } else if (stripPunctuation && isPunctuation(ch)) {
      // Drop punctuation without disturbing the space-collapsing state so
      // "foo, bar" -> "foo bar" but "U.S." -> "us".
      continue;
    } else {
      norm.push(ch.toLowerCase());
      origIdx.push(i);
      prevSpace = false;
    }
  }
  return { norm: norm.join(""), origIdx };
}
