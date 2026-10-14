import { prisma } from "@/lib/db";
import { AdminPanel, NameCell } from "@/components/super-admin/AdminPanel";
import { SectionHeading, StatTile } from "@/components/ui/display";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";

function formatBytes(bytes: number | null): string {
  if (bytes == null || Number.isNaN(bytes)) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"] as const;
  let n = bytes;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i += 1;
  }
  return `${n.toFixed(i === 0 ? 0 : 2)} ${units[i]}`;
}

export default async function SuperAdminStoragePage() {
  let dbSizeBytes: number | null = null;
  let tableSizes:
    | Array<{ table_name: string; total_bytes: number; total_pretty: string }>
    | null = null;

  try {
    const dbRows = await prisma.$queryRaw<Array<{ bytes: bigint }>>`
      select pg_database_size(current_database()) as bytes
    `;
    dbSizeBytes = dbRows?.[0]?.bytes ? Number(dbRows[0].bytes) : null;

    tableSizes = await prisma.$queryRaw<
      Array<{ table_name: string; total_bytes: bigint; total_pretty: string }>
    >`
      select
        relname as table_name,
        pg_total_relation_size(quote_ident(relname)) as total_bytes,
        pg_size_pretty(pg_total_relation_size(quote_ident(relname))) as total_pretty
      from pg_stat_user_tables
      order by pg_total_relation_size(quote_ident(relname)) desc
      limit 25
    `.then((rows) =>
      rows.map((r) => ({
        table_name: r.table_name,
        total_bytes: Number(r.total_bytes),
        total_pretty: r.total_pretty,
      })),
    );
  } catch {
    // Some managed Postgres setups restrict these functions. We'll degrade gracefully.
  }

  const perOrgCounts = await prisma.organisation.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      name: true,
      slug: true,
      _count: { select: { events: true, eventSeries: true, memberships: true } },
    },
  });

  const assetTotals = await prisma.asset
    .groupBy({
      by: ["organisationId"],
      _sum: { byteSize: true },
      where: { organisationId: { not: null }, byteSize: { not: null } },
    })
    .then((rows) => {
      const m = new Map<string, number>();
      for (const r of rows) {
        const orgId = r.organisationId;
        if (!orgId) continue;
        const bytes = r._sum.byteSize ? Number(r._sum.byteSize) : 0;
        m.set(orgId, bytes);
      }
      return m;
    })
    .catch(() => new Map<string, number>());

  return (
    <div className="flex flex-col gap-5">
      <SectionHeading title="Storage" />

      <StatTile
        className="sm:max-w-sm"
        label="Database size"
        value={dbSizeBytes == null ? "—" : formatBytes(dbSizeBytes)}
        hint={dbSizeBytes == null ? "Unavailable (DB functions may be restricted)." : undefined}
      />

      <AdminPanel title="Largest tables (top 25)">
        {tableSizes == null ? (
          <p className="text-body-ui text-ink-muted">Unavailable (DB functions may be restricted).</p>
        ) : (
          <Table label="Largest tables">
            <THead>
              <tr>
                <TH>Table</TH>
                <TH className="text-right">Bytes</TH>
                <TH className="text-right">Pretty</TH>
              </tr>
            </THead>
            <TBody>
              {tableSizes.map((t) => (
                <TR key={t.table_name}>
                  <TD className="font-mono text-sm">{t.table_name}</TD>
                  <TD className="text-right tabular-nums">{t.total_bytes.toLocaleString()}</TD>
                  <TD className="text-right tabular-nums">{t.total_pretty}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </AdminPanel>

      <AdminPanel title="Per-org logical footprint (counts)">
        <Table label="Per-org logical footprint">
          <THead>
            <tr>
              <TH>Org</TH>
              <TH className="text-right">Assets bytes</TH>
              <TH className="text-right">Members</TH>
              <TH className="text-right">Events</TH>
              <TH className="text-right">Series</TH>
            </tr>
          </THead>
          <TBody>
            {perOrgCounts.map((o) => (
              <TR key={o.id}>
                <TD><NameCell name={o.name} sub={`/${o.slug}`} /></TD>
                <TD className="text-right tabular-nums">{formatBytes(assetTotals.get(o.id) ?? 0)}</TD>
                <TD className="text-right tabular-nums">{o._count.memberships}</TD>
                <TD className="text-right tabular-nums">{o._count.events}</TD>
                <TD className="text-right tabular-nums">{o._count.eventSeries}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </AdminPanel>
    </div>
  );
}
