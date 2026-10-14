"use client";

import { usePathname } from "next/navigation";
import { NavTabs } from "@/components/ui/tabs";

const tabs = [
  { label: "Overview", href: "/super-admin" },
  { label: "Monitoring", href: "/super-admin/monitoring" },
  { label: "Operations", href: "/super-admin/operations" },
  { label: "Audit log", href: "/super-admin/audit" },
  { label: "Orgs", href: "/super-admin/orgs" },
  { label: "Events", href: "/super-admin/events" },
  { label: "Users", href: "/super-admin/users" },
  { label: "Auth", href: "/super-admin/auth" },
  { label: "Settings", href: "/super-admin/settings" },
  { label: "Invites", href: "/super-admin/invites" },
  { label: "Storage", href: "/super-admin/storage" },
] as const;

function getActiveTab(pathname: string): string | null {
  if (pathname === "/super-admin") return "/super-admin";
  return tabs
    .map((t) => t.href)
    .filter((href) => href !== "/super-admin")
    .find((href) => pathname === href || pathname.startsWith(`${href}/`)) ?? null;
}

export function SuperAdminTabs() {
  const pathname = usePathname() ?? "";
  const active = getActiveTab(pathname);
  return <NavTabs label="Super admin sections" items={tabs.map((tab) => ({ href: tab.href, label: tab.label, active: tab.href === active }))} />;
}
