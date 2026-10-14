"use client";

import { useEffect, useRef, useState, type PointerEvent } from "react";
import { motion, useMotionValue, useReducedMotion, useSpring, type Variants } from "framer-motion";
import { useRouter } from "next/navigation";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Compass, SearchX, Sparkles } from "lucide-react";
import { chromeFor } from "@/components/chrome/ChromeSwitch";
import { YuyuWordmark } from "@/components/chrome/SiteHeader";
import { Button } from "@/components/ui/button";

const cardVariants: Variants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.32, ease: "easeOut" } },
};

const contentVariants: Variants = {
  hidden: { opacity: 0, y: 12 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.28, ease: "easeOut" },
  },
};

function CursorEyes({ prefersReducedMotion }: { prefersReducedMotion: boolean | null }) {
  const eyesRef = useRef<HTMLDivElement>(null);
  const [blinking, setBlinking] = useState(false);
  const gazeX = useMotionValue(0);
  const gazeY = useMotionValue(0);
  const pupilX = useSpring(gazeX, { stiffness: 260, damping: 20, mass: 0.35 });
  const pupilY = useSpring(gazeY, { stiffness: 260, damping: 20, mass: 0.35 });

  useEffect(() => {
    const followCursor = (event: globalThis.PointerEvent) => {
      if (event.pointerType !== "mouse" || !eyesRef.current) return;
      const bounds = eyesRef.current.getBoundingClientRect();
      const deltaX = event.clientX - (bounds.left + bounds.width / 2);
      const deltaY = event.clientY - (bounds.top + bounds.height / 2);
      const distance = Math.hypot(deltaX, deltaY) || 1;
      const amount = Math.min(17, distance / 8);
      gazeX.set((deltaX / distance) * amount);
      gazeY.set((deltaY / distance) * amount);
    };

    window.addEventListener("pointermove", followCursor);
    return () => window.removeEventListener("pointermove", followCursor);
  }, [gazeX, gazeY]);

  useEffect(() => {
    if (prefersReducedMotion) return;
    let blinkStart: number | undefined;
    let blinkEnd: number | undefined;

    const scheduleBlink = () => {
      blinkStart = window.setTimeout(() => {
        setBlinking(true);
        blinkEnd = window.setTimeout(() => {
          setBlinking(false);
          scheduleBlink();
        }, 130);
      }, 3_600 + Math.random() * 3_400);
    };

    scheduleBlink();
    return () => {
      if (blinkStart) window.clearTimeout(blinkStart);
      if (blinkEnd) window.clearTimeout(blinkEnd);
    };
  }, [prefersReducedMotion]);

  return (
    <div ref={eyesRef} aria-hidden className="hidden justify-center gap-5 pt-0.5 opacity-95 md:flex">
      {[0, 1].map((eye) => (
        <div key={eye} className="relative h-32 w-[98px]">
          <div
            className="absolute left-1/2 top-2 h-[26px] w-[72px] rounded-t-[50%] border-t-[7px] border-ink"
            style={{ transform: `translateX(-50%) rotate(${eye === 0 ? "-4deg" : "4deg"})` }}
          />
          <motion.div
            animate={prefersReducedMotion ? undefined : { scaleY: blinking ? 0.07 : 1 }}
            transition={{ duration: 0.09, ease: "easeInOut" }}
            style={{ position: "absolute", insetInline: 0, top: 35, display: "grid", placeItems: "center", transformOrigin: "center" }}
          >
            <div className="grid size-[90px] place-items-center overflow-hidden rounded-full border-[6px] border-ink bg-canvas shadow-raised">
              <motion.div style={{ x: pupilX, y: pupilY }}>
                <div className="relative size-[33px] rounded-full bg-ink">
                  <div className="absolute left-1.5 top-[5px] size-[7px] rounded-full bg-canvas opacity-90" />
                </div>
              </motion.div>
            </div>
          </motion.div>
        </div>
      ))}
    </div>
  );
}

export function NotFoundExperience() {
  const router = useRouter();
  const pathname = usePathname() ?? "/";
  // Routes whose layout renders its own chrome lose it on a root 404, so add a minimal header there.
  const needsChrome = chromeFor(pathname) === "own";
  const prefersReducedMotion = useReducedMotion();
  const pointerX = useMotionValue(0);
  const pointerY = useMotionValue(0);
  const iconX = useSpring(pointerX, { stiffness: 260, damping: 18, mass: 0.45 });
  const iconY = useSpring(pointerY, { stiffness: 260, damping: 18, mass: 0.45 });

  const resetPointer = () => {
    pointerX.set(0);
    pointerY.set(0);
  };

  const followPointer = (event: PointerEvent<HTMLDivElement>) => {
    if (prefersReducedMotion || event.pointerType !== "mouse") return;
    const bounds = event.currentTarget.getBoundingClientRect();
    pointerX.set(Math.max(-6, Math.min(6, (event.clientX - bounds.left - bounds.width / 2) / 8)));
    pointerY.set(Math.max(-6, Math.min(6, (event.clientY - bounds.top - bounds.height / 2) / 8)));
  };

  const goBackOrHome = () => {
    try {
      const hasSameOriginReferrer = document.referrer
        && new URL(document.referrer).origin === window.location.origin;
      if (hasSameOriginReferrer && window.history.length > 1) {
        router.back();
        return;
      }
    } catch {
      // A malformed referrer is treated like an unknown navigation source.
    }
    router.push("/");
  };

  const content = (
    <motion.div
      initial={prefersReducedMotion ? false : "hidden"}
      animate="visible"
      variants={cardVariants}
      className="px-4"
    >
      <div className="relative mx-auto mb-2 mt-8 max-w-[680px] overflow-hidden rounded-[28px] border border-line bg-gradient-to-br from-tint-lavender via-canvas to-tint-mint px-6 py-10 text-center sm:mt-16 sm:px-12 sm:py-12">
        <p aria-hidden className="pointer-events-none absolute left-1/2 top-4 -translate-x-1/2 select-none font-display text-[8rem] font-extrabold leading-[0.85] tracking-[-0.08em] text-ink opacity-[0.04] sm:top-1 sm:text-[12rem]">
          404
        </p>
        <div className="relative flex flex-col items-center gap-5">
          <motion.div variants={contentVariants}>
            <div aria-hidden onPointerMove={followPointer} onPointerLeave={resetPointer} className="relative grid size-[116px] touch-manipulation place-items-center">
              <motion.div
                className="absolute inset-1 rounded-full border border-dashed border-line-strong"
                animate={prefersReducedMotion ? undefined : { rotate: 360 }}
                transition={prefersReducedMotion ? undefined : { duration: 16, repeat: Infinity, ease: "linear" }}
              />
              <motion.div
                className="absolute right-[18px] top-px text-brand-mint"
                animate={prefersReducedMotion ? undefined : { y: [0, -5, 0], rotate: [0, 12, 0], opacity: [0.65, 1, 0.65] }}
                transition={prefersReducedMotion ? undefined : { duration: 2.8, repeat: Infinity, ease: "easeInOut" }}
              >
                <Sparkles className="size-5" />
              </motion.div>
              <motion.div
                className="absolute bottom-[3px] left-[13px] text-brand-lavender"
                animate={prefersReducedMotion ? undefined : { y: [0, 4, 0], scale: [0.85, 1.15, 0.85], opacity: [0.55, 1, 0.55] }}
                transition={prefersReducedMotion ? undefined : { duration: 2.3, repeat: Infinity, ease: "easeInOut", delay: 0.3 }}
              >
                <Sparkles className="size-[15px]" />
              </motion.div>
              <motion.div
                animate={prefersReducedMotion ? undefined : { y: [0, -3, 0] }}
                transition={prefersReducedMotion ? undefined : { duration: 3.2, repeat: Infinity, ease: "easeInOut" }}
              >
                <motion.div style={{ x: iconX, y: iconY }}>
                  <div className="grid size-[76px] place-items-center rounded-[28px] border border-line bg-canvas shadow-raised">
                    <SearchX className="size-9 text-ink" />
                  </div>
                </motion.div>
              </motion.div>
            </div>
          </motion.div>
          <motion.div variants={contentVariants}>
            <div className="flex flex-col gap-2">
              <h1 className="text-display-m text-ink">Page not found</h1>
              <p className="mx-auto max-w-[410px] text-body-ui text-ink-secondary">This corner of Yuyu seems to have wandered off. The page may have moved or expired.</p>
            </div>
          </motion.div>
          <motion.div variants={contentVariants} className="w-full sm:w-auto">
            <div className="flex flex-col gap-2.5 sm:flex-row">
              <motion.div whileHover={prefersReducedMotion ? undefined : { y: -2 }} whileTap={prefersReducedMotion ? undefined : { scale: 0.98 }}>
                <Button onClick={goBackOrHome} variant="primary" size="lg" startIcon={<ArrowLeft />} className="w-full sm:min-w-[150px]">Go back</Button>
              </motion.div>
              <motion.div whileHover={prefersReducedMotion ? undefined : { y: -2 }} whileTap={prefersReducedMotion ? undefined : { scale: 0.98 }}>
                <Button asChild variant="secondary" size="lg" className="w-full sm:min-w-[150px]">
                  <Link href="/discover">
                    <Compass aria-hidden className="size-[18px]" />
                    Discover events
                  </Link>
                </Button>
              </motion.div>
            </div>
          </motion.div>
        </div>
      </div>
      <CursorEyes prefersReducedMotion={prefersReducedMotion} />
    </motion.div>
  );

  if (!needsChrome) return content;
  return (
    <>
      <header className="px-4 py-5 sm:px-8">
        <YuyuWordmark />
      </header>
      <main id="main-content" tabIndex={-1} className="flex-1 pb-16 focus:outline-none">
        {content}
      </main>
    </>
  );
}
