import type { ReactNode } from "react";
import { Settings2 } from "lucide-react";

import { PageShell } from "@/components/page-shell";
import { SettingsBreadcrumbs } from "@/components/settings-breadcrumbs";
import { SettingsNav } from "@/components/settings-nav";
import { Icon } from "@/components/ui/icon";
import { getCurrentUserAccess } from "@/lib/server/access";
import { requireHouseholdContext } from "@/lib/server/auth";

export const dynamic = "force-dynamic";

export default async function SettingsLayout({
  children,
}: {
  children: ReactNode;
}) {
  const [household, access] = await Promise.all([
    requireHouseholdContext(),
    getCurrentUserAccess(),
  ]);

  return (
    <PageShell>
      <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
        <Icon icon={Settings2} size="sm" />
        <span>Settings</span>
      </div>
      <SettingsNav
        canManageSettings={household.role === "owner" || access.isActualAdmin}
        isAdmin={access.isActualAdmin}
      />
      <SettingsBreadcrumbs />
      {children}
    </PageShell>
  );
}
