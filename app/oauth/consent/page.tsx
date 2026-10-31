import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Check, EyeOff } from "lucide-react";
import { YuyuWordmark } from "@/components/chrome/SiteHeader";
import { ConsentActions } from "@/components/oauth/ConsentActions";
import { Avatar, Callout } from "@/components/ui/display";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { consentLines } from "@/lib/oidc/config";
import { AUTHORIZE_PARAMS } from "@/lib/oidc/dto";
import { redirectWith, validateAuthorizeRequest } from "@/lib/oidc/provider";

export const metadata: Metadata = { title: "Authorise app", robots: { index: false, follow: false }, referrer: "no-referrer" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/** Rebuild the authorization query, keeping repeated values so validation can refuse them. */
function toQuery(raw: Record<string, string | string[] | undefined>) {
  const params = new URLSearchParams();
  for (const key of AUTHORIZE_PARAMS) {
    const value = raw[key];
    for (const item of Array.isArray(value) ? value : value === undefined ? [] : [value]) params.append(key, item);
  }
  return params;
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-canvas px-4 py-5 sm:px-8 sm:py-6">
      <header>
        <YuyuWordmark />
      </header>
      <main id="main-content" tabIndex={-1} className="flex flex-1 items-center justify-center py-10 focus:outline-none">
        <div className="flex w-full max-w-[460px] flex-col gap-6">{children}</div>
      </main>
    </div>
  );
}

/**
 * The one-time authorisation screen (docs/OIDC_PROVIDER.md). Shown the first
 * time a person signs in to a connected app such as People's Gallery, and
 * again only if the app asks for more or the person disconnected it.
 */
export default async function OAuthConsentPage({ searchParams }: Props) {
  const params = toQuery(await searchParams);
  const validation = await validateAuthorizeRequest(params);

  if (validation.kind === "fatal") {
    return (
      <Shell>
        <h1 className="text-display-l text-ink">Can’t sign you in.</h1>
        <Callout tone="danger" role="alert">{validation.message}</Callout>
        <p className="text-body-ui text-ink-secondary">Go back to the app and try again. If this keeps happening, contact the app’s organisers.</p>
      </Shell>
    );
  }
  if (validation.kind === "redirect_error") {
    redirect(redirectWith(validation.redirectUri, { error: validation.error, error_description: validation.description, state: validation.state }));
  }

  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) redirect(`/login?callbackUrl=${encodeURIComponent(`/oauth/authorize?${params.toString()}`)}`);
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { name: true, email: true, image: true, profileImageUrl: true } });
  if (!user) redirect("/login");

  const { client, scopes } = validation.request;
  const lines = consentLines(scopes);
  const headingId = "consent-heading";
  return (
    <Shell>
      <section aria-labelledby={headingId} className="flex flex-col gap-6 rounded-2xl border border-line bg-canvas p-5 sm:p-7">
        <div className="flex flex-col gap-2">
          <p className="text-body-ui text-ink-muted">Sign in with Yuyu</p>
          <h1 id={headingId} className="text-h2 text-ink">{client.name} wants to:</h1>
        </div>
        <ul className="flex flex-col gap-3">
          {lines.map((line) => (
            <li key={line} className="flex items-start gap-3 text-body text-ink">
              <span aria-hidden className="mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-success-bg text-success-fg [&_svg]:size-4">
                <Check />
              </span>
              <span>{line}</span>
            </li>
          ))}
        </ul>
        <p className="flex items-start gap-3 text-body-ui text-ink-secondary">
          <EyeOff aria-hidden className="mt-0.5 size-5 shrink-0" />
          <span>
            {client.name} sees your name and profile photo, never your email address. You can disconnect it at any time in{" "}
            <span className="font-semibold text-ink">Account → Security</span>.
          </span>
        </p>
        <div className="flex items-center gap-3 rounded-xl bg-subtle px-4 py-3">
          <Avatar name={user.name ?? user.email} src={user.profileImageUrl ?? user.image} size="sm" />
          <div className="min-w-0 text-body-ui">
            <p className="truncate font-semibold text-ink">{user.name || "Your Yuyu account"}</p>
            {user.email ? <p className="truncate text-ink-muted">{user.email}</p> : null}
          </div>
        </div>
        <ConsentActions query={params.toString()} />
      </section>
    </Shell>
  );
}
