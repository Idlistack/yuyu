"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import {
  ArrowUpRight,
  CalendarDays,
  ChevronsUpDown,
  Home,
  KeyRound,
  LogOut,
  Menu as MenuIcon,
  Plus,
  Repeat,
  Settings,
  Users,
  X,
} from "lucide-react";
import { cn } from "@/lib/cn";
import type { ShellOrganisation, ShellUser } from "@/lib/appShell";
import { Avatar, OrgLogo } from "@/components/ui/display";
import { IconButton } from "@/components/ui/button";
import { Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { YuyuWordmark } from "./SiteHeader";
import { ColorModeToggle } from "./ColorModeToggle";

const roleLabel: Record<ShellOrganisation["role"], string> = {
  OWNER: "Owner",
  ADMIN: "Admin",
  MEMBER: "Member",
  COLLABORATOR: "Collaborator",
};

function NavItem({ href, icon, children, active, indent = false, onNavigate }: { href: string; icon?: ReactNode; children: ReactNode; active: boolean; indent?: boolean; onNavigate?: () => void }) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex min-h-10 items-center gap-2.5 rounded-md px-3 text-[15px] text-ink-secondary transition-colors hover:bg-emphasis/70 hover:text-ink [&_svg]:size-[18px] [&_svg]:shrink-0",
        indent && "pl-10 text-sm",
        active && "bg-emphasis font-semibold text-ink",
      )}
    >
      {icon ? <span aria-hidden className="inline-flex">{icon}</span> : null}
      <span className="min-w-0 truncate">{children}</span>
    </Link>
  );
}

function currentOrganisationSlug(pathname: string | null) {
  const match = /^\/dashboard\/([^/]+)/.exec(pathname ?? "");
  if (!match || match[1] === "org" || match[1] === "security") return null;
  return decodeURIComponent(match[1]!);
}

function SidebarContents({ user, organisations, onNavigate }: { user: ShellUser; organisations: ShellOrganisation[]; onNavigate?: () => void }) {
  const pathname = usePathname() ?? "";
  const slug = currentOrganisationSlug(pathname);
  const current = slug ? organisations.find((organisation) => organisation.slug === slug) ?? null : null;
  const base = current ? `/dashboard/${current.slug}` : "";
  const isAdmin = current?.role === "OWNER" || current?.role === "ADMIN";
  const isOwner = current?.role === "OWNER";
  const isMember = current && current.role !== "COLLABORATOR";
  const onEventsPage = Boolean(current) && (pathname === base || pathname.startsWith(`${base}/event/`));

  return (
    <div className="flex h-full flex-col gap-4 p-3.5">
      <div className="px-2 pt-1.5">
        <YuyuWordmark href="/dashboard" />
      </div>

      {current ? (
        <>
          <Menu>
            <MenuTrigger className="flex w-full items-center gap-2.5 rounded-lg border border-line bg-canvas p-2.5 text-left transition-colors hover:bg-subtle">
              <OrgLogo name={current.name} src={current.logoUrl} size="md" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-semibold text-ink">{current.name}</span>
                <span className="block text-caption text-ink-muted">{roleLabel[current.role]}</span>
              </span>
              <ChevronsUpDown aria-hidden className="size-4 shrink-0 text-ink-muted" />
              <span className="sr-only">Switch organisation</span>
            </MenuTrigger>
            <MenuContent align="start" className="w-[var(--radix-dropdown-menu-trigger-width)] min-w-[240px]">
              <MenuLabel>Organisations</MenuLabel>
              {organisations.map((organisation) => (
                <MenuItem key={organisation.slug} asChild>
                  <Link href={`/dashboard/${organisation.slug}`} onClick={onNavigate}>
                    <span className="flex items-center gap-2.5">
                      <OrgLogo name={organisation.name} src={organisation.logoUrl} size="sm" />
                      <span className="min-w-0 truncate">{organisation.name}</span>
                    </span>
                  </Link>
                </MenuItem>
              ))}
              <MenuSeparator />
              <MenuItem asChild icon={<Home />}>
                <Link href="/dashboard" onClick={onNavigate}>All organisations</Link>
              </MenuItem>
              <MenuItem asChild icon={<Plus />}>
                <Link href="/dashboard/org/new" onClick={onNavigate}>New organisation</Link>
              </MenuItem>
            </MenuContent>
          </Menu>

          <nav aria-label="Organisation" className="flex flex-col gap-0.5">
            <NavItem href={base} icon={<CalendarDays />} active={onEventsPage} onNavigate={onNavigate}>Events</NavItem>
            {isMember ? (
              <NavItem href={`${base}#series`} icon={<Repeat />} active={pathname.startsWith(`${base}/series/`)} onNavigate={onNavigate}>Series</NavItem>
            ) : null}
            {isMember ? (
              <NavItem href={`${base}/members`} icon={<Users />} active={pathname.startsWith(`${base}/members`)} onNavigate={onNavigate}>Members</NavItem>
            ) : null}
            {isAdmin ? (
              <>
                <NavItem href={`${base}/settings`} icon={<Settings />} active={pathname === `${base}/settings`} onNavigate={onNavigate}>Settings</NavItem>
                {isOwner ? (
                  <NavItem href={`${base}/settings/api`} icon={<KeyRound />} active={pathname.startsWith(`${base}/settings/api`)} indent onNavigate={onNavigate}>API access</NavItem>
                ) : null}
              </>
            ) : null}
          </nav>
        </>
      ) : (
        <nav aria-label="Workspace" className="flex flex-col gap-0.5">
          <NavItem href="/dashboard" icon={<Home />} active={pathname === "/dashboard"} onNavigate={onNavigate}>Home</NavItem>
          <p className="mt-4 px-3 pb-1 text-overline text-ink-muted">Organisations</p>
          {organisations.map((organisation) => (
            <Link
              key={organisation.slug}
              href={`/dashboard/${organisation.slug}`}
              onClick={onNavigate}
              className="flex min-h-10 items-center gap-2.5 rounded-md px-3 text-[15px] text-ink-secondary transition-colors hover:bg-emphasis/70 hover:text-ink"
            >
              <OrgLogo name={organisation.name} src={organisation.logoUrl} size="sm" className="size-6 rounded-[7px] text-[10px]" />
              <span className="min-w-0 truncate">{organisation.name}</span>
            </Link>
          ))}
          <NavItem href="/dashboard/org/new" icon={<Plus />} active={pathname === "/dashboard/org/new"} onNavigate={onNavigate}>New organisation</NavItem>
        </nav>
      )}

      <div className="mt-auto flex flex-col gap-1">
        {current && current.role !== "COLLABORATOR" ? (
          <Link
            href={`/${current.slug}`}
            onClick={onNavigate}
            className="inline-flex min-h-9 items-center gap-1 px-3 text-sm font-medium text-ink-secondary underline-offset-4 hover:text-ink hover:underline"
          >
            View public page
            <ArrowUpRight aria-hidden className="size-4" />
          </Link>
        ) : null}
        <div className="flex items-center gap-1">
          <Link
            href="/account"
            onClick={onNavigate}
            aria-current={pathname.startsWith("/account") ? "page" : undefined}
            className={cn(
              "flex min-h-11 min-w-0 flex-1 items-center gap-2.5 rounded-md px-2.5 text-[15px] text-ink transition-colors hover:bg-emphasis/70",
              pathname.startsWith("/account") && "bg-emphasis font-semibold",
            )}
          >
            <Avatar name={user.name ?? user.email} src={user.image} size="sm" className="size-7 text-[11px]" />
            <span className="min-w-0 truncate">{user.name ?? user.email ?? "Account"}</span>
          </Link>
          <ColorModeToggle size="sm" />
        </div>
        <button
          type="button"
          onClick={() => void signOut({ callbackUrl: "/" })}
          className="flex min-h-10 items-center gap-2.5 rounded-md px-3 text-left text-[15px] text-ink-secondary transition-colors hover:bg-emphasis/70 hover:text-ink"
        >
          <LogOut aria-hidden className="size-[18px]" />
          Sign out
        </button>
      </div>
    </div>
  );
}

/**
 * Dashboard app shell (docs/DESIGN.md §4.13): a 248px sidebar on desktop,
 * a top bar with a menu sheet below the md breakpoint.
 */
export function AppShell({ user, organisations, children }: { user: ShellUser; organisations: ShellOrganisation[]; children: ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <div className="flex min-h-dvh flex-col md:flex-row">
      <aside className="sticky top-0 hidden h-dvh w-[248px] shrink-0 overflow-y-auto border-r border-line bg-subtle md:block">
        <SidebarContents user={user} organisations={organisations} />
      </aside>

      <div className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-line bg-subtle/95 px-4 backdrop-blur-md md:hidden">
        <YuyuWordmark href="/dashboard" />
        <DialogPrimitive.Root open={menuOpen} onOpenChange={setMenuOpen}>
          <DialogPrimitive.Trigger asChild>
            <IconButton label="Open navigation menu">
              <MenuIcon />
            </IconButton>
          </DialogPrimitive.Trigger>
          <DialogPrimitive.Portal>
            <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-[rgba(17,17,19,0.48)]" />
            <DialogPrimitive.Content className="fixed inset-y-0 left-0 z-50 w-[min(300px,86vw)] overflow-y-auto border-r border-line bg-subtle shadow-float focus:outline-none">
              <DialogPrimitive.Title className="sr-only">Navigation</DialogPrimitive.Title>
              <DialogPrimitive.Description className="sr-only">Dashboard navigation</DialogPrimitive.Description>
              <DialogPrimitive.Close asChild>
                <IconButton label="Close navigation menu" size="sm" className="absolute right-3 top-3">
                  <X />
                </IconButton>
              </DialogPrimitive.Close>
              <SidebarContents user={user} organisations={organisations} onNavigate={() => setMenuOpen(false)} />
            </DialogPrimitive.Content>
          </DialogPrimitive.Portal>
        </DialogPrimitive.Root>
      </div>

      <main id="main-content" tabIndex={-1} className="min-w-0 flex-1 px-4 py-6 focus:outline-none sm:px-6 md:px-10 md:py-9">
        <div className="mx-auto w-full max-w-[1200px]">{children}</div>
      </main>
    </div>
  );
}
