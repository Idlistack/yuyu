import { requireSuperAdminMfa } from "@/lib/permissions";
import { getAppShellData } from "@/lib/appShell";
import { AppShell } from "@/components/chrome/AppShell";
import { isSidebarCollapsed } from "@/lib/sidebarServer";
import { PageHeader } from "@/components/ui/display";
import { SuperAdminTabs } from "@/components/super-admin/SuperAdminTabs";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Super admin", robots: { index: false, follow: false } };

// These pages require an authenticated database-backed session and must never
// be rendered during the build with placeholder database credentials.
export const dynamic = "force-dynamic";

export default async function SuperAdminLayout(props: {
  children: React.ReactNode;
}) {
  const session = await requireSuperAdminMfa();
  const [{ user, organisations }, collapsed] = await Promise.all([getAppShellData(session.user.id), isSidebarCollapsed()]);

  return (
    <AppShell user={user} organisations={organisations} initialCollapsed={collapsed}>
      <div className="flex flex-col gap-6">
        <PageHeader title="Super admin" description="Instance-wide settings, monitoring, and operations." />
        <SuperAdminTabs />
        <div>{props.children}</div>
      </div>
    </AppShell>
  );
}
