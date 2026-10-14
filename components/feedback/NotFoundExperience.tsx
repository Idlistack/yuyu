"use client";

import { useMemo, useState, type FormEvent, type PointerEvent } from "react";
import { AnimatePresence, motion, useMotionTemplate, useMotionValue, useReducedMotion, useSpring, useTransform, type PanInfo } from "framer-motion";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Compass, Scissors, Search } from "lucide-react";
import { chromeFor } from "@/components/chrome/ChromeSwitch";
import { SiteHeader } from "@/components/chrome/SiteHeader";
import { SiteFooter } from "@/components/chrome/SiteFooter";
import { Button } from "@/components/ui/button";
import { SearchInput } from "@/components/ui/field";
import { accentStyle } from "@/lib/theme/accent";
import { NotFoundPet } from "@/components/feedback/NotFoundPet";

const QR_SIZE = 21;
const TEAR_DISTANCE = 90;

/** Deterministic, decorative QR-like pattern seeded by the missing path. It encodes nothing. */
function useFakeQr(seed: string) {
  return useMemo(() => {
    let hash = 2166136261;
    for (const char of seed) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
    const random = () => {
      hash ^= hash << 13;
      hash ^= hash >>> 17;
      hash ^= hash << 5;
      return ((hash >>> 0) % 1000) / 1000;
    };
    const finder = (x: number, y: number) => {
      for (const [ox, oy] of [[0, 0], [QR_SIZE - 7, 0], [0, QR_SIZE - 7]] as const) {
        const dx = x - ox;
        const dy = y - oy;
        if (dx >= 0 && dx < 7 && dy >= 0 && dy < 7) {
          const ring = Math.min(dx, dy, 6 - dx, 6 - dy);
          return ring === 0 || ring >= 2 ? 1 : 0;
        }
      }
      return null;
    };
    const cells: Array<[number, number]> = [];
    for (let y = 0; y < QR_SIZE; y++) {
      for (let x = 0; x < QR_SIZE; x++) {
        const fixed = finder(x, y);
        if (fixed === 1 || (fixed === null && random() > 0.52)) cells.push([x, y]);
      }
    }
    return cells;
  }, [seed]);
}

function TicketField({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-overline text-ink-muted">{label}</dt>
      <dd className={mono ? "truncate font-mono text-[13px] font-medium text-ink" : "truncate text-[15px] font-bold text-ink"}>{value}</dd>
    </div>
  );
}

export function NotFoundExperience() {
  const router = useRouter();
  const pathname = usePathname() ?? "/";
  // Routes whose layout renders its own chrome lose it on a root 404, so add a minimal header there.
  const needsChrome = chromeFor(pathname) === "own";
  const reduceMotion = useReducedMotion();
  const qr = useFakeQr(pathname);
  const [torn, setTorn] = useState(false);
  const [query, setQuery] = useState("");

  // 3D tilt and a light sheen that follow the pointer.
  const tiltX = useMotionValue(0);
  const tiltY = useMotionValue(0);
  const rotateX = useSpring(tiltX, { stiffness: 180, damping: 18, mass: 0.6 });
  const rotateY = useSpring(tiltY, { stiffness: 180, damping: 18, mass: 0.6 });
  const sheenX = useMotionValue(50);
  const sheenY = useMotionValue(30);
  const sheen = useMotionTemplate`radial-gradient(420px circle at ${sheenX}% ${sheenY}%, rgba(255,255,255,0.22), transparent 60%)`;

  // Dragging the stub to the right tears it off.
  const stubX = useMotionValue(0);
  const stubRotate = useTransform(stubX, [0, TEAR_DISTANCE * 1.4], [0, 9]);
  const perforationScale = useTransform(stubX, [0, TEAR_DISTANCE], [1, 0.96]);

  const onTilt = (event: PointerEvent<HTMLDivElement>) => {
    if (reduceMotion || event.pointerType !== "mouse") return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const px = (event.clientX - bounds.left) / bounds.width;
    const py = (event.clientY - bounds.top) / bounds.height;
    tiltY.set((px - 0.5) * 14);
    tiltX.set((0.5 - py) * 12);
    sheenX.set(px * 100);
    sheenY.set(py * 100);
  };
  const resetTilt = () => {
    tiltX.set(0);
    tiltY.set(0);
  };

  const onStubDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.x > TEAR_DISTANCE || info.velocity.x > 700) setTorn(true);
  };

  const goBackOrHome = () => {
    try {
      const hasSameOriginReferrer = document.referrer && new URL(document.referrer).origin === window.location.origin;
      if (hasSameOriginReferrer && window.history.length > 1) {
        router.back();
        return;
      }
    } catch {
      // A malformed referrer is treated like an unknown navigation source.
    }
    router.push("/");
  };

  const search = (event: FormEvent) => {
    event.preventDefault();
    const q = query.trim();
    router.push(q ? `/discover?q=${encodeURIComponent(q)}` : "/discover");
  };

  const shortPath = pathname.length > 38 ? `${pathname.slice(0, 36)}…` : pathname;

  const content = (
    <div style={accentStyle(null)} className="yy-accent-scope mx-auto flex w-full max-w-[1160px] flex-col items-center gap-6 px-4 pb-20 pt-6 sm:px-6 sm:pt-8 lg:gap-7 lg:pb-16 lg:pt-10 xl:px-0">
      <NotFoundPet />
      <div className="flex flex-col items-center gap-3 text-center">
        <h1 className="max-w-[760px] text-h1 text-ink">This page isn’t on the programme</h1>
        <p className="max-w-[620px] text-body-ui text-ink-secondary sm:text-[17px]">
          We scanned the ticket for <span className="font-mono text-[0.92em] text-ink">{shortPath}</span> and couldn’t find a match. It may have moved, expired, or never existed.
        </p>
      </div>

      {/* The ticket */}
      <div className="w-full max-w-[640px] [perspective:1200px]" onPointerMove={onTilt} onPointerLeave={resetTilt}>
        <motion.div
          initial={reduceMotion ? false : { opacity: 0, y: 24, rotateX: 18 }}
          animate={{ opacity: 1, y: 0, rotateX: 0 }}
          transition={{ duration: 0.6, ease: [0.2, 0.8, 0.2, 1] }}
          style={reduceMotion ? undefined : { rotateX, rotateY, transformStyle: "preserve-3d" }}
          className="relative flex flex-col sm:flex-row"
        >
          {/* Main part */}
          <div className="relative min-w-0 flex-1 overflow-hidden rounded-t-[20px] border border-line bg-canvas shadow-float sm:rounded-l-[20px] sm:rounded-tr-none sm:border-r-0">
            <div className="bg-accent px-5 py-3.5 text-on-accent">
              <p className="text-label opacity-90">Yuyu · Lost &amp; found</p>
              <p className="font-display text-[24px] font-extrabold leading-tight tracking-[-0.02em] sm:text-[26px]">Page not found</p>
            </div>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 px-5 py-4">
              <div className="col-span-2">
                <TicketField label="Requested" value={pathname} mono />
              </div>
              <TicketField label="Seat" value="404" />
              <TicketField label="Admits" value="No one, yet" />
            </dl>
            {!reduceMotion ? <motion.div aria-hidden className="pointer-events-none absolute inset-0" style={{ backgroundImage: sheen }} /> : null}
          </div>

          {/* Perforation */}
          <motion.div
            aria-hidden
            style={{ opacity: torn ? 0 : 1, scaleY: perforationScale }}
            className="relative hidden w-0 border-l-2 border-dashed border-line-strong sm:block"
          >
            <span className="absolute -left-[11px] -top-2.5 size-5 rounded-full bg-subtle" />
            <span className="absolute -bottom-2.5 -left-[11px] size-5 rounded-full bg-subtle" />
          </motion.div>

          {/* Stub (drag right, or use the button, to tear it off) */}
          <div className="relative sm:w-[176px]">
            <AnimatePresence initial={false}>
              {torn ? (
                <motion.div
                  key="revealed"
                  initial={reduceMotion ? false : { opacity: 0, scale: 0.94 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.35, delay: 0.15 }}
                  className="flex h-full flex-col items-center justify-center gap-3 rounded-b-[20px] border border-dashed border-line-strong bg-tint-peach px-5 py-6 text-center sm:rounded-r-[20px] sm:rounded-bl-none"
                >
                  <p className="text-overline text-ink-muted">Your stub says</p>
                  <p className="font-display text-[20px] font-extrabold leading-tight text-ink">There’s plenty else on</p>
                  <Button asChild variant="accent" size="sm">
                    <Link href="/discover">
                      Discover events
                      <ArrowRight aria-hidden className="size-4" />
                    </Link>
                  </Button>
                </motion.div>
              ) : (
                <motion.div
                  key="stub"
                  drag={reduceMotion ? false : "x"}
                  dragConstraints={{ left: 0, right: 0 }}
                  dragElastic={{ left: 0, right: 0.9 }}
                  onDragEnd={onStubDragEnd}
                  style={{ x: stubX, rotate: stubRotate, transformOrigin: "0% 100%" }}
                  exit={reduceMotion ? { opacity: 0 } : { x: 220, y: 140, rotate: 38, opacity: 0, transition: { duration: 0.55, ease: [0.4, 0, 0.6, 1] } }}
                  className="relative flex h-full cursor-grab touch-pan-y flex-col items-center justify-center gap-2 overflow-hidden rounded-b-[20px] border border-line bg-canvas px-5 py-5 shadow-float active:cursor-grabbing sm:rounded-r-[20px] sm:rounded-bl-none sm:border-l-0"
                >
                  <div className="relative w-[104px] rounded-[10px] border border-line bg-white p-2">
                    <svg viewBox={`0 0 ${QR_SIZE} ${QR_SIZE}`} className="block w-full text-[#18181B]" shapeRendering="crispEdges" aria-hidden>
                      {qr.map(([x, y]) => (
                        <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill="currentColor" />
                      ))}
                    </svg>
                    {!reduceMotion ? (
                      <motion.span
                        aria-hidden
                        className="absolute inset-x-1 h-0.5 rounded-full bg-accent shadow-[0_0_12px_2px_var(--yy-accent)]"
                        initial={{ top: "8%", opacity: 0 }}
                        animate={{ top: ["8%", "92%", "8%", "92%"], opacity: [0, 1, 1, 0] }}
                        transition={{ duration: 1.6, ease: "easeInOut" }}
                      />
                    ) : null}
                    <motion.span
                      className="absolute left-1/2 top-1/2 whitespace-nowrap rounded-md border-[3px] border-danger-solid px-2 py-0.5 font-display text-[14px] font-extrabold uppercase tracking-[0.06em] text-danger-solid"
                      initial={reduceMotion ? { x: "-50%", y: "-50%", rotate: -14, opacity: 1, scale: 1 } : { x: "-50%", y: "-50%", rotate: -30, opacity: 0, scale: 2.4 }}
                      animate={{ x: "-50%", y: "-50%", rotate: -14, opacity: 1, scale: 1 }}
                      transition={{ delay: reduceMotion ? 0 : 1.7, type: "spring", stiffness: 520, damping: 18 }}
                    >
                      No match
                    </motion.span>
                  </div>
                  <p className="hidden text-caption text-ink-muted sm:block">Drag to tear off →</p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
        {!torn ? (
          <div className="mt-2.5 flex justify-center">
            <button type="button" onClick={() => setTorn(true)} className="inline-flex min-h-8 items-center gap-1.5 rounded-full border border-line-strong bg-canvas px-4 text-label text-ink-secondary transition-colors hover:bg-subtle hover:text-ink">
              <Scissors aria-hidden className="size-4" />
              Tear off the stub
            </button>
          </div>
        ) : null}
      </div>

      {/* Ways forward */}
      <div className="flex w-full max-w-[560px] flex-col items-center gap-3 lg:max-w-[880px] lg:flex-row lg:justify-center">
        <form onSubmit={search} role="search" className="flex w-full gap-2 lg:w-[420px]">
          <label htmlFor="not-found-search" className="sr-only">Search events</label>
          <SearchInput id="not-found-search" placeholder="Looking for an event?" value={query} onChange={(event) => setQuery(event.target.value)} onClear={() => setQuery("")} />
          <Button type="submit" variant="secondary" startIcon={<Search />}>Search</Button>
        </form>
        <div className="flex shrink-0 flex-wrap justify-center gap-2">
          <Button onClick={goBackOrHome} variant="primary" startIcon={<ArrowLeft />}>Go back</Button>
          <Button asChild variant="secondary">
            <Link href="/discover">
              <Compass aria-hidden className="size-[18px]" />
              Discover events
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );

  if (!needsChrome) return content;
  // Routes that normally draw their own chrome (dashboard, organiser pages,
  // sign-in) lose it on a root 404, so give them the full Yuyu site chrome.
  return (
    <>
      <SiteHeader />
      <main id="main-content" tabIndex={-1} className="flex-1 focus:outline-none">
        {content}
      </main>
      <SiteFooter />
    </>
  );
}
