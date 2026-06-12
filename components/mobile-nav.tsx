"use client";

import {
  Calendar,
  LayoutDashboard,
  Settings2,
  Sparkles,
} from "lucide-react";
import { usePathname } from "next/navigation";

import { AppTransitionLink } from "@/components/app-transition-link";
import { cn } from "@/lib/utils";

const navItems = [
  {
    href: "/history",
    label: "History",
    icon: Calendar,
    matches: (pathname: string) => pathname.startsWith("/history"),
  },
  {
    href: "/",
    label: "Feed",
    icon: LayoutDashboard,
    matches: (pathname: string) => pathname === "/",
  },
  {
    href: "/settings",
    label: "Settings",
    icon: Settings2,
    matches: (pathname: string) => pathname.startsWith("/settings"),
  },
];

export function MobileNav({
  showAiPicker = false,
}: {
  showAiPicker?: boolean;
}) {
  const pathname = usePathname();
  // const navItems = showAiPicker
  //   ? [
  //       items[0],
  //       items[1],
  //       {
  //         href: "/picker",
  //         label: "AI Picker",
  //         icon: Sparkles,
  //         matches: (currentPath: string) => currentPath.startsWith("/picker"),
  //       },
  //       items[2],
  //     ]
  //   : items;

  return (
    <nav className="pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+0.75rem)] z-40 px-4 md:hidden">
      <div className="mx-auto flex w-full max-w-xs items-center justify-between gap-2 rounded-full border border-white/75 bg-background/90 p-2 shadow-[0_18px_40px_rgba(73,49,31,0.14)] backdrop-blur-xl">
        {navItems.map((item) => {
          const isActive = item.matches(pathname);
          const Icon = item.icon;

          return (
            <AppTransitionLink
              key={item.href}
              href={item.href}
              prefetch
              aria-current={isActive ? "page" : undefined}
              aria-label={item.label}
              title={item.label}
              className={cn(
                "pointer-events-auto flex h-12 w-12 items-center justify-center rounded-full text-muted-foreground transition",
                isActive
                  ? "bg-primary/95 text-primary-foreground shadow-sm"
                  : "bg-white/55 hover:bg-secondary/80 hover:text-foreground",
              )}
            >
              <span
                className={cn(
                  "flex shrink-0 h-12 w-12 items-center justify-center rounded-full transition",
                  isActive
                    ? "border-white/20 bg-white/10"
                    : "border-border/70 bg-white/75",
                )}
              >
                <Icon className="h-6 w-6" />
              </span>
            </AppTransitionLink>
          );
        })}
      </div>
    </nav>
  );
}
