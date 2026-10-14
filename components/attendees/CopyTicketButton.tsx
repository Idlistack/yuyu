"use client";

import { Copy } from "lucide-react";
import { IconButton } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/menu";
import { useToast } from "@/components/feedback/ToastProvider";

export function CopyTicketButton(props: { ticketUrl: string }) {
  const { ticketUrl } = props;
  const { showToast } = useToast();

  return (
    <Tooltip content="Copy ticket link">
      <IconButton
        size="sm"
        label="Copy ticket link"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(ticketUrl);
            showToast("Ticket link copied", "success");
          } catch {
            showToast("Could not copy", "error");
          }
        }}
      >
        <Copy />
      </IconButton>
    </Tooltip>
  );
}
