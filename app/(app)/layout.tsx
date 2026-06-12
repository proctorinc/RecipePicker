import type { ReactNode } from "react";

import { AppShell } from "@/components/app-shell";
import { getCurrentUserAccess } from "@/lib/server/access";
import { requireHouseholdContext } from "@/lib/server/auth";

export const dynamic = "force-dynamic";

export default async function AuthenticatedAppLayout({
  children,
}: {
  children: ReactNode;
}) {
  const [household, access] = await Promise.all([
    requireHouseholdContext(),
    getCurrentUserAccess(),
  ]);

  return (
    <AppShell
      householdName={household.householdName}
      showAiPicker={access.isPremium}
    >
      {children}
    </AppShell>
  );
}
