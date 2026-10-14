import Link from "next/link";
import { headers } from "next/headers";
import { prisma } from "@/lib/db";
import {
  canManageMembers,
  isOrgAdmin,
  requireOrgMembership,
} from "@/lib/permissions";
import { MemberRoleActions } from "@/components/members/MemberRoleActions";
import { OrgInviteLinkPanel } from "@/components/members/OrgInviteLinkPanel";
import { Button } from "@/components/ui/button";
import { Avatar, EmptyState, PageHeader } from "@/components/ui/display";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";

import type { Metadata } from "next";

type Props = { params: Promise<{ orgSlug: string }>; searchParams: Promise<{ page?: string }> };
const MEMBERS_PAGE_SIZE = 100;

export const metadata: Metadata = {
  title: "Members",
  description: "Organisation members and roles.",
};

export default async function OrgMembersPage({ params, searchParams }: Props) {
  const { orgSlug } = await params;
  const requestedPage = Math.max(1, Number.parseInt((await searchParams).page ?? "1", 10) || 1);
  const { organisation, membership } = await requireOrgMembership(orgSlug);
  const ownerView = canManageMembers(membership);
  const adminView = isOrgAdmin(membership.role);
  const h = await headers();

  const memberCount = await prisma.membership.count({ where: { organisationId: organisation.id } });
  const memberPages = Math.max(1, Math.ceil(memberCount / MEMBERS_PAGE_SIZE));
  const memberPage = Math.min(requestedPage, memberPages);
  const members = await prisma.membership.findMany({
    where: { organisationId: organisation.id },
    select: { id: true, userId: true, role: true, createdAt: true, user: { select: { name: true, email: true } } },
    orderBy: { createdAt: "asc" },
    skip: (memberPage - 1) * MEMBERS_PAGE_SIZE,
    take: MEMBERS_PAGE_SIZE,
  });

  const invites = adminView
    ? await prisma.organisationInvite.findMany({
        where: {
          organisationId: organisation.id,
          usedAt: null,
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        },
        orderBy: { createdAt: "desc" },
        take: 8,
        select: { id: true, token: true, createdAt: true, expiresAt: true },
      })
    : [];

  const baseUrl: string =
    process.env.NEXT_PUBLIC_BASE_URL ??
    (() => {
      const proto = h.get("x-forwarded-proto") ?? "http";
      const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
      return `${proto}://${host}`;
    })();

  return (
    <div className="flex flex-col gap-6 pb-4">
      <PageHeader
        title="Members"
        description={
          ownerView
            ? "Manage roles, invite collaborators, and keep your workspace in good shape."
            : adminView
              ? "Invite collaborators and manage the members of this workspace."
              : "Everyone who belongs to this organisation."
        }
      />

      {adminView ? (
        <OrgInviteLinkPanel
          organisationSlug={organisation.slug}
          baseUrl={baseUrl}
          invites={invites.map((i) => ({
            ...i,
            createdAt: i.createdAt.toISOString(),
            expiresAt: i.expiresAt ? i.expiresAt.toISOString() : null,
          }))}
        />
      ) : null}

      {members.length === 0 ? (
        <EmptyState mood="sleepy">No members found.</EmptyState>
      ) : (
        <Table label="Members" className="min-w-[560px]">
          <THead>
            <tr>
              <TH>Member</TH>
              <TH className="hidden sm:table-cell">Email</TH>
              <TH>Access</TH>
            </tr>
          </THead>
          <TBody>
            {members.map((m) => (
              <TR key={m.id}>
                <TD>
                  <div className="flex items-center gap-3">
                    <Avatar name={m.user.name ?? m.user.email} size="md" />
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-ink">{m.user.name ?? "Unnamed member"}</p>
                      <p className="truncate text-caption text-ink-muted sm:hidden">{m.user.email ?? "—"}</p>
                    </div>
                  </div>
                </TD>
                <TD className="hidden text-ink-secondary sm:table-cell">{m.user.email ?? "—"}</TD>
                <TD>
                  <MemberRoleActions
                    organisationSlug={organisation.slug}
                    targetUserId={m.userId}
                    role={m.role}
                    actorRole={membership.role}
                  />
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
      {memberPages > 1 ? (
        <nav aria-label="Member pages" className="flex items-center justify-end gap-2">
          <p className="text-sm text-ink-muted">Page {memberPage} of {memberPages}</p>
          {memberPage <= 1 ? (
            <Button size="sm" variant="secondary" disabled>Previous</Button>
          ) : (
            <Button asChild size="sm" variant="secondary"><Link href={`?page=${memberPage - 1}`}>Previous</Link></Button>
          )}
          {memberPage >= memberPages ? (
            <Button size="sm" variant="secondary" disabled>Next</Button>
          ) : (
            <Button asChild size="sm" variant="secondary"><Link href={`?page=${memberPage + 1}`}>Next</Link></Button>
          )}
        </nav>
      ) : null}
    </div>
  );
}
