import type { RegistrationFieldType } from "@prisma/client";

/* Pure helpers for the event dashboard Feedback tab (unit tested). */

const NUMERIC_OPTION = /^-?\d+(?:\.\d+)?$/;
const RATING_TYPES: ReadonlySet<RegistrationFieldType> = new Set<RegistrationFieldType>(["RADIO", "SELECT"]);
const TEXT_TYPES: ReadonlySet<RegistrationFieldType> = new Set<RegistrationFieldType>(["TEXT", "TEXTAREA"]);

/** Dots drawn per rating row; counts are scaled to fit. */
export const RATING_DOTS = 10;

/** A single-choice question whose options are all numbers ("1".."5") reads as a rating scale. */
export function isRatingField(field: { type: RegistrationFieldType; options: readonly string[] }) {
  if (!RATING_TYPES.has(field.type)) return false;
  if (field.options.length < 2) return false;
  return field.options.every((option) => NUMERIC_OPTION.test(option.trim()));
}

export function isTextField(field: { type: RegistrationFieldType }) {
  return TEXT_TYPES.has(field.type);
}

export type RatingRow = { value: string; count: number; dots: number };
export type RatingInsight = { fieldId: string; label: string; rows: RatingRow[]; total: number; average: number | null };
export type TextInsight = { fieldId: string; label: string; total: number; recent: string[] };
/** Pre-aggregated, anonymous summary passed from the server to the Responses card. */
export type FeedbackInsights = { responseCount: number; ratings: RatingInsight[]; texts: TextInsight[] };

/**
 * One row per option, highest rating first. Answers that no longer match an
 * option (the question was edited after people answered) are ignored so the
 * rows and the total always agree.
 */
export function ratingDistribution(options: readonly string[], counts: Readonly<Record<string, number>>, dots = RATING_DOTS) {
  const unique = [...new Set(options.map((option) => option.trim()))];
  const ordered = unique.sort((a, b) => Number(b) - Number(a));
  const raw = ordered.map((value) => ({ value, count: Math.max(0, Math.floor(counts[value] ?? 0)) }));
  const max = raw.reduce((highest, row) => Math.max(highest, row.count), 0);
  const rows: RatingRow[] = raw.map((row) => ({
    ...row,
    dots: max === 0 || row.count === 0 ? 0 : Math.max(1, Math.round((row.count / max) * dots)),
  }));
  const total = raw.reduce((sum, row) => sum + row.count, 0);
  const average = total === 0 ? null : raw.reduce((sum, row) => sum + Number(row.value) * row.count, 0) / total;
  return { rows, total, average };
}

/** "Rating 1–5" for numeric scales, otherwise a plain-language answer type. */
export function questionTypeLabel(field: { type: RegistrationFieldType; options: readonly string[] }) {
  if (isRatingField(field)) {
    const values = field.options.map((option) => Number(option.trim()));
    return `Rating ${Math.min(...values)}–${Math.max(...values)}`;
  }
  return FIELD_TYPE_LABELS[field.type] ?? field.type;
}

export const FIELD_TYPE_LABELS: Partial<Record<RegistrationFieldType, string>> = {
  TEXT: "Short answer",
  TEXTAREA: "Long answer",
  SELECT: "Dropdown",
  MULTI_SELECT: "Pick several",
  RADIO: "Pick one",
  CHECKBOX: "Yes / no",
  NUMBER: "Number",
};
