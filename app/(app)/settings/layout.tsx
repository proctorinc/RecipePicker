import type { ReactNode } from "react";
import { redirect } from "next/navigation";

import { PageIntro, PageShell } from "@/components/page-shell";
import { SettingsBreadcrumbs } from "@/components/settings-breadcrumbs";
import { SettingsNav } from "@/components/settings-nav";
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

  if (household.role !== "owner" && !access.isActualAdmin) {
    redirect("/");
  }

  return (
    <PageShell>
      <PageIntro
        title="Settings"
        description="Manage your kitchen, recipes, ingredients, and integrations"
      />
      <SettingsNav
        canManageSettings={household.role === "owner" || access.isActualAdmin}
        isAdmin={access.isActualAdmin}
      />
      <SettingsBreadcrumbs />
      {children}
    </PageShell>
  );
}
