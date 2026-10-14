import { prisma } from "@/lib/db";
import { AdminPager, AdminSearchForm, NameCell } from "@/components/super-admin/AdminPanel";
import { SectionHeading } from "@/components/ui/display";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";

type Props = {
  searchParams: Promise<{ q?: string; page?: string }>;
};

export default async function SuperAdminUsersPage({ searchParams }: Props) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const page = Math.max(0, Number.parseInt(sp.page ?? "0", 10) || 0);
  const take = 50;
  const skip = page * take;

  const users = await prisma.user.findMany({
    where: q
      ? {
          OR: [
            { email: { contains: q, mode: "insensitive" } },
            { name: { contains: q, mode: "insensitive" } },
          ],
        }
      : undefined,
    orderBy: { createdAt: "desc" },
    take,
    skip,
    select: {
      id: true,
      name: true,
      email: true,
      createdAt: true,
      _count: {
        select: { memberships: true, accounts: true, sessions: true, rsvps: true },
      },
    },
  });

  return (
    <div className="flex flex-col gap-5">
      <SectionHeading title="Users" />
      <AdminSearchForm action="/super-admin/users" label="Search by name or email" defaultValue={q} />

      <Table label="Users">
        <THead>
          <tr>
            <TH>User</TH>
            <TH>Email</TH>
            <TH className="text-right">Orgs</TH>
            <TH className="text-right">Accounts</TH>
            <TH className="text-right">Sessions</TH>
            <TH className="text-right">RSVPs</TH>
            <TH>Created</TH>
          </tr>
        </THead>
        <TBody>
          {users.length === 0 ? (
            <tr><TD colSpan={7} className="py-8 text-center text-ink-muted">No users.</TD></tr>
          ) : (
            users.map((u) => (
              <TR key={u.id}>
                <TD><NameCell name={u.name ?? "—"} sub={u.id} /></TD>
                <TD className="font-mono text-sm">{u.email ?? "—"}</TD>
                <TD className="text-right tabular-nums">{u._count.memberships}</TD>
                <TD className="text-right tabular-nums">{u._count.accounts}</TD>
                <TD className="text-right tabular-nums">{u._count.sessions}</TD>
                <TD className="text-right tabular-nums">{u._count.rsvps}</TD>
                <TD className="whitespace-nowrap text-ink-secondary">{u.createdAt.toLocaleString()}</TD>
              </TR>
            ))
          )}
        </TBody>
      </Table>

      <AdminPager basePath="/super-admin/users" query={q} page={page} />
    </div>
  );
}
