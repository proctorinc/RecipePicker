import type { ReactNode } from "react";
import {
  Sparkles,
  Calendar,
  ShoppingCart,
  Settings2,
  LayoutDashboard,
  Plus,
  Tag,
} from "lucide-react";

import { AppShellProgress } from "@/components/app-route-transition";
import { AppShellUserButton } from "@/components/app-shell-user-button";
import { AppTransitionLink } from "@/components/app-transition-link";
import { MobileAwareAppHeader } from "@/components/mobile-aware-app-header";
import { RecipeHeaderBackButton, RecipeHeaderBackButtonProvider } from "@/components/recipe-header-back-button";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { MobileNav } from "@/components/mobile-nav";
import { KitchenSummaryMenu } from "@/components/kitchen-summary-menu";
import type { HouseholdCookRatingView } from "@/types/view-models";

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
    href: "/tags",
    label: "Tags",
    icon: Tag,
    matches: (pathname: string) => pathname.startsWith("/tags"),
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
  householdLogoUrl,
  cooks,
  topContent,
  showAiPicker = false,
  showSettings = true,
  mobileProfileLinksToSettings = false,
}: {
  children: ReactNode;
  householdName: string;
  householdLogoUrl: string | null;
  cooks: HouseholdCookRatingView[];
  topContent?: ReactNode;
  showAiPicker?: boolean;
  showSettings?: boolean;
  mobileProfileLinksToSettings?: boolean;
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
    <RecipeHeaderBackButtonProvider>
      <div className="min-h-screen bg-grain pb-16">
        <MobileAwareAppHeader
          mobileLogo={
            <KitchenSummaryMenu
              householdName={householdName}
              householdLogoUrl={householdLogoUrl}
              cooks={cooks}
              size="small"
            />
          }
        >
        <AppShellProgress />
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-1">
            <RecipeHeaderBackButton />
            <KitchenSummaryMenu
              householdName={householdName}
              householdLogoUrl={householdLogoUrl}
              cooks={cooks}
              size="large"
            />
          </div>

          <nav className="hidden items-center gap-2 md:flex">
            <Button asChild className="rounded-full">
              <AppTransitionLink
                href="/recipe/new"
                prefetch
                className="flex items-center gap-2"
              >
                <Icon icon={Plus} size="sm" />
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
                    <Icon icon={link.icon} size="sm" />
                  ) : null}
                  {link.label}
                </AppTransitionLink>
              </Button>
            ))}
          </nav>

          <AppShellUserButton />
        </div>
        </MobileAwareAppHeader>

        <main className="mx-auto flex w-full max-w-7xl flex-col px-2 pb-24 pt-12 sm:px-6 md:pb-4 md:pt-[5.75rem] lg:px-8">
        {topContent ? (
          <div className="w-screen self-center">{topContent}</div>
        ) : null}
        <div className="flex flex-col gap-8">{children}</div>
        </main>
        <MobileNav
          showAiPicker={showAiPicker}
          profileLinksToSettings={mobileProfileLinksToSettings}
        />
      </div>
    </RecipeHeaderBackButtonProvider>
  );
}
