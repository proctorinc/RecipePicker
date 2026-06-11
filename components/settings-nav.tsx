import Link from "next/link";

import { getCurrentUserAccess } from "@/lib/server/access";
import { cn } from "@/lib/utils";

const items = [
  { href: "/settings", label: "Overview" },
  { href: "/settings/members", label: "Household" },
];

const elevatedItems = [
  { href: "/settings/recipes", label: "Recipes" },
  { href: "/settings/ingredients", label: "Ingredients" },
  { href: "/settings/ai", label: "AI" },
  { href: "/settings/pinterest", label: "Pinterest" },
];

export async function SettingsNav({ currentPath }: { currentPath: string }) {
  const access = await getCurrentUserAccess();
  const navItems = [
    ...items,
    ...(access.isOwner || access.isAdmin ? elevatedItems : []),
    ...(access.isActualAdmin ? [{ href: "/settings/admin", label: "Admin" }] : []),
  ];

  return (
    <div className="flex flex-wrap gap-2">
      {navItems.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={cn(
            "rounded-full px-4 py-2 text-sm font-medium transition",
            currentPath === item.href
              ? "bg-primary text-primary-foreground shadow-sm"
              : "bg-secondary text-secondary-foreground",
          )}
        >
          {item.label}
        </Link>
      ))}
    </div>
  );
}
