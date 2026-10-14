import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { YuyuMark } from "@/components/ui/display";

/** The existing three-chapter story, laid out on the design's "How it started" timeline. */
const chapters = [
  {
    eyebrow: "The person",
    title: "Hi, I’m Abhiram N J.",
    body: "I’m an engineer at Tech4Good Community and one among the many behind IdliStack. I’m also building Yuyu as a calmer way to bring people together—making free events easier to organise without turning every gathering into a transaction.",
    detail: "Because the best events are often the ones that begin with someone deciding there should be room for people to meet.",
  },
  {
    eyebrow: "The craft",
    title: "Human intent, AI-assisted making.",
    body: "Yuyu is shaped by Abhiram’s product decisions and built with the help of AI tools. They help explore ideas and accelerate implementation, while the care, trade-offs, and responsibility stay human.",
    detail: "The point is not to automate the thoughtfulness out of building—it is to spend more time on the details that make the product kinder and more useful.",
  },
  {
    eyebrow: "The invitation",
    title: "Still becoming, alongside real communities.",
    body: "Yuyu is self-hosted, privacy-minded, and designed to grow with the people using it for workshops, meetups, and meaningful gatherings.",
    detail: "It is a work in progress—one that stays grounded in the simple belief that software should make hosting feel more human, not less.",
  },
] as const;

const principles = [
  { title: "Always free to attend", body: "No tickets, payments or refunds. The doorway is never monetised.", tint: "bg-tint-mint" },
  { title: "Your data stays yours", body: "Each organisation is its own space. Nothing is shared between them.", tint: "bg-tint-lavender" },
  { title: "No ad trackers", body: "Private analytics only. Tickets, invites and answers are never sent.", tint: "bg-muted" },
  { title: "Open and self-hostable", body: "Run your own Yuyu, or use one hosted on IdliStack.", tint: "bg-tint-peach" },
] as const;

const gatheringTypes = ["Community meetups", "Workshops", "Campus events", "Volunteer gatherings", "Conferences", "Clubs & collectives"] as const;

export function AboutYuyu() {
  return (
    <div className="mx-auto flex max-w-[1160px] flex-col gap-16 px-4 py-14 sm:px-6 md:gap-20 md:py-[72px]">
      {/* Hero */}
      <section className="flex flex-col items-start gap-10 md:flex-row md:items-center md:gap-12">
        <div className="flex min-w-0 flex-[3] flex-col items-start gap-[22px]">
          <p className="rounded-full bg-muted px-3.5 py-1.5 text-sm font-semibold text-ink-secondary">About Yuyu</p>
          <h1 className="text-display-l text-ink">
            A small idea for better <span className="yy-highlight-lavender box-decoration-clone">gatherings.</span>
          </h1>
          <p className="max-w-[620px] text-body-l text-ink-secondary">
            Yuyu runs on{" "}
            <a href="https://idlistack.com" target="_blank" rel="noopener noreferrer" className="font-semibold text-ink underline underline-offset-4">IdliStack</a>
            , digital infrastructure that hosts and runs open-source tools with one click — no servers to manage and no tiered limits. This is the story of Abhiram, an engineer at Tech4Good Community and the person building IdliStack and Yuyu.
          </p>
        </div>
        <div className="flex flex-1 justify-center self-center">
          <YuyuMark size={220} className="-rotate-6 drop-shadow-sm max-sm:size-40" />
        </div>
      </section>

      {/* How it started */}
      <section className="grid gap-8 md:grid-cols-[1fr_3fr] md:gap-12" aria-labelledby="about-story">
        <h2 id="about-story" className="font-display text-[30px] font-extrabold leading-[1.1] tracking-[-0.02em] text-ink sm:text-[36px]">How it started</h2>
        <ol className="flex flex-col">
          {chapters.map((chapter, index) => {
            const last = index === chapters.length - 1;
            return (
              <li key={chapter.eyebrow} className="flex gap-5">
                <div aria-hidden className="flex flex-col items-center pt-1.5">
                  <span className={last ? "size-3.5 rounded-full border-2 border-primary bg-brand-mint" : "size-3.5 rounded-full bg-primary"} />
                  {last ? null : <span className="mt-1.5 w-0.5 flex-1 bg-line" />}
                </div>
                <div className={last ? "flex flex-col gap-1" : "flex flex-col gap-1 pb-8"}>
                  <p className="text-sm font-bold text-ink-muted">{chapter.eyebrow}</p>
                  <h3 className="font-sans text-xl font-bold text-ink">{chapter.title}</h3>
                  <p className="max-w-[640px] text-body text-ink-secondary">{chapter.body}</p>
                  <p className="max-w-[640px] text-body text-ink-muted">{chapter.detail}</p>
                </div>
              </li>
            );
          })}
        </ol>
      </section>

      {/* Principles */}
      <section className="flex flex-col gap-6" aria-labelledby="about-principles">
        <div className="flex flex-col gap-2">
          <h2 id="about-principles" className="font-display text-[32px] font-extrabold leading-[1.05] tracking-[-0.02em] text-ink sm:text-[44px]">A few principles, held on purpose.</h2>
          <p className="text-body-l text-ink-secondary">Not extras for later. They shape how Yuyu is designed, built and run.</p>
        </div>
        <ul className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
          {principles.map((principle) => (
            <li key={principle.title} className={`flex flex-col gap-2 rounded-xl p-6 ${principle.tint}`}>
              <h3 className="font-sans text-xl font-bold text-ink">{principle.title}</h3>
              <p className="text-body text-ink-secondary">{principle.body}</p>
            </li>
          ))}
        </ul>
      </section>

      {/* Who it's for */}
      <section className="flex flex-col gap-6 rounded-2xl border border-line p-6 sm:p-8 md:flex-row md:items-center md:gap-8">
        <h2 className="flex-1 font-display text-[28px] font-extrabold leading-[1.1] tracking-[-0.02em] text-ink sm:text-[36px]">Made for gatherings with a reason to exist.</h2>
        <div className="flex flex-[1.2] flex-col gap-3.5">
          <p className="text-body text-ink-secondary">For organisers who care about the room they’re creating. Big or small, one-time or recurring, the gathering stays at the centre.</p>
          <ul className="flex flex-wrap gap-2">
            {gatheringTypes.map((type) => (
              <li key={type} className="rounded-full bg-muted px-3.5 py-1.5 text-sm font-semibold text-ink">{type}</li>
            ))}
          </ul>
        </div>
      </section>

      {/* Next chapter */}
      <section className="flex flex-col items-start gap-4 rounded-2xl bg-tint-mint p-6 sm:p-8 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="font-display text-[26px] font-extrabold leading-[1.15] tracking-[-0.01em] text-ink sm:text-[30px]">The story gets better with people in the room.</h2>
          <p className="mt-1.5 text-body text-ink-secondary">Explore the gatherings being hosted with Yuyu—or start shaping one of your own.</p>
        </div>
        <div className="flex flex-wrap gap-2.5">
          <Button asChild variant="primary">
            <Link href="/discover">Explore events</Link>
          </Button>
          <Button asChild variant="secondary">
            <a href="https://abhiramnj.com" target="_blank" rel="noopener noreferrer">
              Visit Abhiram&apos;s portfolio
              <ArrowUpRight aria-hidden className="size-[18px]" />
            </a>
          </Button>
        </div>
      </section>
    </div>
  );
}
