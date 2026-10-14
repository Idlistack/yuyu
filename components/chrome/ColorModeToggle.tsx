"use client";

import { Moon, Sun } from "lucide-react";
import { useAppColorMode } from "@/components/providers";
import { IconButton } from "@/components/ui/button";

export function ColorModeToggle({ variant = "quiet", size = "md" }: { variant?: "quiet" | "secondary"; size?: "sm" | "md" }) {
  const { mode, toggleColorMode } = useAppColorMode();
  const label = `Switch to ${mode === "dark" ? "light" : "dark"} mode`;
  return (
    <IconButton label={label} variant={variant} size={size} onClick={toggleColorMode}>
      {mode === "dark" ? <Sun /> : <Moon />}
    </IconButton>
  );
}
