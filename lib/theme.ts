"use client";

import { createTheme } from "@mui/material/styles";

/**
 * TEMPORARY bridge: maps the V1 design tokens (docs/DESIGN.md §2) onto MUI so
 * screens that have not yet moved to components/ui look consistent during the
 * migration. Delete this file together with MUI.
 */
export function createAppTheme(mode: "light" | "dark" = "light") {
  const isDark = mode === "dark";
  const t = isDark
    ? { canvas: "#111113", subtle: "#18181B", muted: "#232326", emphasis: "#2A2A2E", border: "#2A2A2E", borderStrong: "#3F3F46", text: "#F4F4F5", secondary: "#D4D4D8", textMuted: "#A1A1AA", primary: "#F4F4F5", onPrimary: "#18181B", success: "#86EFAC", warning: "#FCD34D", danger: "#F87171" }
    : { canvas: "#FFFFFF", subtle: "#FAFAF9", muted: "#F4F4F2", emphasis: "#EFEEEA", border: "#E7E6E2", borderStrong: "#D4D3CE", text: "#18181B", secondary: "#3F3F46", textMuted: "#5F5E5A", primary: "#18181B", onPrimary: "#FFFFFF", success: "#166534", warning: "#92400E", danger: "#B91C1C" };
  const sans = '"Figtree Variable", system-ui, sans-serif';
  const display = '"Bricolage Grotesque Variable", ui-sans-serif, system-ui, sans-serif';

  return createTheme({
    cssVariables: true,
    palette: {
      mode,
      primary: { main: t.primary, contrastText: t.onPrimary },
      secondary: { main: t.textMuted },
      success: { main: isDark ? "#15803D" : "#15803D", contrastText: "#FFFFFF" },
      warning: { main: "#F59E0B", contrastText: "#18181B" },
      error: { main: isDark ? "#F87171" : "#B91C1C", contrastText: isDark ? "#18181B" : "#FFFFFF" },
      background: { default: t.canvas, paper: t.canvas },
      text: { primary: t.text, secondary: t.textMuted },
      divider: t.border,
    },
    shape: { borderRadius: 12 },
    spacing: 8,
    typography: {
      fontFamily: sans,
      h1: { fontFamily: display, fontWeight: 800, letterSpacing: "-0.02em" },
      h2: { fontFamily: display, fontWeight: 800, letterSpacing: "-0.02em" },
      h3: { fontFamily: display, fontWeight: 800, letterSpacing: "-0.01em" },
      h4: { fontFamily: display, fontWeight: 800, letterSpacing: "-0.01em" },
      h5: { fontFamily: display, fontWeight: 800 },
      h6: { fontFamily: display, fontWeight: 800 },
      body1: { lineHeight: 1.6 },
      body2: { lineHeight: 1.5 },
      button: { fontWeight: 600, textTransform: "none" },
    },
    components: {
      MuiButton: {
        defaultProps: { disableElevation: true },
        styleOverrides: {
          root: { borderRadius: 999, textTransform: "none", fontWeight: 600, boxShadow: "none" },
          outlined: { borderColor: t.borderStrong, color: t.text, "&:hover": { backgroundColor: t.subtle, borderColor: t.borderStrong } },
        },
      },
      MuiPaper: { styleOverrides: { root: { backgroundImage: "none", boxShadow: "none" }, outlined: { borderColor: t.border, borderRadius: 16 } } },
      MuiCard: { styleOverrides: { root: { borderRadius: 16, backgroundImage: "none", boxShadow: "none", border: `1px solid ${t.border}` } } },
      MuiDialog: { styleOverrides: { paper: { borderRadius: 24, backgroundImage: "none", border: `1px solid ${t.border}` } } },
      MuiOutlinedInput: {
        styleOverrides: {
          root: {
            borderRadius: 12,
            backgroundColor: t.canvas,
            "& .MuiOutlinedInput-notchedOutline": { borderColor: t.borderStrong },
            "&.Mui-focused .MuiOutlinedInput-notchedOutline": { borderColor: t.primary, borderWidth: "2px" },
          },
        },
      },
      MuiChip: { styleOverrides: { root: { borderRadius: 999, fontWeight: 600 }, outlined: { borderColor: t.borderStrong } } },
      MuiTab: { styleOverrides: { root: { textTransform: "none", fontWeight: 600 } } },
      MuiTabs: { styleOverrides: { indicator: { backgroundColor: t.primary, height: 2 } } },
    },
  });
}
