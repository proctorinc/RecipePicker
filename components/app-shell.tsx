import type { ReactNode } from "react";
import {
  Sparkles,
  Soup,
  Calendar,
  ShoppingCart,
  Settings2,
  LayoutDashboard,
  Plus,
  Tags,
} from "lucide-react";

import { AppShellProgress } from "@/components/app-route-transition";
import { AppShellUserButton } from "@/components/app-shell-user-button";
import { AppTransitionLink } from "@/components/app-transition-link";
import { MobileAwareAppHeader } from "@/components/mobile-aware-app-header";
import { RecipeHeaderBackButton } from "@/components/recipe-header-back-button";
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
    href: "/tags",
    label: "Tags",
    icon: Tags,
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
  topContent,
  showAiPicker = false,
  showSettings = true,
  mobileProfileLinksToSettings = false,
}: {
  children: ReactNode;
  householdName: string;
  householdLogoUrl: string | null;
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
    <div className="min-h-screen bg-grain pb-16">
      <MobileAwareAppHeader
        mobileLogo={
          <AppTransitionLink
            href="/"
            prefetch
            aria-label={`${householdName} home`}
            className="flex items-center gap-1 justify-center font-[family-name:var(--font-serif)]"
            pendingClassName="opacity-80"
          >
            <KitchenLogo logoUrl={householdLogoUrl} size="small" />
            {householdName}
          </AppTransitionLink>
        }
      >
        <AppShellProgress />
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-1">
            <RecipeHeaderBackButton />
            <AppTransitionLink
              href="/"
              prefetch
              className="flex items-center gap-3"
              pendingClassName="opacity-80"
            >
              <KitchenLogo logoUrl={householdLogoUrl} size="large" />
              <p className="font-[family-name:var(--font-serif)] text-lg font-semibold">
                {householdName}
              </p>
            </AppTransitionLink>
          </div>

          <nav className="hidden items-center gap-2 md:flex">
            <Button asChild className="rounded-full">
              <AppTransitionLink
                href="/recipe/new"
                prefetch
                className="flex items-center gap-2"
              >
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
      </MobileAwareAppHeader>

      <main className="mx-auto flex w-full max-w-7xl flex-col px-2 pb-24 pt-16 sm:px-6 md:pb-4 md:pt-[5.75rem] lg:px-8">
        {topContent ? <div className="w-screen self-center">{topContent}</div> : null}
        <div className="flex flex-col gap-8">
          {children}
        </div>
      </main>
      <MobileNav
        showAiPicker={showAiPicker}
        profileLinksToSettings={mobileProfileLinksToSettings}
      />
    </div>
  );
}

function KitchenLogo({ logoUrl, size }: { logoUrl: string | null; size: "small" | "large" }) {
  const dimensions = size === "small" ? "h-6 w-6" : "h-11 w-11";
  const iconDimensions = size === "small" ? "h-3 w-3" : "h-5 w-5";

  return logoUrl ? (
    // The uploaded image comes from the kitchen's trusted Blob URL.
    // eslint-disable-next-line @next/next/no-img-element
    <img src={logoUrl} alt="" className={`${dimensions} rounded-full object-cover shadow-sm`} />
  ) : (
    <div className={`flex ${dimensions} items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm`}>
      <Soup className={iconDimensions} />
    </div>
  );
}
