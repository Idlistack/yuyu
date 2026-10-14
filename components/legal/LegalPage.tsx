import Link from "next/link";
import { cn } from "@/lib/cn";

export type LegalSection = { id: string; title: string; body: string };

/** Shared Privacy / Terms template (Figma "Privacy policy (Terms uses same template)"). */
export function LegalPage({ current, title, updated, notice, sections }: { current: "privacy" | "terms"; title: string; updated: string; notice: string; sections: LegalSection[] }) {
  return (
    <div className="flex flex-col gap-10">
      <header className="flex flex-col items-start gap-4">
        <nav aria-label="Legal documents" className="flex gap-2">
          {[
            { key: "privacy", href: "/privacy", label: "Privacy" },
            { key: "terms", href: "/terms", label: "Terms" },
          ].map((item) => (
            <Link
              key={item.key}
              href={item.href}
              aria-current={item.key === current ? "page" : undefined}
              className={cn(
                "inline-flex min-h-9 items-center rounded-full border px-3.5 text-sm font-semibold transition-colors",
                item.key === current ? "border-primary bg-primary text-on-primary" : "border-line-strong text-ink hover:bg-subtle",
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <h1 className="text-display-m text-ink">{title}</h1>
        <p className="text-body-ui text-ink-muted">Last updated {updated}</p>
      </header>

      <div className="grid gap-10 md:grid-cols-[260px_minmax(0,1fr)] md:gap-14">
        <nav aria-labelledby="legal-toc" className="md:sticky md:top-24 md:self-start">
          <p id="legal-toc" className="text-overline text-ink-muted">On this page</p>
          <ul className="mt-3 flex flex-col gap-1.5">
            {sections.map((section) => (
              <li key={section.id}>
                <a href={`#${section.id}`} className="text-sm text-ink-secondary underline-offset-4 hover:text-ink hover:underline">{section.title}</a>
              </li>
            ))}
          </ul>
        </nav>
        <div className="flex min-w-0 max-w-[640px] flex-col gap-8">
          <p className="rounded-lg bg-muted px-4 py-3.5 text-body-ui text-ink-secondary">{notice}</p>
          {sections.map((section) => (
            <section key={section.id} id={section.id} className="scroll-mt-24">
              <h2 className="text-h4 text-ink">{section.title}</h2>
              <p className="mt-2 text-body text-ink-secondary">{section.body}</p>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
