"use client";

import { forwardRef, type ComponentPropsWithoutRef, type ElementRef, type ReactNode } from "react";
import * as SelectPrimitive from "@radix-ui/react-select";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";
import { controlClasses } from "./styles";

/**
 * Custom select for rich options (descriptions, grouped items). Prefer
 * `NativeSelect` for plain lists; it keeps native mobile pickers.
 */
export const Select = SelectPrimitive.Root;
export const SelectGroup = SelectPrimitive.Group;
export const SelectValue = SelectPrimitive.Value;

export const SelectTrigger = forwardRef<ElementRef<typeof SelectPrimitive.Trigger>, ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger>>(function SelectTrigger(
  { className, children, ...props },
  ref,
) {
  return (
    <SelectPrimitive.Trigger ref={ref} className={cn(controlClasses, "flex items-center justify-between gap-2 text-left data-[placeholder]:text-ink-disabled", className)} {...props}>
      <span className="min-w-0 truncate">{children}</span>
      <SelectPrimitive.Icon asChild>
        <ChevronDown aria-hidden className="size-[18px] shrink-0 text-ink-muted" />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  );
});

export const SelectContent = forwardRef<ElementRef<typeof SelectPrimitive.Content>, ComponentPropsWithoutRef<typeof SelectPrimitive.Content>>(function SelectContent(
  { className, children, position = "popper", ...props },
  ref,
) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        ref={ref}
        position={position}
        sideOffset={6}
        className={cn("z-50 max-h-[min(420px,var(--radix-select-content-available-height))] min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-lg border border-line bg-canvas text-ink shadow-float", className)}
        {...props}
      >
        <SelectPrimitive.Viewport className="p-1.5">{children}</SelectPrimitive.Viewport>
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  );
});

export const SelectItem = forwardRef<
  ElementRef<typeof SelectPrimitive.Item>,
  ComponentPropsWithoutRef<typeof SelectPrimitive.Item> & { description?: ReactNode }
>(function SelectItem({ className, children, description, ...props }, ref) {
  return (
    <SelectPrimitive.Item
      ref={ref}
      className={cn("relative flex min-h-10 cursor-pointer select-none items-start gap-2 rounded-md py-2 pl-3 pr-9 text-body-ui outline-none data-[disabled]:pointer-events-none data-[disabled]:text-ink-disabled data-[highlighted]:bg-emphasis", className)}
      {...props}
    >
      <span className="min-w-0">
        <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
        {description ? <span className="block text-caption text-ink-muted">{description}</span> : null}
      </span>
      <SelectPrimitive.ItemIndicator className="absolute right-3 top-2.5">
        <Check aria-hidden className="size-4" />
      </SelectPrimitive.ItemIndicator>
    </SelectPrimitive.Item>
  );
});

export function SelectLabel({ children }: { children: ReactNode }) {
  return <SelectPrimitive.Label className="px-3 pb-1 pt-2 text-overline text-ink-muted">{children}</SelectPrimitive.Label>;
}

export function SelectSeparator() {
  return <SelectPrimitive.Separator className="my-1.5 h-px bg-line" />;
}
