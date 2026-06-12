import type { ReactNode } from "react";
import { PageIntro, PageShell } from "@/components/page-shell";

export const dynamic = "force-dynamic";

export default function SettingsLayout({ children }: { children: ReactNode }) {
  return (
    <PageShell>
      <PageIntro
        title="Settings"
        description="Manage board sync, recipe extraction, and parsing diagnostics from one minimal control surface."
      />
      {children}
    </PageShell>
  );
}
