import { notFound } from "next/navigation";

import { ActionForm } from "@/components/action-form";
import { PageIntro, PageShell } from "@/components/page-shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { joinHouseholdInviteAction } from "@/lib/actions/operations";
import { openDatabase } from "@/lib/server/database";

export const dynamic = "force-dynamic";

export default async function JoinHouseholdPage({ params }: { params: Promise<{ inviteToken: string }> }) {
  const { inviteToken } = await params;
  const { db, sqlite } = await openDatabase();

  try {
    const invite = await db.query.householdInvites.findFirst({
      where: (table, { eq }) => eq(table.inviteToken, inviteToken),
      with: {
        household: true,
      },
    });

    if (!invite) {
      notFound();
    }

    return (
      <PageShell>
        <PageIntro
          title="Join shared household"
          description="Accept this invite to share one Pinterest-backed recipe space with another member."
        />
        <Card className="max-w-2xl bg-white/90">
          <CardHeader>
            <CardTitle>{invite.household.name}</CardTitle>
            <CardDescription>
              This link expires on {new Date(invite.expiresAt).toLocaleString()}.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Joining this household will give you access to the same synced boards, recipes, and Pinterest connection state.
            </p>
            <ActionForm action={joinHouseholdInviteAction} fields={{ inviteToken }} buttonVariant="default">
              Join household
            </ActionForm>
          </CardContent>
        </Card>
      </PageShell>
    );
  } finally {
    await sqlite.close();
  }
}
