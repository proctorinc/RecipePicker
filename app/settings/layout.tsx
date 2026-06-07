import type { ReactNode } from "react";
import { AppShell } from "@/components/app-shell";

export const dynamic = "force-dynamic";

export default function SettingsLayout({ children }: { children: ReactNode }) {
  return (
    <AppShell
      title="Settings"
      description="Manage board sync, recipe extraction, and parsing diagnostics from one minimal control surface."
      showUserButton
    >
      {children}
    </AppShell>
  );
}
