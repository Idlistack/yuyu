import { prisma } from "@/lib/db";
import { OrganiserChrome } from "@/components/chrome/OrganiserChrome";

/**
 * Organiser-branded chrome for every public organiser page (organisation,
 * event, programme, session, speaker, series date, feedback). Only public
 * organisation fields are read; the pages below still enforce their own
 * visibility rules and return not-found as before.
 */
export default async function OrganiserLayout({ children, params }: { children: React.ReactNode; params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const organisation = await prisma.organisation.findUnique({
    where: { slug: orgSlug },
    select: { name: true, slug: true, logoUrl: true },
  });
  return <OrganiserChrome organisation={organisation}>{children}</OrganiserChrome>;
}
