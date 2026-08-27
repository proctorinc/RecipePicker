"use client";

import { ChevronRight } from "lucide-react";
import { usePathname } from "next/navigation";

import { AppTransitionLink } from "@/components/app-transition-link";

type BreadcrumbItem = {
  href?: string;
  label: string;
};

function getBreadcrumbs(pathname: string): BreadcrumbItem[] {
  const segments = pathname.split("/").filter(Boolean);

  if (segments[0] !== "settings" || segments.length < 3) {
    return [];
  }

  if (segments[1] === "recipes") {
    return [
      { href: "/settings", label: "Settings" },
      { href: "/settings/recipes", label: "Recipes" },
      { label: "Recipe details" },
    ];
  }

  if (segments[1] === "pinterest" && segments[2] === "syncs") {
    return [
      { href: "/settings", label: "Settings" },
      { href: "/settings/pinterest", label: "Pinterest" },
      { href: "/settings/pinterest/syncs", label: "Sync history" },
      ...(segments.length > 3 ? [{ label: "Sync details" }] : []),
    ];
  }

  return [];
}

export function SettingsBreadcrumbs() {
  const breadcrumbs = getBreadcrumbs(usePathname());

  if (breadcrumbs.length === 0) {
    return null;
  }

  return (
    <nav aria-label="Breadcrumb" className="-mb-3">
      <ol className="flex flex-wrap items-center gap-x-1 gap-y-2 text-sm text-muted-foreground">
        {breadcrumbs.map((item, index) => (
          <li key={item.href ?? item.label} className="flex items-center gap-x-1">
            {index > 0 ? <ChevronRight aria-hidden className="h-4 w-4" /> : null}
            {item.href ? (
              <AppTransitionLink
                href={item.href}
                className="rounded-sm underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {item.label}
              </AppTransitionLink>
            ) : (
              <span aria-current="page" className="font-medium text-foreground">
                {item.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
