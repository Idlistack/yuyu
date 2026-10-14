import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { Chip, DateBlock } from "@/components/ui/display";
import { formatDateBlock, formatRelativeDay, formatTime } from "@/lib/format/datetime";
import { normalizeAccentHex } from "@/lib/theme/accent";

const privacyLabels: Record<string, string> = { PUBLIC: "Public", HIDDEN_LINK: "Hidden link", APPROVAL_REQUIRED: "Approval required", INVITE_ONLY: "Invite only" };

function statusChip(status: string) {
  if (status === "PUBLISHED") return { label: "Published", tone: "success" as const };
  if (status === "DRAFT") return { label: "Draft", tone: "neutral" as const };
  return { label: status === "CANCELLED" ? "Cancelled" : status, tone: "danger" as const };
}

/**
 * The header every event-management screen starts with (Figma 54:2 / 34:2):
 * back link, accent date block, title, status and audience, then actions.
 */
export function EventManageHeader({
  back,
  event,
  actions,
}: {
  back: { href: string; label: string };
  event: { title: string; status: string; privacyType: string; startDateTime: Date; timezone: string; accentColor?: string | null };
  actions?: ReactNode;
}) {
  const dateBlock = formatDateBlock(event.startDateTime, event.timezone);
  const chip = statusChip(event.status);
  return (
    <div className="flex flex-col gap-4">
      <Link href={back.href} className="inline-flex min-h-9 items-center gap-1.5 self-start text-sm font-semibold text-ink-secondary hover:text-ink">
        <ArrowLeft aria-hidden className="size-4" />
        {back.label}
      </Link>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-center gap-4">
          <DateBlock month={dateBlock.month} day={dateBlock.day} tone={event.status === "DRAFT" ? "draft" : "accent"} color={event.status === "DRAFT" ? undefined : normalizeAccentHex(event.accentColor)} />
          <div className="min-w-0">
            <h1 className="break-words text-h1 text-ink">{event.title}</h1>
            <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-body-ui text-ink-muted">
              <Chip size="sm" tone={chip.tone}>{chip.label}</Chip>
              <span>{privacyLabels[event.privacyType] ?? event.privacyType} · {formatRelativeDay(event.startDateTime, event.timezone)}, {formatTime(event.startDateTime, event.timezone)}</span>
            </p>
          </div>
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    </div>
  );
}
