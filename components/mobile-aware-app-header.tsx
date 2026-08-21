"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

export function MobileAwareAppHeader({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isSettingsPage = pathname.startsWith("/settings");

  return (
    <header
      className={cn(
        "sticky top-0 z-40 border-b border-white/50 bg-background/75 backdrop-blur-xl",
        isSettingsPage ? "block" : "hidden md:block",
      )}
    >
      {children}
    </header>
  );
}
