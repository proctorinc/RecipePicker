"use client";

import Link from "next/link";
import { GalleryVerticalEnd, Settings2, Sparkles, Star } from "lucide-react";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

const items = [
  {
    href: "/history",
    label: "History",
    icon: Star,
    matches: (pathname: string) => pathname.startsWith("/history"),
  },
  {
    href: "/",
    label: "Feed",
    icon: GalleryVerticalEnd,
    matches: (pathname: string) => pathname === "/",
  },
  {
    href: "/picker",
    label: "AI Picker",
    icon: Sparkles,
    matches: (pathname: string) => pathname.startsWith("/picker"),
  },
  {
    href: "/settings",
    label: "Settings",
    icon: Settings2,
    matches: (pathname: string) => pathname.startsWith("/settings"),
  },
];

export function MobileNav() {
  const pathname = usePathname();

  return (
    <nav className="pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+0.75rem)] z-40 px-4 md:hidden">
      <div className="mx-auto flex w-full max-w-xs items-center justify-between gap-2 rounded-full border border-white/75 bg-background/90 p-2 shadow-[0_18px_40px_rgba(73,49,31,0.14)] backdrop-blur-xl">
        {items.map((item) => {
          const isActive = item.matches(pathname);
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive ? "page" : undefined}
              aria-label={item.label}
              title={item.label}
              className={cn(
                "pointer-events-auto flex h-14 w-14 items-center justify-center rounded-full text-muted-foreground transition",
                isActive
                  ? "bg-primary/95 text-primary-foreground shadow-sm"
                  : "bg-white/55 hover:bg-secondary/80 hover:text-foreground",
              )}
            >
              <span
                className={cn(
                  "flex h-12 w-12 shrink-0 items-center justify-center rounded-full transition",
                  isActive
                    ? "border-white/20 bg-white/10"
                    : "border-border/70 bg-white/75",
                )}
              >
                <Icon className="h-6 w-6" />
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
