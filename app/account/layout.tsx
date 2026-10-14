import { requireAuth } from "@/lib/permissions";
import { getAppShellData } from "@/lib/appShell";
import { AppShell } from "@/components/chrome/AppShell";
import { AccountSettingsLayout } from "@/components/account/AccountSettingsLayout";

export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const session = await requireAuth();
  const { user, organisations } = await getAppShellData(session.user.id);
  return (
    <AppShell user={user} organisations={organisations}>
      <AccountSettingsLayout>{children}</AccountSettingsLayout>
    </AppShell>
  );
}
