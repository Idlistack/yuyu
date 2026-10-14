import { requireAuth } from "@/lib/permissions";
import { getAppShellData } from "@/lib/appShell";
import { AppShell } from "@/components/chrome/AppShell";
import { isSidebarCollapsed } from "@/lib/sidebarServer";
import { AccountSettingsLayout } from "@/components/account/AccountSettingsLayout";

export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const session = await requireAuth();
  const [{ user, organisations }, collapsed] = await Promise.all([getAppShellData(session.user.id), isSidebarCollapsed()]);
  return (
    <AppShell user={user} organisations={organisations} initialCollapsed={collapsed}>
      <AccountSettingsLayout>{children}</AccountSettingsLayout>
    </AppShell>
  );
}
