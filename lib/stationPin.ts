const digitRanges = [
  [0x30, 0x39], // ASCII
  [0x660, 0x669], // Arabic-Indic
  [0x6f0, 0x6f9], // Extended Arabic-Indic
  [0x966, 0x96f], // Devanagari
] as const;

/**
 * Makes PIN entry reliable for keyboard input and pasted values without
 * weakening the server's canonical eight ASCII-digit requirement.
 */
export function normalizeStationPin(value: string) {
  let normalized = "";
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (codePoint === undefined) continue;
    const range = digitRanges.find(([start, end]) => codePoint >= start && codePoint <= end);
    if (range) normalized += String(codePoint - range[0]);
    if (normalized.length === 8) break;
  }
  return normalized;
}
