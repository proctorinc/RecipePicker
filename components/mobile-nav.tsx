"use client";

import {
  Calendar,
  ShoppingCart,
  LayoutDashboard,
  Sparkles,
  Tags,
  Blocks,
  Layers,
} from "lucide-react";
import { usePathname } from "next/navigation";

import { AppTransitionLink } from "@/components/app-transition-link";
import { MobileProfileButton } from "@/components/mobile-profile-button";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";

const navItems = [
  {
    href: "/shopping-cart",
    label: "Shopping cart",
    icon: ShoppingCart,
    matches: (pathname: string) => pathname.startsWith("/shopping-cart"),
  },
  {
    href: "/tags",
    label: "Tags",
    icon: Layers,
    matches: (pathname: string) => pathname.startsWith("/tags"),
  },
  {
    href: "/",
    label: "Feed",
    icon: LayoutDashboard,
    matches: (pathname: string) => pathname === "/",
  },
  {
    href: "/history",
    label: "History",
    icon: Calendar,
    matches: (pathname: string) => pathname.startsWith("/history"),
  },
];

export function MobileNav({
  showAiPicker = false,
  profileLinksToSettings = false,
}: {
  showAiPicker?: boolean;
  profileLinksToSettings?: boolean;
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
      <div className="mx-auto flex w-full max-w-sm items-center justify-between gap-2 rounded-full bg-background/65 p-2 shadow-[0_18px_40px_rgba(73,49,31,0.14)] backdrop-blur-sm">
        {navItems.map((item) => {
          const isActive = item.matches(pathname);
          const NavIcon = item.icon;

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
                <Icon icon={NavIcon} size="lg" />
              </span>
            </AppTransitionLink>
          );
        })}
        <MobileProfileButton linksToSettings={profileLinksToSettings} />
      </div>
    </nav>
  );
}
