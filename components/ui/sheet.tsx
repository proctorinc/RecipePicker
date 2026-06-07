"use client";

import type * as React from "react";
import { X } from "lucide-react";

import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export const Sheet = Dialog;
export const SheetTrigger = DialogTrigger;
export const SheetClose = DialogClose;
export const SheetTitle = DialogTitle;
export const SheetDescription = DialogDescription;

export function SheetContent({
  side = "right",
  className,
  children,
  ...props
}: React.ComponentProps<typeof DialogContent> & {
  side?: "left" | "right";
}) {
  return (
    <DialogContent
      className={cn(
        "!top-0 !bottom-0 !h-dvh !max-h-none !w-[min(88vw,24rem)] !translate-x-0 !translate-y-0 !rounded-none !border-border !bg-background px-6 py-8 shadow-2xl",
        side === "right" ? "!left-auto !right-0 border-l" : "!left-0 !right-auto border-r",
        className,
      )}
      {...props}
    >
      {children}
      <DialogClose className="absolute right-4 top-4 rounded-full p-2 text-muted-foreground transition hover:bg-muted">
        <X className="h-4 w-4" />
        <span className="sr-only">Close</span>
      </DialogClose>
    </DialogContent>
  );
}

export function SheetHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <DialogHeader className={cn("pr-10", className)} {...props} />;
}
