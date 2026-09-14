export type ColorMode = "light" | "dark";

export const COLOR_MODE_COOKIE = "yuyu.color-mode";

export function isColorMode(value: string | undefined): value is ColorMode {
  return value === "light" || value === "dark";
}
