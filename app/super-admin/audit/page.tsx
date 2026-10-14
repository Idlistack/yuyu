import { prisma } from "@/lib/db";
import { redactSensitiveText } from "@/lib/redactSensitiveText";
import { AdminPager, AdminSearchForm, NameCell } from "@/components/super-admin/AdminPanel";
import { SectionHeading } from "@/components/ui/display";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";

type Props = {
  searchParams: Promise<{ q?: string; page?: string }>;
};

function metadataSummary(value: unknown) {
  if (value == null) return "—";
  return redactSensitiveText(JSON.stringify(value)).slice(0, 500);
}

export default async function SuperAdminAuditPage({ searchParams }: Props) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim().slice(0, 120);
  const page = Math.max(0, Number.parseInt(sp.page ?? "0", 10) || 0);
  const take = 50;

  const events = await prisma.auditEvent.findMany({
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
    take,
    select: {
      id: true,
      action: true,
      targetType: true,
      targetId: true,
      metadata: true,
      createdAt: true,
      actor: { select: { name: true, email: true } },
      organisation: { select: { id: true, name: true, slug: true } },
    },
  });

  return (
    <div className="flex flex-col gap-5">
      <SectionHeading title="Audit log" description="Append-only security and application activity. Sensitive values are redacted before display." />
      <AdminSearchForm action="/super-admin/audit" label="Search action, actor email, org, or target type" defaultValue={q} />

      <Table label="Audit log" className="min-w-[900px]">
        <THead>
          <tr>
            <TH>When</TH>
            <TH>Action</TH>
            <TH>Actor</TH>
            <TH>Organisation</TH>
            <TH>Target</TH>
            <TH>Metadata</TH>
          </tr>
        </THead>
        <TBody>
          {events.length === 0 ? (
            <tr><TD colSpan={6} className="py-8 text-center text-ink-muted">No audit events found.</TD></tr>
          ) : events.map((event) => (
            <TR key={event.id}>
              <TD className="align-top whitespace-nowrap text-ink-secondary">{event.createdAt.toLocaleString()}</TD>
              <TD className="align-top font-mono text-sm [overflow-wrap:anywhere]">{event.action}</TD>
              <TD className="align-top"><NameCell name={event.actor?.name ?? event.actor?.email ?? "System"} sub={event.actor?.email && event.actor.name ? event.actor.email : undefined} /></TD>
              <TD className="align-top">{event.organisation ? <NameCell href={`/super-admin/orgs/${event.organisation.id}`} name={event.organisation.name} sub={`/${event.organisation.slug}`} /> : "—"}</TD>
              <TD className="align-top font-mono text-sm [overflow-wrap:anywhere]">{event.targetType ? `${event.targetType}${event.targetId ? ` · ${event.targetId}` : ""}` : "—"}</TD>
              <TD className="max-w-[280px] align-top font-mono text-xs text-ink-secondary [overflow-wrap:anywhere]">{metadataSummary(event.metadata)}</TD>
            </TR>
          ))}
        </TBody>
      </Table>

      <AdminPager basePath="/super-admin/audit" query={q} page={page} />
    </div>
  );
}
