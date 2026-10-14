"use client";

import { SessionProvider } from "next-auth/react";
import type { Session } from "next-auth";
import { createContext, useContext, useEffect, useMemo, useSyncExternalStore } from "react";
import { flushSync } from "react-dom";
import { ToastProvider } from "@/components/feedback/ToastProvider";
import { TooltipProvider } from "@/components/ui/menu";
import { COLOR_MODE_COOKIE, COLOR_MODE_STORAGE_KEY, type ColorMode } from "@/lib/colorMode";

type ColorModePreference = ColorMode | "system";

function readPreference(): ColorModePreference {
  try {
    const saved = window.localStorage.getItem(COLOR_MODE_STORAGE_KEY);
    if (saved === "light" || saved === "dark") return saved;
  } catch {
    // Storage can be blocked; fall back to the cookie below.
  }
  // The cookie is what the server rendered with, so honour it when storage is
  // empty; otherwise the page would flip back to the system mode after loading.
  const cookie = document.cookie.split("; ").find((entry) => entry.startsWith(`${COLOR_MODE_COOKIE}=`))?.split("=")[1];
  return cookie === "light" || cookie === "dark" ? cookie : "system";
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

type ColorModeOrigin = { x: number; y: number };

const ColorModeContext = createContext<{
  mode: ColorMode;
  /** Pass the click point to reveal the new mode from there. */
  toggleColorMode: (origin?: ColorModeOrigin) => void;
} | null>(null);

function applyColorMode(next: ColorMode) {
  const root = document.documentElement;
  root.dataset.colorMode = next;
  root.style.colorScheme = next;
}

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Switch modes in a single frame, then animate: a circular reveal from the
 * toggle where View Transitions are supported, otherwise a short colour
 * cross-fade. Reduced-motion users get an instant switch.
 */
function transitionColorMode(commit: () => void, origin?: ColorModeOrigin) {
  const root = document.documentElement;
  if (prefersReducedMotion()) {
    commit();
    return;
  }
  type ViewTransitionDocument = Document & { startViewTransition?: (update: () => void) => { ready: Promise<void> } };
  const doc = document as ViewTransitionDocument;
  if (typeof doc.startViewTransition !== "function") {
    root.classList.add("yy-theme-fade");
    commit();
    window.setTimeout(() => root.classList.remove("yy-theme-fade"), 320);
    return;
  }
  const x = origin?.x ?? window.innerWidth - 40;
  const y = origin?.y ?? 32;
  const radius = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
  root.classList.add("yy-theme-reveal");
  const transition = doc.startViewTransition(commit);
  transition.ready
    .then(() => {
      root.animate(
        { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
        { duration: 480, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)", pseudoElement: "::view-transition-new(root)" },
      ).finished.finally(() => root.classList.remove("yy-theme-reveal"));
    })
    .catch(() => root.classList.remove("yy-theme-reveal"));
}

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

  const colorMode = useMemo(
    () => ({
      mode,
      toggleColorMode: (origin?: ColorModeOrigin) => {
        const next: ColorMode = mode === "dark" ? "light" : "dark";
        try {
          window.localStorage.setItem(COLOR_MODE_STORAGE_KEY, next);
        } catch {
          // Ignore blocked storage; the cookie still carries the choice.
        }
        document.cookie = `${COLOR_MODE_COOKIE}=${next}; Path=/; Max-Age=31536000; SameSite=Lax${window.location.protocol === "https:" ? "; Secure" : ""}`;
        transitionColorMode(() => {
          // Tokens and React state (icons, labels) change in the same frame.
          applyColorMode(next);
          flushSync(() => window.dispatchEvent(new Event("yuyu:color-mode-change")));
        }, origin);
      },
    }),
    [mode],
  );
  return (
    <SessionProvider session={session}>
      <ColorModeContext.Provider value={colorMode}>
        <TooltipProvider delayDuration={300}>
          <ToastProvider>{children}</ToastProvider>
        </TooltipProvider>
      </ColorModeContext.Provider>
    </SessionProvider>
  );
}
