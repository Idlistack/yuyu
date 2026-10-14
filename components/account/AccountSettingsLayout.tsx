"use client";

import { usePathname } from "next/navigation";
import { NavTabs } from "@/components/ui/tabs";
import { PageHeader } from "@/components/ui/display";

export function AccountSettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const onSecurity = pathname === "/account/security";

  return (
    <div className="flex w-full flex-col gap-6">
      <PageHeader title="Account" description="Your personal profile and sign-in security." />
      <NavTabs
        label="Account settings"
        items={[
          { href: "/account", label: "Profile", active: !onSecurity },
          { href: "/account/security", label: "Security", active: onSecurity },
        ]}
      />
      {children}
    </div>
  );
}
