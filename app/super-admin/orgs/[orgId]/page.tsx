import { prisma } from "@/lib/db";
import { AdminPanel, LinkRow, StatusValue } from "@/components/super-admin/AdminPanel";
import { Chip, EmptyState, OrgLogo } from "@/components/ui/display";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";

type Props = {
  params: Promise<{ orgId: string }>;
};

export default async function SuperAdminOrgDetailPage({ params }: Props) {
  const { orgId } = await params;

  const org = await prisma.organisation.findUnique({
    where: { id: orgId },
    select: {
      id: true,
      name: true,
      slug: true,
      description: true,
      logoUrl: true,
      createdAt: true,
      _count: { select: { events: true, eventSeries: true, memberships: true } },
    },
  });

  if (!org) {
    return <EmptyState mood="sad">Organisation not found.</EmptyState>;
  }

  const [members, events, series, invites] = await Promise.all([
    prisma.membership.findMany({
      where: { organisationId: org.id },
      orderBy: { createdAt: "desc" },
      take: 200,
      select: {
        id: true,
        role: true,
        createdAt: true,
        user: { select: { id: true, email: true, name: true } },
      },
    }),
    prisma.event.findMany({
      where: { organisationId: org.id },
      orderBy: { createdAt: "desc" },
      take: 200,
      select: {
        id: true,
        title: true,
        slug: true,
        status: true,
        privacyType: true,
        startDateTime: true,
        createdAt: true,
        _count: { select: { rsvps: true } },
      },
    }),
    prisma.eventSeries.findMany({
      where: { organisationId: org.id },
      orderBy: { createdAt: "desc" },
      take: 200,
      select: {
        id: true,
        title: true,
        slug: true,
        status: true,
        privacyType: true,
        createdAt: true,
        _count: { select: { instances: true, invites: true } },
      },
    }),
    prisma.organisationInvite.findMany({
      where: { organisationId: org.id },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        token: true,
        role: true,
        createdAt: true,
        expiresAt: true,
        usedAt: true,
        createdBy: { select: { email: true } },
        usedBy: { select: { email: true } },
      },
    }),
  ]);

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <OrgLogo name={org.name} src={org.logoUrl} size="lg" />
          <h2 className="text-h2 break-words text-ink">{org.name}</h2>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Chip tone="outline" className="font-mono">{`/${org.slug}`}</Chip>
          <Chip tone="outline">{`${org._count.memberships} members`}</Chip>
          <Chip tone="outline">{`${org._count.events} events`}</Chip>
          <Chip tone="outline">{`${org._count.eventSeries} series`}</Chip>
        </div>
        <p className="text-sm text-ink-muted">Created {org.createdAt.toLocaleString()}</p>
        <p className="max-w-[720px] whitespace-pre-wrap text-body-ui text-ink-secondary">{org.description || "—"}</p>
        <LinkRow links={[{ href: `/${org.slug}`, label: "Public page" }, { href: `/dashboard/${org.slug}`, label: "Org dashboard" }]} />
      </header>

      <AdminPanel title="Members">
        <Table label="Members">
          <THead>
            <tr>
              <TH>User</TH>
              <TH>Email</TH>
              <TH>Role</TH>
              <TH>Joined</TH>
            </tr>
          </THead>
          <TBody>
            {members.map((m) => (
              <TR key={m.id}>
                <TD className="font-semibold">{m.user?.name ?? "—"}</TD>
                <TD className="font-mono text-sm">{m.user?.email ?? "—"}</TD>
                <TD><Chip size="sm" tone={m.role === "OWNER" ? "ink" : "neutral"}>{m.role}</Chip></TD>
                <TD className="whitespace-nowrap text-ink-secondary">{m.createdAt.toLocaleString()}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </AdminPanel>

      <AdminPanel title="Events">
        <Table label="Events">
          <THead>
            <tr>
              <TH>Title</TH>
              <TH>Status</TH>
              <TH>Privacy</TH>
              <TH>Start</TH>
              <TH className="text-right">RSVPs</TH>
              <TH>Links</TH>
            </tr>
          </THead>
          <TBody>
            {events.length === 0 ? (
              <tr><TD colSpan={6} className="py-8 text-center text-ink-muted">No events.</TD></tr>
            ) : (
              events.map((e) => (
                <TR key={e.id}>
                  <TD className="font-semibold">{e.title}</TD>
                  <TD><StatusValue status={e.status} /></TD>
                  <TD><Chip size="sm" tone="outline">{e.privacyType}</Chip></TD>
                  <TD className="whitespace-nowrap text-ink-secondary">{e.startDateTime.toLocaleString()}</TD>
                  <TD className="text-right tabular-nums">{e._count.rsvps}</TD>
                  <TD><LinkRow links={[{ href: `/${org.slug}/${e.slug}`, label: "Public" }, { href: `/dashboard/${org.slug}/event/${e.id}`, label: "Manage" }]} /></TD>
                </TR>
              ))
            )}
          </TBody>
        </Table>
      </AdminPanel>

      <AdminPanel title="Series">
        <Table label="Series">
          <THead>
            <tr>
              <TH>Title</TH>
              <TH>Status</TH>
              <TH>Privacy</TH>
              <TH className="text-right">Instances</TH>
              <TH className="text-right">Invites</TH>
              <TH>Link</TH>
            </tr>
          </THead>
          <TBody>
            {series.length === 0 ? (
              <tr><TD colSpan={6} className="py-8 text-center text-ink-muted">No series.</TD></tr>
            ) : (
              series.map((s) => (
                <TR key={s.id}>
                  <TD className="font-semibold">{s.title}</TD>
                  <TD><StatusValue status={s.status} /></TD>
                  <TD><Chip size="sm" tone="outline">{s.privacyType}</Chip></TD>
                  <TD className="text-right tabular-nums">{s._count.instances}</TD>
                  <TD className="text-right tabular-nums">{s._count.invites}</TD>
                  <TD><LinkRow links={[{ href: `/dashboard/${org.slug}/series/${s.id}`, label: "Manage" }]} /></TD>
                </TR>
              ))
            )}
          </TBody>
        </Table>
      </AdminPanel>

      <AdminPanel title="Org invite links">
        <Table label="Org invite links">
          <THead>
            <tr>
              <TH>Role</TH>
              <TH>Created</TH>
              <TH>Expires</TH>
              <TH>Used</TH>
              <TH>Created by</TH>
              <TH>Used by</TH>
            </tr>
          </THead>
          <TBody>
            {invites.length === 0 ? (
              <tr><TD colSpan={6} className="py-8 text-center text-ink-muted">No org invites.</TD></tr>
            ) : (
              invites.map((i) => (
                <TR key={i.id}>
                  <TD>{i.role}</TD>
                  <TD className="whitespace-nowrap text-ink-secondary">{i.createdAt.toLocaleString()}</TD>
                  <TD className="whitespace-nowrap text-ink-secondary">{i.expiresAt ? i.expiresAt.toLocaleString() : "—"}</TD>
                  <TD className="whitespace-nowrap text-ink-secondary">{i.usedAt ? i.usedAt.toLocaleString() : "—"}</TD>
                  <TD className="font-mono text-sm">{i.createdBy.email ?? "—"}</TD>
                  <TD className="font-mono text-sm">{i.usedBy?.email ?? "—"}</TD>
                </TR>
              ))
            )}
          </TBody>
        </Table>
      </AdminPanel>
    </div>
  );
}
