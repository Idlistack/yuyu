"use client";

import { ThemeProvider } from "@mui/material/styles";
import CssBaseline from "@mui/material/CssBaseline";
import { SessionProvider } from "next-auth/react";
import type { Session } from "next-auth";
import { createAppTheme } from "@/lib/theme";
import { createContext, useContext, useEffect, useMemo, useSyncExternalStore } from "react";
import { ToastProvider } from "@/components/feedback/ToastProvider";
import { TooltipProvider } from "@/components/ui/menu";
import { COLOR_MODE_COOKIE, COLOR_MODE_STORAGE_KEY, type ColorMode } from "@/lib/colorMode";

type ColorModePreference = ColorMode | "system";

function readPreference(): ColorModePreference {
  try {
    const saved = window.localStorage.getItem(COLOR_MODE_STORAGE_KEY);
    if (saved === "light" || saved === "dark") return saved;
  } catch {
    // Storage can be blocked; fall back to the system preference.
  }
  return "system";
}

function readSystemDark() {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function subscribe(onStoreChange: () => void) {
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  window.addEventListener("storage", onStoreChange);
  window.addEventListener("yuyu:color-mode-change", onStoreChange);
  media.addEventListener("change", onStoreChange);
  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener("yuyu:color-mode-change", onStoreChange);
    media.removeEventListener("change", onStoreChange);
  };
}

const ColorModeContext = createContext<{
  mode: ColorMode;
  toggleColorMode: () => void;
} | null>(null);

export function useAppColorMode() {
  const context = useContext(ColorModeContext);
  if (!context) throw new Error("useAppColorMode must be used inside Providers.");
  return context;
}

/**
 * Colour mode follows the operating system until the person picks one; the
 * choice is stored only in this browser (localStorage plus a cookie so the
 * server renders the right mode without a flash).
 */
export function Providers({
  children,
  session,
  initialColorMode = null,
}: {
  children: React.ReactNode;
  session?: Session | null;
  initialColorMode?: ColorMode | null;
}) {
  const preference = useSyncExternalStore<ColorModePreference>(subscribe, readPreference, () => initialColorMode ?? "system");
  const systemDark = useSyncExternalStore(subscribe, readSystemDark, () => false);
  const mode: ColorMode = preference === "system" ? (systemDark ? "dark" : "light") : preference;

  useEffect(() => {
    const root = document.documentElement;
    if (preference === "system") {
      delete root.dataset.colorMode;
      root.style.removeProperty("color-scheme");
    } else {
      root.dataset.colorMode = preference;
      root.style.colorScheme = preference;
    }
  }, [preference]);

  const theme = useMemo(() => createAppTheme(mode), [mode]);
  const colorMode = useMemo(
    () => ({
      mode,
      toggleColorMode: () => {
        const next: ColorMode = mode === "dark" ? "light" : "dark";
        try {
          window.localStorage.setItem(COLOR_MODE_STORAGE_KEY, next);
        } catch {
          // Ignore blocked storage; the cookie still carries the choice.
        }
        document.cookie = `${COLOR_MODE_COOKIE}=${next}; Path=/; Max-Age=31536000; SameSite=Lax${window.location.protocol === "https:" ? "; Secure" : ""}`;
        window.dispatchEvent(new Event("yuyu:color-mode-change"));
      },
    }),
    [mode],
  );
  return (
    <SessionProvider session={session}>
      <ColorModeContext.Provider value={colorMode}>
        {/* TEMPORARY: MUI theme for screens not yet moved to components/ui. */}
        <ThemeProvider theme={theme}>
          <CssBaseline enableColorScheme />
          <TooltipProvider delayDuration={300}>
            <ToastProvider>{children}</ToastProvider>
          </TooltipProvider>
        </ThemeProvider>
      </ColorModeContext.Provider>
    </SessionProvider>
  );
}
