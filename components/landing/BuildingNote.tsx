"use client";

import { useState, type ReactNode } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { useReducedMotion } from "framer-motion";
import { Mail, X } from "lucide-react";
import { IconButton } from "@/components/ui/button";
import { LetterOpening } from "./LetterOpening";

/**
 * "From RForum to Yuyu" building note, opened from the home page. The
 * envelope animation is skipped when reduced motion is preferred.
 */
export function BuildingNote({ children, className }: { children: ReactNode; className?: string }) {
  const prefersReducedMotion = useReducedMotion();
  const [open, setOpen] = useState(false);
  const [opened, setOpened] = useState(false);
  const showLetter = prefersReducedMotion || opened;

  return (
    <>
      <button
        type="button"
        className={className}
        onClick={() => {
          setOpened(false);
          setOpen(true);
        }}
      >
        {children}
      </button>
      <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-[rgba(17,17,19,0.6)] backdrop-blur-sm" />
          <DialogPrimitive.Content
            aria-describedby={undefined}
            className="fixed left-1/2 top-1/2 z-50 max-h-[calc(100dvh-24px)] w-[min(760px,calc(100vw-24px))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl bg-tint-peach shadow-float focus:outline-none"
          >
            <DialogPrimitive.Title className="sr-only">A building note: From RForum to Yuyu</DialogPrimitive.Title>
            <DialogPrimitive.Close asChild>
              <IconButton label="Close building note" variant="secondary" size="sm" className="absolute right-3 top-3 z-10">
                <X />
              </IconButton>
            </DialogPrimitive.Close>
            {showLetter ? (
              <article className="m-3 rounded-lg bg-canvas p-6 text-ink sm:m-4 sm:p-10">
                <p className="flex items-center gap-2 text-overline text-success-fg">
                  <Mail aria-hidden className="size-4" />
                  A building note
                </p>
                <h2 className="mt-3 text-h2">From RForum to Yuyu</h2>
                <div className="mt-5 flex flex-col gap-4 text-body-l text-ink-secondary">
                  <p>Last year, at the T4GC Summit, we built <strong className="text-ink">RForum</strong>.</p>
                  <p>The idea was simple: how can we make an event feel more engaging for the people attending it?</p>
                  <p>RForum became an open-source platform focused on attendee engagement—a space for conversations, participation, and interaction within an event.</p>
                  <p>But after the summit, another question stayed with us: <strong className="text-ink">what if we could build something that helped run the entire event?</strong> Not just engagement. Everything.</p>
                  <p>That question eventually became <strong className="text-ink">Yuyu</strong>.</p>
                  <p>This year, I started building Yuyu as the next piece of the event ecosystem we began with RForum—but with a much larger scope.</p>
                  <ul className="flex list-disc flex-col gap-1 pl-6 marker:text-success-fg">
                    <li>Registration and free tickets</li>
                    <li>Attendee management</li>
                    <li>Event schedules and sessions</li>
                    <li>On-ground check-in</li>
                    <li>Managing the event experience</li>
                    <li>Post-event feedback</li>
                  </ul>
                  <p>The goal wasn&apos;t to build another ticketing platform. It was to build an <strong className="text-ink">open-source event management suite that supports the complete lifecycle of an event—before, during, and after it happens.</strong></p>
                  <p>RForum started with one part of the event experience. Yuyu is our attempt to connect the rest of it.</p>
                  <p>And that&apos;s what I like most about how it came together:</p>
                  <p className="border-l-[3px] border-success-fg pl-4 font-semibold text-ink">
                    One summit.<br />One problem.<br />One open-source project.<br />And then the question: what should we build next?
                  </p>
                  <p className="font-semibold text-ink">That question became Yuyu.</p>
                </div>
              </article>
            ) : (
              <LetterOpening onOpened={() => setOpened(true)} />
            )}
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </>
  );
}
