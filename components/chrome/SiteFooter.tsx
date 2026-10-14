"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { YuyuMark } from "@/components/ui/display";

const publicLinks = [
  { label: "Discover", href: "/discover" },
  { label: "Features", href: "/features" },
  { label: "About", href: "/about" },
  { label: "Privacy", href: "/privacy" },
  { label: "Terms", href: "/terms" },
];

const linkClasses = "text-sm text-ink-muted underline-offset-4 transition-colors hover:text-ink hover:underline";

/** Yuyu site footer. "Hosted on Idlistack" lives here, never in the top nav. */
export function SiteFooter() {
  const pathname = usePathname();
  const { status } = useSession();
  const links = status === "authenticated"
    ? [{ label: "Dashboard", href: "/dashboard" }, { label: "Account", href: "/account" }, ...publicLinks]
    : status === "unauthenticated"
      ? [...publicLinks, { label: "Sign in", href: "/login" }]
      : publicLinks;

  return (
    <footer className="mt-auto border-t border-line bg-canvas">
      <div className="mx-auto flex max-w-[1160px] flex-col gap-6 px-4 py-8 sm:px-6 md:flex-row md:items-start md:justify-between">
        <div>
          <Link href="/" className="inline-flex items-center gap-2" aria-label="Yuyu home">
            <YuyuMark size={22} />
            <span aria-hidden className="font-display text-base font-extrabold text-ink">Yuyu</span>
          </Link>
          <p className="mt-1.5 text-caption text-ink-muted">Free events, run by communities. © {new Date().getFullYear()}</p>
        </div>
        <nav aria-label="Footer">
          <ul className="flex flex-wrap gap-x-5 gap-y-2">
            {links.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  aria-current={pathname === link.href || pathname?.startsWith(`${link.href}/`) ? "page" : undefined}
                  className={linkClasses}
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <p className="text-sm text-ink-muted">
          Built by{" "}
          <a href="https://abhiramnj.com" target="_blank" rel="noopener noreferrer" className="underline underline-offset-4 hover:text-ink">Abhiram</a>
          {" · Hosted on "}
          <a href="https://idlistack.com" target="_blank" rel="noopener noreferrer" className="underline underline-offset-4 hover:text-ink">Idlistack</a>
        </p>
      </div>
    </footer>
  );
}

/** Compact footer for event-facing pages: the organiser leads, Yuyu steps back. */
export function EventFooter() {
  return (
    <footer className="mt-auto border-t border-line bg-canvas">
      <div className="mx-auto flex max-w-[1160px] flex-col gap-3 px-4 py-6 text-sm text-ink-muted sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <Link href="/" className="inline-flex items-center gap-2 hover:text-ink">
          <YuyuMark size={18} />
          <span>Free event, powered by Yuyu</span>
        </Link>
        <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
          <Link href="/privacy" className="underline underline-offset-4 hover:text-ink">Privacy</Link>
          <span aria-hidden>·</span>
          <Link href="/terms" className="underline underline-offset-4 hover:text-ink">Terms</Link>
          <span aria-hidden>·</span>
          <span>
            Hosted on{" "}
            <a href="https://idlistack.com" target="_blank" rel="noopener noreferrer" className="underline underline-offset-4 hover:text-ink">Idlistack</a>
          </span>
        </p>
      </div>
    </footer>
  );
}
