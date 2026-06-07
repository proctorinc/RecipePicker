import Link from "next/link";

import { getAppAccessContext } from "@/lib/server/access";
import { cn } from "@/lib/utils";

const items = [
  { href: "/settings", label: "Overview" },
  { href: "/settings/recipes", label: "Recipes" },
  { href: "/settings/ingredients", label: "Ingredients" },
  { href: "/settings/members", label: "Household" },
  { href: "/settings/ai", label: "AI" },
  { href: "/settings/pinterest", label: "Pinterest" },
];

export async function SettingsNav({ currentPath }: { currentPath: string }) {
  const access = await getAppAccessContext();
  const navItems = access.isAdmin
    ? [...items, { href: "/settings/admin", label: "Admin" }]
    : items;

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
