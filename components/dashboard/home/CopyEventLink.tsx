"use client";

import { Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/feedback/ToastProvider";

/** Copies an event's public page URL (a path on this Yuyu install). */
export function CopyEventLink({ path, title }: { path: string; title: string }) {
  const { showToast } = useToast();
  return (
    <Button
      variant="quiet"
      startIcon={<Link2 />}
      aria-label={`Copy the link to ${title}`}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(`${window.location.origin}${path}`);
          showToast("Event link copied", "success", null, 2500);
        } catch {
          showToast("Could not copy the event link", "error");
        }
      }}
    >
      Copy link
    </Button>
  );
}
