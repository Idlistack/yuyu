"use client";

import { usePathname } from "next/navigation";
import { NavTabs } from "@/components/ui/tabs";

export function AccountSettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const onSecurity = pathname === "/account/security";

  return (
    <div className="mx-auto flex w-full max-w-[860px] flex-col gap-6">
      <div>
        <h1 className="text-display-m text-ink">Account</h1>
        <p className="mt-2 text-body-ui text-ink-secondary">Your personal profile and sign-in security.</p>
      </div>
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
