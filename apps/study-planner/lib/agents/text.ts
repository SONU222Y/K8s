/** Lowercases and collapses whitespace and punctuation so text can be compared loosely. */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/** True when `quote` appears in `source`, ignoring case, spacing and punctuation. */
export function appearsIn(source: string, quote: string): boolean {
  const needle = normalize(quote);
  return needle.length > 0 && normalize(source).includes(needle);
}

export function roundHalf(hours: number): number {
  return Math.round(hours * 2) / 2;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
