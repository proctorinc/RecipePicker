import type { ReactNode } from "react";
import {
  Sparkles,
  Soup,
  Calendar,
  ShoppingCart,
  Settings2,
  LayoutDashboard,
  Plus,
} from "lucide-react";

import { AppShellProgress } from "@/components/app-route-transition";
import { AppShellUserButton } from "@/components/app-shell-user-button";
import { AppTransitionLink } from "@/components/app-transition-link";
import { Button } from "@/components/ui/button";
import { MobileNav } from "@/components/mobile-nav";

const baseLinks = [
  {
    href: "/shopping-cart",
    label: "Shopping cart",
    icon: ShoppingCart,
    matches: (pathname: string) => pathname.startsWith("/shopping-cart"),
  },
  {
    href: "/history",
    label: "History",
    icon: Calendar,
    matches: (pathname: string) => pathname.startsWith("/history"),
  },
  {
    href: "/",
    label: "Recipes",
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

export async function AppShell({
  children,
  householdName,
  showAiPicker = false,
  showSettings = true,
}: {
  children: ReactNode;
  householdName: string;
  showAiPicker?: boolean;
  showSettings?: boolean;
}) {
  const visibleBaseLinks = showSettings
    ? baseLinks
    : baseLinks.filter((link) => link.href !== "/settings");
  const links = showAiPicker
    ? [
        visibleBaseLinks[0],
        {
          href: "/picker",
          label: "AI Picker",
          icon: Sparkles,
          matches: (pathname: string) => pathname.startsWith("/picker"),
        },
        ...visibleBaseLinks.slice(1),
      ]
    : visibleBaseLinks;

  return (
    <div className="min-h-screen bg-grain pb-16">
      <header className="sticky top-0 z-40 border-b border-white/50 bg-background/75 backdrop-blur-xl">
        <AppShellProgress />
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <AppTransitionLink
            href="/"
            prefetch
            className="flex items-center gap-3"
            pendingClassName="opacity-80"
          >
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm">
              <Soup className="h-5 w-5" />
            </div>
            <div>
              <p className="font-[family-name:var(--font-serif)] text-lg font-semibold">
                Recipe Picker
              </p>
              <p className="text-xs text-muted-foreground">{householdName}</p>
            </div>
          </AppTransitionLink>

          <nav className="hidden items-center gap-2 md:flex">
            <Button asChild className="rounded-full">
              <AppTransitionLink href="/recipe/new" prefetch className="flex items-center gap-2">
                <Plus className="h-4 w-4" />
                Create recipe
              </AppTransitionLink>
            </Button>
            {links.map((link) => (
              <Button
                key={link.href}
                asChild
                variant="ghost"
                className="bg-transparent"
              >
                <AppTransitionLink
                  href={link.href}
                  prefetch
                  className="flex items-center gap-2"
                  pendingClassName="opacity-60"
                >
                  {"icon" in link && link.icon ? (
                    <link.icon className="h-4 w-4" />
                  ) : null}
                  {link.label}
                </AppTransitionLink>
              </Button>
            ))}
          </nav>

          <AppShellUserButton />
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-2 py-4 pb-24 sm:px-6 md:pb-4 lg:px-8">
        {children}
      </main>
      <MobileNav showAiPicker={showAiPicker} showSettings={showSettings} />
    </div>
  );
}
