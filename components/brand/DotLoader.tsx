import { cn } from "@/lib/cn";
import { DotGrid } from "./DotGrid";
import { MARK, MARK_BRIGHT } from "./patterns";

/** Arms (rows 0–1), then the stem (rows 2–3), then the host dot: the Y lights up from the arms down. */
const STEP_BY_ROW = [0, 0, 1, 1, 2];

/**
 * Loading indicator: the dot sign lighting up from the arms down. With
 * reduced motion it is the static full mark. Announces `label` politely.
 */
export function DotLoader({ size = 48, label = "Loading", className }: { size?: number; label?: string; className?: string }) {
  return (
    <span role="status" className={cn("inline-flex flex-col items-center", className)}>
      <DotGrid
        pattern={size >= 48 ? MARK : MARK_BRIGHT}
        dot={size / 6}
        cellClassName={(cell) => (cell === "X" || cell === "O" ? "yy-dot-loader-cell" : undefined)}
        cellStyle={(cell, row) => (cell === "X" || cell === "O" ? { animationDelay: `${STEP_BY_ROW[row]! * 240}ms` } : undefined)}
      />
      <span className="sr-only">{label}</span>
    </span>
  );
}
