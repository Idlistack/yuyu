import { DotGrid } from "./DotGrid";
import { FACES, type DotFaceMood } from "./patterns";

/**
 * Dot faces on a 7×7 grid. Happy: hello. Cheering: "You're in!". Wink:
 * checked in. Love: feedback. Done: all set. Waiting: waitlist. Surprised:
 * event full. Thinking: loading. Sleepy: empty states. Sad: errors.
 */
export function DotFace({ mood, size = 136, label, className, colors }: { mood: DotFaceMood; size?: number; label?: string; className?: string; colors?: Partial<Record<string, string>> }) {
  // 7 dots + 6 quarter-dot gaps = 8.5 dots across.
  return <DotGrid pattern={FACES[mood]} dot={size / 8.5} label={label} className={className} colors={colors} />;
}
