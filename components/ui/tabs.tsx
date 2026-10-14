"use client";

import { forwardRef, type ComponentPropsWithoutRef, type ElementRef, type ReactNode } from "react";
import Link from "next/link";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import * as AccordionPrimitive from "@radix-ui/react-accordion";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";

/* ---------- Underline tabs (docs/DESIGN.md §4.4) ---------- */

export const Tabs = TabsPrimitive.Root;

const tabListClasses = "flex gap-1 overflow-x-auto border-b border-line [scrollbar-width:none] [&::-webkit-scrollbar]:hidden";
const tabClasses =
  "relative inline-flex min-h-11 shrink-0 items-center gap-1.5 whitespace-nowrap px-3 text-[15px] font-semibold text-ink-muted transition-colors duration-[180ms] ease-yy hover:text-ink after:absolute after:inset-x-3 after:-bottom-px after:h-0.5 after:rounded-full after:bg-transparent [&_svg]:size-4";

export const TabsList = forwardRef<ElementRef<typeof TabsPrimitive.List>, ComponentPropsWithoutRef<typeof TabsPrimitive.List>>(function TabsList(
  { className, ...props },
  ref,
) {
  return <TabsPrimitive.List ref={ref} className={cn(tabListClasses, className)} {...props} />;
});

export const TabsTrigger = forwardRef<
  ElementRef<typeof TabsPrimitive.Trigger>,
  ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger> & { accent?: boolean }
>(function TabsTrigger({ className, accent, ...props }, ref) {
  return (
    <TabsPrimitive.Trigger
      ref={ref}
      className={cn(tabClasses, "data-[state=active]:text-ink", accent ? "data-[state=active]:after:bg-accent" : "data-[state=active]:after:bg-primary", className)}
      {...props}
    />
  );
});

export const TabsContent = forwardRef<ElementRef<typeof TabsPrimitive.Content>, ComponentPropsWithoutRef<typeof TabsPrimitive.Content>>(function TabsContent(
  { className, ...props },
  ref,
) {
  return <TabsPrimitive.Content ref={ref} className={cn("pt-6 focus-visible:outline-none", className)} {...props} />;
});

/** Link-based underline tabs for navigation between routes. */
export function NavTabs({ items, label, className }: { items: Array<{ href: string; label: ReactNode; active: boolean }>; label: string; className?: string }) {
  return (
    <nav aria-label={label} className={cn(tabListClasses, className)}>
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          aria-current={item.active ? "page" : undefined}
          className={cn(tabClasses, item.active && "text-ink after:bg-primary")}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}

/* ---------- Accordion ---------- */

export const Accordion = AccordionPrimitive.Root;

export function AccordionItem({ value, title, children, className }: { value: string; title: ReactNode; children: ReactNode; className?: string }) {
  return (
    <AccordionPrimitive.Item value={value} className={cn("border-b border-line", className)}>
      <AccordionPrimitive.Header>
        <AccordionPrimitive.Trigger className="group flex w-full items-center justify-between gap-4 py-4 text-left text-[17px] font-semibold text-ink">
          {title}
          <ChevronDown aria-hidden className="size-5 shrink-0 text-ink-muted transition-transform duration-[180ms] group-data-[state=open]:rotate-180" />
        </AccordionPrimitive.Trigger>
      </AccordionPrimitive.Header>
      <AccordionPrimitive.Content className="pb-4 text-body text-ink-secondary">{children}</AccordionPrimitive.Content>
    </AccordionPrimitive.Item>
  );
}
