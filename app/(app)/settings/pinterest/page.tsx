import { notFound } from "next/navigation";

import { ActionForm } from "@/components/action-form";
import { AppTransitionLink } from "@/components/app-transition-link";
import { BoardSyncPicker } from "@/components/board-sync-picker";
import { LocalDateTime } from "@/components/local-date-time";
import { PinterestAutoSyncToggle } from "@/components/pinterest-auto-sync-toggle";
import { PinterestConnectionSettings } from "@/components/pinterest-connection-settings";
import { PinterestSyncProgress } from "@/components/pinterest-sync-progress";
import { PinterestSyncTimeZoneSettings } from "@/components/pinterest-sync-time-zone-settings";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  setBoardSyncEnabledAction,
  forcePinterestResyncAction,
} from "@/lib/actions/board-actions";
import {
  requireOwnerOrAdminIntegrationAccess,
} from "@/lib/server/access";
import { isAuthorizationError } from "@/lib/server/errors";
import {
  type PinterestConnectionStatus,
  getPinterestConnectionSummary,
} from "@/lib/server/pinterest";
import { getBoardSyncOptions, getPinterestSyncHistory } from "@/lib/server/queries";
import {
  formatPinterestAutoSyncFrequency,
  getNextPinterestAutoSyncEligibleAt,
} from "@/lib/server/sync";
import { formatRelativeTimeShort } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function PinterestSettingsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = (await searchParams) ?? {};
  const oauthError =
    typeof params.oauthError === "string" ? params.oauthError : null;
  let integrationAccess: Awaited<
    ReturnType<typeof requireOwnerOrAdminIntegrationAccess>
  >;

  try {
    integrationAccess = await requireOwnerOrAdminIntegrationAccess();
  } catch (error) {
    if (isAuthorizationError(error)) {
      notFound();
    }

    throw error;
  }

  const { household, access: appAccess } = integrationAccess;

  const [boards, connection, syncRuns] = await Promise.all([
    getBoardSyncOptions(),
    getPinterestConnectionSummary(household.householdId),
    getPinterestSyncHistory(1),
  ]);
  const latestSync = syncRuns[0] ?? null;
  const syncInProgress = latestSync?.status === "running";
  const syncedBoards = boards.filter((board) => board.syncEnabled);
  const totalPins = syncedBoards.reduce(
    (total, board) => total + board.pinCount,
    0,
  );
  const syncFrequency = formatPinterestAutoSyncFrequency(
    appAccess.subscriptionTier,
  );
  const canManagePinterest = household.role === "owner";
  const canManageAutoSync = appAccess.isActualAdmin;
  const canForcePinterestResync = appAccess.isActualAdmin;
  const requiresReconnect = [
    "expired",
    "reauthorization_required",
    "revoked",
  ].includes(connection.status);
  const nextAutoSyncAt = getNextPinterestAutoSyncEligibleAt({
    autoSyncEnabled: connection.autoSyncEnabled,
    lastSyncAttemptAt: connection.lastSyncAttemptAt,
    subscriptionTier: appAccess.subscriptionTier,
  });

  return (
    <div className="space-y-6">

      <Card className="bg-white/90">
        <CardHeader>
          <CardTitle>Pinterest</CardTitle>
          <CardDescription>
            Connect an account to choose boards and import recipes.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 lg:grid-cols-[1fr_minmax(280px,360px)]">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <Badge variant={connectionTone(connection.status)}>
                {formatConnectionStatus(connection.status)}
              </Badge>
              {connection.accountLabel ? (
                <p className="text-sm text-muted-foreground">
                  {connection.accountLabel}
                </p>
              ) : null}
            </div>
            <div className="grid max-w-sm grid-cols-2 gap-3">
              <PinterestStat label="Boards syncing" value={syncedBoards.length} />
              <PinterestStat label="Total pins" value={totalPins} />
            </div>
            {oauthError ? (
              <p className="rounded-[18px] bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {oauthError}
              </p>
            ) : null}
          </div>
          <div className="space-y-4">
            <div className="flex flex-wrap items-start gap-3">
              {canManagePinterest && connection.status === "not_connected" ? (
                <AppTransitionLink
                  href="/api/pinterest/connect?returnTo=/settings/pinterest"
                  prefetch
                  className={buttonVariants({ variant: "default" })}
                >
                  Connect Pinterest
                </AppTransitionLink>
              ) : null}
              {canManagePinterest && requiresReconnect ? (
                <AppTransitionLink
                  href="/api/pinterest/connect?returnTo=/settings/pinterest"
                  prefetch
                  className={buttonVariants({ variant: "default" })}
                >
                  Reconnect Pinterest
                </AppTransitionLink>
              ) : null}
              {canManagePinterest && connection.status !== "not_connected" ? (
                <PinterestConnectionSettings />
              ) : null}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-white/90">
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>Sync</CardTitle>
              <CardDescription>
                {connection.status === "not_connected"
                  ? "Connect Pinterest to start syncing boards."
                  : `New pin checks run ${syncFrequency}; a full sync runs nightly at midnight in the kitchen time zone.`}
              </CardDescription>
            </div>
            <AppTransitionLink
              href="/settings/pinterest/syncs"
              className="text-sm text-primary underline-offset-4 hover:underline"
            >
              View sync history
            </AppTransitionLink>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {latestSync?.status === "running" ? (
            <PinterestSyncProgress run={latestSync} />
          ) : latestSync ? (
            <p className="text-sm text-muted-foreground">
              {latestSync.status === "success" ? "Last sync succeeded" : "Last sync failed"}{" "}
              {formatRelativeTimeShort(latestSync.startedAt)} · {latestSync.createdRecipeCount} added, {latestSync.removedRecipeCount} removed, {latestSync.restoredRecipeCount} restored.
              {latestSync.message ? ` ${latestSync.message}` : ""}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">No syncs yet.</p>
          )}
          {connection.lastSyncError ? (
            <p className="rounded-[18px] bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {connection.lastSyncError}
            </p>
          ) : null}
          {connection.status !== "not_connected" ? (
            <p className="text-sm text-muted-foreground">
              {!connection.autoSyncEnabled
                ? "Automatic sync is off."
                : syncInProgress
                  ? "Automatic sync is running now."
                  : nextAutoSyncAt && new Date(nextAutoSyncAt).getTime() > Date.now()
                    ? <>Next sync is eligible {formatRelativeTimeShort(nextAutoSyncAt)}.</>
                    : "The next new-pin sync can run when you open the feed."}
            </p>
          ) : null}
          {canManageAutoSync && connection.status !== "not_connected" ? (
            <PinterestAutoSyncToggle enabled={connection.autoSyncEnabled} />
          ) : null}
          {canManagePinterest && connection.status !== "not_connected" ? (
            <PinterestSyncTimeZoneSettings timeZone={household.householdTimeZone} />
          ) : null}
          {canForcePinterestResync ? (
            <ActionForm action={forcePinterestResyncAction} buttonVariant="secondary">
              Force resync
            </ActionForm>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <div>
              <CardTitle>Boards</CardTitle>
              <CardDescription>
                Choose the Pinterest boards to include.
              </CardDescription>
            </div>
            {canManagePinterest ? <BoardSyncPicker boards={boards} /> : null}
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-3 md:hidden">
            {syncedBoards.length === 0 ? <p className="rounded-2xl border border-dashed border-border/60 px-4 py-8 text-center text-sm text-muted-foreground">No boards are selected for sync yet. Connect Pinterest, then choose the boards you want to include.</p> : null}
            {syncedBoards.map((board) => (
              <div key={board.boardId} className="rounded-2xl border border-border/60 p-4">
                <p className="font-medium">{board.name ?? board.boardId}</p>
                {board.name ? <p className="text-xs text-muted-foreground">{board.boardId}</p> : null}
                <p className="mt-2 text-sm text-muted-foreground">Last synced <LocalDateTime value={board.lastSyncedAt} /></p>
                <div className="mt-3 text-sm"><Stat label="Pins" value={board.pinCount} /></div>
                {canManagePinterest ? <div className="mt-4 flex flex-wrap gap-2"><ActionForm action={setBoardSyncEnabledAction} fields={{ boardId: board.boardId, boardName: board.name ?? "", syncEnabled: "false" }} buttonVariant="ghost">Disable</ActionForm></div> : null}
              </div>
            ))}
          </div>
          <div className="hidden md:block"><Table>
            <TableHeader>
              <TableRow>
                <TableHead>Board</TableHead>
                <TableHead>Last synced</TableHead>
                <TableHead>Pins</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {syncedBoards.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={4}
                    className="py-8 text-center text-sm text-muted-foreground"
                  >
                    No boards are selected for sync yet. Connect Pinterest, then
                    choose the boards you want to include.
                  </TableCell>
                </TableRow>
              ) : null}
              {syncedBoards.map((board) => (
                <TableRow key={board.boardId}>
                  <TableCell>
                    <div>
                      <p className="font-medium">
                        {board.name ?? board.boardId}
                      </p>
                      {board.name ? (
                        <p className="text-xs text-muted-foreground">
                          {board.boardId}
                        </p>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell><LocalDateTime value={board.lastSyncedAt} /></TableCell>
                  <TableCell>{board.pinCount}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap justify-end gap-3">
                      {canManagePinterest ? (
                        <>
                          <ActionForm
                            action={setBoardSyncEnabledAction}
                            fields={{
                              boardId: board.boardId,
                              boardName: board.name ?? "",
                              syncEnabled: "false",
                            }}
                            buttonVariant="ghost"
                          >
                            Disable
                          </ActionForm>
                        </>
                      ) : null}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return <div className="rounded-xl bg-secondary/40 px-3 py-2"><p className="text-xs text-muted-foreground">{label}</p><p className="font-medium">{value}</p></div>;
}

function PinterestStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="aspect-square rounded-2xl border border-border/60 bg-secondary/30 p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-2 text-3xl font-semibold tracking-tight">{value}</p>
    </div>
  );
}

function formatConnectionStatus(status: PinterestConnectionStatus) {
  switch (status) {
    case "active":
      return "Connected";
    case "expiring_soon":
      return "Token expiring soon";
    case "expired":
      return "Expired";
    case "reauthorization_required":
      return "Reconnect required";
    case "revoked":
      return "Revoked";
    case "not_connected":
      return "Not connected";
  }
}

function connectionTone(
  status: PinterestConnectionStatus,
): "success" | "secondary" | "destructive" | "warning" | "outline" {
  switch (status) {
    case "active":
      return "success";
    case "expiring_soon":
      return "warning";
    case "expired":
    case "reauthorization_required":
    case "revoked":
      return "destructive";
    case "not_connected":
      return "outline";
  }
}
