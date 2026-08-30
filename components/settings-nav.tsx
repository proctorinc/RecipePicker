"use client";

import { AppTransitionLink } from "@/components/app-transition-link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const items = [
  { href: "/settings/profile", label: "My profile" },
];

const elevatedItems = [
  { href: "/settings/members", label: "Kitchen" },
  { href: "/settings/recipes", label: "Recipes" },
  { href: "/settings/ingredients", label: "Ingredients" },
  { href: "/settings/ai", label: "AI" },
  { href: "/settings/pinterest", label: "Pinterest" },
];

export function SettingsNav({
  canManageSettings,
  isAdmin,
}: {
  canManageSettings: boolean;
  isAdmin: boolean;
}) {
  const pathname = usePathname();
  const navItems = [
    ...items,
    ...(canManageSettings ? elevatedItems : []),
    ...(isAdmin ? [{ href: "/settings/admin", label: "Admin" }] : []),
  ];

  return (
    <div className="flex flex-wrap gap-2">
      {navItems.map((item) => (
        <AppTransitionLink
          key={item.href}
          href={item.href}
          prefetch
          className={cn(
            "rounded-full px-4 py-2 text-sm font-medium transition",
            (item.href === "/settings"
              ? pathname === item.href
              : pathname.startsWith(item.href))
              ? "bg-primary text-primary-foreground shadow-sm"
              : "bg-secondary text-secondary-foreground hover:bg-secondary/80",
          )}
          pendingClassName="opacity-70"
        >
          {item.label}
        </AppTransitionLink>
      ))}
    </div>
  );
}
