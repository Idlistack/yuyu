import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { safeTimeZone } from "@/lib/timeZone";
import { requireAuth } from "@/lib/permissions";
import { listFaceMatchingForUser } from "@/lib/pgIntegration/selfie";
import { FaceMatchingCard, PhotoEmailCard } from "@/components/account/privacy/FaceMatchingCards";

export const metadata: Metadata = {
  title: "Privacy",
  robots: { index: false, follow: false },
  // Rows link to opaque ticket URLs; never leak them through Referer.
  referrer: "no-referrer",
};

export const dynamic = "force-dynamic";

/** Account → Privacy: face matching with People's Gallery and photo emails (docs/PG_INTEGRATION.md#selfie-step). */
export default async function AccountPrivacyPage() {
  // The page authenticates itself; the account layout is not an authorization boundary.
  const session = await requireAuth();
  const userId = session.user.id;
  const [rows, preference] = await Promise.all([
    listFaceMatchingForUser(userId),
    prisma.userNotificationPreference.findUnique({ where: { userId }, select: { pgPhotosEmail: true } }),
  ]);
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <FaceMatchingCard
        rows={rows.map((row) => ({
          rsvpId: row.rsvpId,
          eventTitle: row.eventTitle,
          startDateTime: row.startDateTime.toISOString(),
          timezone: safeTimeZone(row.timezone),
          ticketPath: row.ticketPath,
          minor: row.minor,
          active: row.active,
          selfieState: row.selfieState,
        }))}
      />
      <PhotoEmailCard initial={preference?.pgPhotosEmail ?? true} />
    </div>
  );
}
