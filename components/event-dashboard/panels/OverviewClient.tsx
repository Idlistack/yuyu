"use client";

import type { ComponentProps } from "react";
import { EventManageOverview } from "@/components/dashboard/EventManageOverview";
import { useEventTabs } from "../EventDashboardTabs";

export function OverviewClient(props: Omit<ComponentProps<typeof EventManageOverview>, "onOpenTab">) {
  const { openTab } = useEventTabs();
  return <EventManageOverview {...props} onOpenTab={(tab) => openTab(tab)} />;
}
