import { notFound } from "next/navigation";

import { ActionForm } from "@/components/action-form";
import { SettingsNav } from "@/components/settings-nav";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { updateSubscriptionTierAction } from "@/lib/actions/operations";
import { getAppAccessContext } from "@/lib/server/access";

export const dynamic = "force-dynamic";

export default async function AdminSettingsPage() {
  const access = await getAppAccessContext();

  if (!access.isAdmin) {
    notFound();
  }

  const nextTier = access.subscriptionTier === "premium" ? "free" : "premium";

  return (
    <div className="space-y-6">
      <SettingsNav currentPath="/settings/admin" />

      <Card className="bg-white/90">
        <CardHeader>
          <CardTitle>Admin access</CardTitle>
          <CardDescription>
            App role is managed manually in Clerk metadata. Subscription tier is
            self-managed here for your current account.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6 lg:grid-cols-[1fr_auto]">
          <div className="space-y-4">
            <div className="rounded-[22px] border border-border/60 bg-secondary/20 px-5 py-4">
              <p className="text-sm text-muted-foreground">Role</p>
              <div className="mt-2">
                <Badge variant="success">{access.appRole}</Badge>
              </div>
            </div>
            <div className="rounded-[22px] border border-border/60 bg-secondary/20 px-5 py-4">
              <p className="text-sm text-muted-foreground">Subscription tier</p>
              <div className="mt-2 flex items-center gap-3">
                <Badge variant={access.isPremium ? "success" : "outline"}>
                  {access.subscriptionTier}
                </Badge>
                <p className="text-sm text-muted-foreground">
                  {access.isPremium
                    ? "Browse cards open recipe pages and AI settings stay editable."
                    : "Browse cards open Pinterest pins and AI settings stay read-only."}
                </p>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-start gap-3">
            <ActionForm
              action={updateSubscriptionTierAction}
              fields={{ subscriptionTier: nextTier }}
              buttonVariant={access.isPremium ? "outline" : "default"}
            >
              Switch to {nextTier}
            </ActionForm>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
