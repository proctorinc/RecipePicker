import type { ReactNode } from "react";

import { AppShell } from "@/components/app-shell";
import { PinterestSyncIndicator } from "@/components/pinterest-sync-indicator";
import { getCurrentUserAccess } from "@/lib/server/access";
import { requireHouseholdContext } from "@/lib/server/auth";
import { getActivePinterestSyncRunProgress } from "@/lib/server/queries";

export const dynamic = "force-dynamic";

export default async function AuthenticatedAppLayout({
  children,
}: {
  children: ReactNode;
}) {
  const [household, access, activePinterestSync] = await Promise.all([
    requireHouseholdContext(),
    getCurrentUserAccess(),
    getActivePinterestSyncRunProgress(),
  ]);

  return (
    <AppShell
      householdName={household.householdName}
      householdLogoUrl={household.householdLogoUrl}
      showAiPicker={access.isPremium}
      showSettings={household.role === "owner" || access.isActualAdmin}
      mobileProfileLinksToSettings={household.role === "owner"}
      topContent={<PinterestSyncIndicator initialRun={activePinterestSync ?? null} />}
    >
      {children}
    </AppShell>
  );
}
