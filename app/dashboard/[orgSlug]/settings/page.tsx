import Link from "next/link";
import { KeyRound } from "lucide-react";
import { prisma } from "@/lib/db";
import { canDeleteOrg, requireOrgRole } from "@/lib/permissions";
import { EditOrgForm } from "@/components/org/EditOrgForm";
import { CopyOrganisationUrl } from "@/components/org/CopyOrganisationUrl";
import { DeleteOrganisationButton } from "@/components/dashboard/DeleteOrganisationButton";
import { Button } from "@/components/ui/button";
import { DangerZone, PageHeader, SettingsRow } from "@/components/ui/display";

import type { Metadata } from "next";

type Props = { params: Promise<{ orgSlug: string }> };

export const metadata: Metadata = {
  title: "Settings",
  description: "Edit organisation details.",
};

export default async function OrgSettingsPage({ params }: Props) {
  const { orgSlug } = await params;
  const { organisation, membership } = await requireOrgRole(orgSlug, "ADMIN");

  const org = await prisma.organisation.findUnique({
    where: { id: organisation.id },
    select: { name: true, description: true, logoUrl: true, slug: true },
  });

  if (!org) {
    // requireOrgRole guarantees the org exists; this is defensive.
    return <p className="text-body-ui text-ink-muted">Organisation not found.</p>;
  }

  return (
    <div className="flex max-w-[880px] flex-col gap-6">
      <PageHeader
        kicker="Organisation settings"
        title="Shape your workspace"
        description={`Update the details people see when they visit ${org.name}. Changes are visible on the public organisation page as soon as you save them.`}
      />

      <EditOrgForm
        organisationSlug={org.slug}
        initial={{
          name: org.name,
          description: org.description ?? "",
          logoUrl: org.logoUrl,
        }}
      />

      <div className="border-t border-line">
        <SettingsRow title="Organisation URL" description="About this workspace">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-line bg-subtle px-3.5 py-2.5">
            <span className="font-semibold text-ink">/{org.slug}</span>
            <CopyOrganisationUrl slug={org.slug} />
          </div>
        </SettingsRow>

        {membership.role === "OWNER" ? (
          <SettingsRow title="API access" description="Manage machine clients, scopes, and rotatable credentials.">
            <Button asChild variant="secondary" size="sm">
              <Link href={`/dashboard/${org.slug}/settings/api`}>
                <KeyRound aria-hidden className="size-4" />
                Manage API access
              </Link>
            </Button>
          </SettingsRow>
        ) : null}
      </div>

      {canDeleteOrg(membership) ? (
        <DangerZone
          title="Danger zone"
          description="Permanently delete this organisation and all of its events, registrations, and memberships."
          action={<DeleteOrganisationButton organisationSlug={org.slug} />}
        />
      ) : null}
    </div>
  );
}
