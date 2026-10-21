import { requireSuperAdminMfa } from "@/lib/permissions";
import { prisma } from "@/lib/db";
import { AdminPager, AdminSearchForm } from "@/components/super-admin/AdminPanel";
import { AuditTable, auditRowSelect } from "@/components/super-admin/AuditTable";
import { PageHeader } from "@/components/ui/display";
import { readPageParam, readSearchParam } from "@/lib/superAdminInsights";

type Props = {
  searchParams: Promise<{ q?: string | string[]; page?: string | string[] }>;
};

export default async function SuperAdminAuditPage({ searchParams }: Props) {
  // Layout checks don't re-run on client navigation, so every page checks too.
  await requireSuperAdminMfa();
  const sp = await searchParams;
  const q = readSearchParam(sp.q);
  const page = readPageParam(sp.page);
  const take = 50;

  // One extra row tells the pager whether a next page exists.
  const rows = await prisma.auditEvent.findMany({
    where: q
      ? {
          OR: [
            { action: { contains: q, mode: "insensitive" } },
            { targetType: { contains: q, mode: "insensitive" } },
            { actor: { is: { email: { contains: q, mode: "insensitive" } } } },
            { organisation: { is: { name: { contains: q, mode: "insensitive" } } } },
          ],
        }
      : undefined,
    orderBy: { createdAt: "desc" },
    skip: page * take,
    take: take + 1,
    select: auditRowSelect,
  });
  const events = rows.slice(0, take);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Audit log" description="Append-only security and application activity. Sensitive values are redacted before display." />
      <AdminSearchForm action="/super-admin/audit" label="Search action, actor email, org, or target type" defaultValue={q} />
      <AuditTable events={events} label="Audit log" />
      <AdminPager basePath="/super-admin/audit" query={q} page={page} hasNext={rows.length > take} />
    </div>
  );
}
