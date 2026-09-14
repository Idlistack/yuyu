"use client";

import { ThemeProvider } from "@mui/material/styles";
import CssBaseline from "@mui/material/CssBaseline";
import { SessionProvider } from "next-auth/react";
import type { Session } from "next-auth";
import { createAppTheme } from "@/lib/theme";
import { createContext, useContext, useEffect, useMemo, useSyncExternalStore } from "react";
import { ToastProvider } from "@/components/feedback/ToastProvider";
import { COLOR_MODE_COOKIE, type ColorMode } from "@/lib/colorMode";

function getBrowserColorMode(): ColorMode {
  const saved = window.localStorage.getItem("yuyu:color-mode");
  if (saved === "light" || saved === "dark") return saved;
  return "light";
}

function subscribeToColorMode(onStoreChange: () => void) {
  window.addEventListener("storage", onStoreChange);
  window.addEventListener("yuyu:color-mode-change", onStoreChange);
  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener("yuyu:color-mode-change", onStoreChange);
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

export function Providers({
  children,
  session,
  initialColorMode = "light",
}: {
  children: React.ReactNode;
  session?: Session | null;
  initialColorMode?: ColorMode;
}) {
  const mode = useSyncExternalStore(
    subscribeToColorMode,
    getBrowserColorMode,
    () => initialColorMode,
  );

  useEffect(() => {
    document.documentElement.dataset.colorMode = mode;
    document.documentElement.style.colorScheme = mode;
    window.localStorage.setItem("yuyu:color-mode", mode);
  }, [mode]);

  const theme = useMemo(() => createAppTheme(mode), [mode]);
  const colorMode = useMemo(
    () => ({
      mode,
      toggleColorMode: () => {
        const next = mode === "dark" ? "light" : "dark";
        window.localStorage.setItem("yuyu:color-mode", next);
        document.cookie = `${COLOR_MODE_COOKIE}=${next}; Path=/; Max-Age=31536000; SameSite=Lax${window.location.protocol === "https:" ? "; Secure" : ""}`;
        window.dispatchEvent(new Event("yuyu:color-mode-change"));
      },
    }),
    [mode],
  );
  return (
    <SessionProvider session={session}>
      <ColorModeContext.Provider value={colorMode}>
        <ThemeProvider theme={theme}>
          <CssBaseline enableColorScheme />
          <ToastProvider>{children}</ToastProvider>
        </ThemeProvider>
      </ColorModeContext.Provider>
    </SessionProvider>
  );
}
