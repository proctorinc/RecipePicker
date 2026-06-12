import { AppTransitionLink } from "@/components/app-transition-link";
import { getCurrentUserAccess } from "@/lib/server/access";
import { requireHouseholdContext } from "@/lib/server/auth";
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
  const [access, household] = await Promise.all([
    getCurrentUserAccess(),
    requireHouseholdContext(),
  ]);
  const navItems = [
    ...items,
    ...(household.role === "owner" || access.isActualAdmin ? elevatedItems : []),
    ...(access.isActualAdmin ? [{ href: "/settings/admin", label: "Admin" }] : []),
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
            currentPath === item.href
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
