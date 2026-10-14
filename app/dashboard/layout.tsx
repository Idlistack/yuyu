import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getAppShellData } from "@/lib/appShell";
import { AppShell } from "@/components/chrome/AppShell";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const { user, organisations } = await getAppShellData(session.user.id);
  return (
    <AppShell user={user} organisations={organisations}>
      {children}
    </AppShell>
  );
}
