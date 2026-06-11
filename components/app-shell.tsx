import type { ReactNode } from "react";
import Link from "next/link";
import {
  Sparkles,
  Soup,
  Calendar,
  Settings2,
  LayoutDashboard,
} from "lucide-react";
import { UserButton } from "@clerk/nextjs";

import { Button } from "@/components/ui/button";
import { MobileNav } from "@/components/mobile-nav";
import { getCurrentUserAccess } from "@/lib/server/access";
import { requireHouseholdContext } from "@/lib/server/auth";
import { cn } from "@/lib/utils";

const baseLinks = [
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
  title,
  description,
  showUserButton = false,
  contentClassName,
}: {
  children: ReactNode;
  title?: string;
  description?: string;
  showUserButton?: boolean;
  contentClassName?: string;
}) {
  const [household, access] = await Promise.all([
    requireHouseholdContext(),
    getCurrentUserAccess(),
  ]);
  const links = access.isAdmin
    ? [
        baseLinks[0],
        {
          href: "/picker",
          label: "AI Picker",
          icon: Sparkles,
          matches: (pathname: string) => pathname.startsWith("/picker"),
        },
        baseLinks[1],
        baseLinks[2],
      ]
    : baseLinks;

  return (
    <div className="min-h-screen bg-grain pb-16">
      <header className="sticky top-0 z-40 border-b border-white/50 bg-background/75 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <Link href="/" className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm">
              <Soup className="h-5 w-5" />
            </div>
            <div>
              <p className="font-[family-name:var(--font-serif)] text-lg font-semibold">
                Recipe Picker
              </p>
              <p className="text-xs text-muted-foreground">
                {household.householdName}
              </p>
            </div>
          </Link>

          <nav className="hidden items-center gap-2 md:flex">
            {links.map((link) => (
              <Button
                key={link.href}
                asChild
                variant="ghost"
                className="bg-transparent"
              >
                <Link href={link.href} className="flex items-center gap-2">
                  {"icon" in link && link.icon ? (
                    <link.icon className="h-4 w-4" />
                  ) : null}
                  {link.label}
                </Link>
              </Button>
            ))}
          </nav>

          {showUserButton ? (
            <div className="flex gap-2">
              <UserButton
                appearance={{
                  elements: {
                    userButtonAvatarBox: "w-10 h-10",
                  },
                }}
              />
            </div>
          ) : null}
        </div>
      </header>

      <main
        className={cn(
          "mx-auto flex max-w-4xl flex-col gap-8 px-2 py-4 pb-24 sm:px-6 md:pb-4 lg:px-8",
          contentClassName,
        )}
      >
        {(title || description) && (
          <section className="space-y-3">
            {title && (
              <h1 className="max-w-4xl font-[family-name:var(--font-serif)] text-4xl font-semibold tracking-tight sm:text-5xl">
                {title}
              </h1>
            )}
            {description && (
              <p className="max-w-2xl text-sm text-muted-foreground sm:text-base">
                {description}
              </p>
            )}
          </section>
        )}
        {children}
      </main>
      <MobileNav showAiPicker={access.isAdmin} />
    </div>
  );
}
