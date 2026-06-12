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
import { updateRoleOverrideAction, updateSubscriptionTierAction } from "@/lib/actions/operations";
import { getCurrentUserAccess } from "@/lib/server/access";

export const dynamic = "force-dynamic";

export default async function AdminSettingsPage() {
  const access = await getCurrentUserAccess();

  if (!access.isActualAdmin) {
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
            Use this page to manage your subscription tier and preview the UI as
            a user, owner, or admin without losing admin access.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6 lg:grid-cols-[1fr_auto]">
          <div className="space-y-4">
            <div className="rounded-[22px] border border-border/60 bg-secondary/20 px-5 py-4">
              <p className="text-sm text-muted-foreground">Actual admin role</p>
              <div className="mt-2 flex items-center gap-3">
                <Badge variant="success">{access.actualAppRole}</Badge>
                <p className="text-sm text-muted-foreground">
                  This is your real permission level and always keeps the Admin tab available.
                </p>
              </div>
            </div>
            <div className="rounded-[22px] border border-border/60 bg-secondary/20 px-5 py-4">
              <p className="text-sm text-muted-foreground">Frontend role preview</p>
              <div className="mt-2 flex items-center gap-3">
                <Badge variant={access.appRole === "admin" ? "success" : "outline"}>
                  {access.appRole}
                </Badge>
                <p className="text-sm text-muted-foreground">
                  {access.roleOverride
                    ? `Currently overriding the UI to preview the ${access.roleOverride} experience.`
                    : "The UI is currently using your real role."}
                </p>
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
                    : "Browse cards still open recipe pages and AI settings stay read-only."}
                </p>
              </div>
            </div>
          </div>
          <div className="space-y-4">
            <div className="flex flex-wrap items-start gap-3">
              <ActionForm
                action={updateSubscriptionTierAction}
                fields={{ subscriptionTier: nextTier }}
                buttonVariant={access.isPremium ? "outline" : "default"}
              >
                Switch to {nextTier}
              </ActionForm>
            </div>
            <div className="space-y-3 rounded-[22px] border border-border/60 bg-secondary/20 px-5 py-4">
              <p className="text-sm text-muted-foreground">Preview frontend as</p>
              <div className="flex flex-wrap gap-3">
                {(["user", "owner", "admin"] as const).map((role) => (
                  <ActionForm
                    key={role}
                    action={updateRoleOverrideAction}
                    fields={{ appRole: role }}
                    buttonVariant={access.appRole === role ? "default" : "outline"}
                  >
                    View as {role}
                  </ActionForm>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
