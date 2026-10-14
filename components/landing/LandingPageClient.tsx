import Link from "next/link";
import { ArrowRight, Check, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DateBlock } from "@/components/ui/display";
import { BuildingNote } from "./BuildingNote";

const GITHUB_REPOSITORY_URL = "https://github.com/twilighty-abhi/yuyu";

const steps = [
  { number: "1", tint: "bg-highlight-mint", title: "Create your page", body: "Add the date, venue, programme, speakers and FAQ. Pick your colour and cover so it feels like yours." },
  { number: "2", tint: "bg-highlight-lavender", title: "Take RSVPs", body: "Ask the questions you need. Capacity, waitlists and approvals run themselves." },
  { number: "3", tint: "bg-highlight-peach", title: "Check in & follow up", body: "Scan QR tickets at the door, even offline. Collect feedback and send certificates after." },
];

/** Decorative sample of the organiser dashboard shown beside the hero. */
function HeroProductMock() {
  return (
    <figure aria-label="Example event dashboard" className="w-full rounded-[22px] border border-line bg-canvas p-[22px] shadow-float lg:max-w-[400px]">
      <div className="flex items-center gap-3.5">
        <DateBlock month="NOV" day="08" color="#4B3FA8" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-lg font-bold text-ink">Tech Founders Mixer</p>
          <p className="text-sm text-ink-muted">Sample event</p>
        </div>
        <span className="rounded-full bg-success-bg px-2.5 py-1 text-xs font-bold text-success-fg">Published</span>
      </div>
      <div className="mt-[18px] grid grid-cols-3 gap-2.5">
        {[
          { label: "Going", value: <>148<span className="text-[15px] text-ink-muted">/150</span></> },
          { label: "Waitlist", value: "24" },
          { label: "Checked in", value: "92%" },
        ].map((stat) => (
          <div key={stat.label} className="rounded-[14px] bg-muted p-3">
            <p className="text-[13px] text-ink-muted">{stat.label}</p>
            <p className="font-display text-[22px] font-extrabold text-ink">{stat.value}</p>
          </div>
        ))}
      </div>
      <div className="mt-[18px] flex flex-col gap-2 text-sm">
        <p className="flex items-center gap-2.5 rounded-md bg-success-bg px-3 py-[9px]">
          <Check aria-hidden className="size-4 shrink-0 text-success-fg" strokeWidth={3} />
          <span className="min-w-0 flex-1 text-ink"><strong>Arjun</strong> checked in with QR</span>
          <span className="text-ink-secondary">1m</span>
        </p>
        <p className="flex items-center gap-2.5 rounded-md bg-muted px-3 py-[9px]">
          <RefreshCw aria-hidden className="size-4 shrink-0 text-[#4B3FA8] dark:text-brand-lavender" strokeWidth={2.5} />
          <span className="min-w-0 flex-1 text-ink"><strong>Sarah</strong> moved off the waitlist</span>
          <span className="text-ink-secondary">5m</span>
        </p>
      </div>
    </figure>
  );
}

/** Decorative sample registration form. */
function RegistrationPreview() {
  return (
    <figure aria-label="Registration form preview" className="flex w-full flex-col gap-3 rounded-xl border border-line bg-canvas p-[22px]">
      <p className="text-base font-bold text-ink">Register for Tech Founders Mixer</p>
      <div>
        <p className="text-label text-ink">Full name</p>
        <p className="mt-1 rounded-md border border-line-strong px-3.5 py-[11px] text-base text-ink-muted">Your name</p>
      </div>
      <div>
        <p className="text-label text-ink">What do you work on?</p>
        <div className="mt-1 flex flex-wrap gap-1.5">
          <span className="rounded-full border border-primary px-3 py-[5px] text-sm font-semibold text-ink">Software</span>
          <span className="rounded-full border border-line-strong px-3 py-[5px] text-sm text-ink">Hardware</span>
          <span className="rounded-full border border-line-strong px-3 py-[5px] text-sm text-ink">Climate</span>
        </div>
      </div>
      <span className="self-start rounded-full bg-primary px-[18px] py-2.5 text-base font-bold text-on-primary">Register</span>
    </figure>
  );
}

export function LandingPageClient({ getStartedHref }: { getStartedHref: string }) {
  return (
    <>
      {/* Hero */}
      <section className="mx-auto flex max-w-[1160px] flex-col items-center gap-12 px-4 pb-16 pt-12 sm:px-6 lg:flex-row lg:gap-14 lg:pb-16 lg:pt-[72px]">
        <div className="flex min-w-0 flex-[1.64] flex-col items-start gap-6">
          <p className="rounded-full bg-muted px-3.5 py-1.5 text-sm font-semibold text-ink-secondary">Free to attend · Open source · Self-hostable</p>
          <h1 className="text-display-xl text-ink">
            Host events people actually <span className="yy-highlight box-decoration-clone">show up</span> to.
          </h1>
          <p className="max-w-[520px] text-body-l text-ink-secondary">
            Create a page, take RSVPs, check people in at the door and follow up afterwards. No ticket fees, no ad trackers, and your community’s data stays with you.
          </p>
          <div className="flex flex-wrap gap-2.5">
            <Button asChild variant="primary" size="lg">
              <Link href={getStartedHref}>Start organising — free</Link>
            </Button>
            <Button asChild variant="secondary" size="lg">
              <Link href="/discover">Explore events</Link>
            </Button>
          </div>
        </div>
        <div className="flex w-full min-w-0 flex-1 justify-center lg:justify-end">
          <HeroProductMock />
        </div>
      </section>

      {/* Steps */}
      <section className="border-y border-line bg-subtle">
        <div className="mx-auto flex max-w-[1160px] flex-col gap-8 px-4 py-16 sm:px-6">
          <h2 className="max-w-[640px] font-display text-[32px] font-extrabold leading-[1.05] tracking-[-0.02em] text-ink sm:text-[44px]">
            From first RSVP to the follow-up, in one place.
          </h2>
          <ol className="grid gap-4 md:grid-cols-3">
            {steps.map((step) => (
              <li key={step.number} className="flex flex-col gap-2.5 rounded-xl border border-line bg-canvas p-6">
                <span aria-hidden className={`flex size-10 items-center justify-center rounded-full font-display text-base font-extrabold text-ink ${step.tint}`}>{step.number}</span>
                <h3 className="font-sans text-xl font-bold text-ink">{step.title}</h3>
                <p className="text-body text-ink-secondary">{step.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Registration and door */}
      <section className="mx-auto flex max-w-[1160px] flex-col gap-10 px-4 py-[72px] sm:px-6">
        <div className="grid items-center gap-10 md:grid-cols-2">
          <div className="flex flex-col gap-3">
            <p className="text-sm font-bold text-[#4B3FA8] dark:text-brand-lavender">Registration</p>
            <h2 className="font-display text-[28px] font-extrabold leading-[1.1] tracking-[-0.02em] text-ink sm:text-[34px]">Ask exactly what you need — nothing more.</h2>
            <p className="text-body text-ink-secondary">Text, choice, date and phone questions in any order. Guests can register with or without an account.</p>
          </div>
          <RegistrationPreview />
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="flex flex-col gap-2 rounded-xl bg-muted p-[26px]">
            <h3 className="font-sans text-xl font-bold text-ink">Waitlists that move on their own</h3>
            <p className="text-body text-ink-secondary">When someone cancels, the next person is confirmed and emailed automatically. Approve-only events stay in your hands.</p>
          </div>
          <div className="flex flex-col gap-2 rounded-xl bg-muted p-[26px]">
            <h3 className="font-sans text-xl font-bold text-ink">A door that keeps moving</h3>
            <p className="text-body text-ink-secondary">QR scanning, name search and a PIN-locked tablet station for volunteers. Works without a connection.</p>
          </div>
        </div>
      </section>

      {/* CTA band */}
      <section className="mx-auto max-w-[1160px] px-4 pb-[72px] sm:px-6">
        <div className="flex flex-col gap-10 rounded-3xl bg-inverse p-8 text-on-inverse sm:p-12 md:flex-row md:items-end">
          <div className="flex flex-1 flex-col gap-4">
            <h2 className="font-display text-[40px] font-extrabold leading-none tracking-[-0.03em] text-on-inverse sm:text-[52px]">
              Free to attend.
              <br />
              <span className="text-brand-mint">Yours to keep.</span>
            </h2>
            <ul className="flex flex-col gap-2 text-[17px] text-[#E4E4E7]">
              <li>No ticket fees or payments — attendance is always free.</li>
              <li>No ad trackers. Analytics never see tickets or answers.</li>
              <li>Each organisation’s data stays separate and theirs.</li>
            </ul>
          </div>
          <div className="flex flex-col items-stretch gap-2.5 md:w-[260px]">
            <Button asChild variant="inverse" size="lg" fullWidth>
              <Link href={getStartedHref}>Start organising</Link>
            </Button>
            <BuildingNote className="inline-flex min-h-11 items-center justify-center gap-1 text-base font-semibold text-[#E4E4E7] underline underline-offset-4 hover:text-white">
              Read how Yuyu is built
              <ArrowRight aria-hidden className="size-4" />
            </BuildingNote>
            <a href={GITHUB_REPOSITORY_URL} target="_blank" rel="noreferrer" className="inline-flex min-h-9 items-center justify-center text-sm text-[#A1A1AA] underline-offset-4 hover:text-white hover:underline">
              View the code on GitHub
            </a>
          </div>
        </div>
      </section>
    </>
  );
}
