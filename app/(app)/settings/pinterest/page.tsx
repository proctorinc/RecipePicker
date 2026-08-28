import { notFound } from "next/navigation";

import { ActionForm } from "@/components/action-form";
import { ActivityIndicator } from "@/components/activity-indicator";
import { AppTransitionLink } from "@/components/app-transition-link";
import { BoardSyncPicker } from "@/components/board-sync-picker";
import { LocalDateTime } from "@/components/local-date-time";
import { PinterestAutoSyncToggle } from "@/components/pinterest-auto-sync-toggle";
import { PinterestSyncProgress } from "@/components/pinterest-sync-progress";
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
  syncAllBoardsAction,
  syncBoardAction,
} from "@/lib/actions/board-actions";
import { disconnectPinterestAction } from "@/lib/actions/operations";
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
  const syncFrequency = formatPinterestAutoSyncFrequency(
    appAccess.subscriptionTier,
  );
  const canManagePinterest = household.role === "owner";
  const canManageAutoSync = appAccess.isActualAdmin;
  const syncRecency = connection.lastSyncAt
    ? formatRelativeTimeShort(connection.lastSyncAt)
    : "No sync run yet";
  const nextAutoSyncAt = getNextPinterestAutoSyncEligibleAt({
    autoSyncEnabled: connection.autoSyncEnabled,
    lastSyncAttemptAt: connection.lastSyncAttemptAt,
    subscriptionTier: appAccess.subscriptionTier,
  });

  return (
    <div className="space-y-6">

      <Card className="bg-white/90">
        <CardHeader>
          <CardTitle>Pinterest connection</CardTitle>
          <CardDescription>
            {household.householdName} shares one Pinterest connection for all
            synced boards and recipes.
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
            <p className="text-sm text-muted-foreground">
              Auto-sync frequency: {syncFrequency}.
            </p>
            <p className="text-sm text-muted-foreground">
              {connection.lastSyncAt ? <>Synced {syncRecency} (<LocalDateTime value={connection.lastSyncAt} />). Last result: {connection.lastSyncStatus ?? "success"}.</> : "No sync run yet."}
            </p>
            <p className="text-sm text-muted-foreground">
              {!connection.autoSyncEnabled
                ? "Auto-sync is currently off."
                : syncInProgress
                  ? "Next auto-sync is running now."
                  : nextAutoSyncAt && new Date(nextAutoSyncAt).getTime() > Date.now()
                    ? <>Next auto-sync becomes eligible {formatRelativeTimeShort(nextAutoSyncAt)} (<LocalDateTime value={nextAutoSyncAt} />).</>
                    : "Next auto-sync can run on the next feed load."}
            </p>
            {latestSync?.status === "running" ? <PinterestSyncProgress run={latestSync} /> : null}
            {connection.accessTokenExpiresAt ? (
              <p className="text-sm text-muted-foreground">
                Access token expires <LocalDateTime value={connection.accessTokenExpiresAt} />.
              </p>
            ) : null}
            {connection.scope.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {connection.scope.map((scope) => (
                  <Badge key={scope} variant="outline">
                    {scope}
                  </Badge>
                ))}
              </div>
            ) : null}
            {connection.lastSyncError ? (
              <p className="rounded-[18px] bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {connection.lastSyncError}
              </p>
            ) : null}
            <div className="rounded-[18px] border border-border/60 px-4 py-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-medium">Latest sync</p>
                <AppTransitionLink href="/settings/pinterest/syncs" className="text-primary underline-offset-4 hover:underline">
                  View all syncs
                </AppTransitionLink>
              </div>
              {latestSync ? (
                <p className="mt-1 inline-flex items-center text-muted-foreground">
                  {latestSync.status === "running" ? <ActivityIndicator label="Latest Pinterest sync running" className="mr-1.5" /> : null}
                  {latestSync.status === "success" ? "Succeeded" : latestSync.status === "error" ? "Failed" : "Running"} {formatRelativeTimeShort(latestSync.startedAt)} · {latestSync.createdRecipeCount} added, {latestSync.removedRecipeCount} removed, {latestSync.restoredRecipeCount} restored.
                  {latestSync.message ? ` ${latestSync.message}` : ""}
                </p>
              ) : (
                <p className="mt-1 text-muted-foreground">No recorded syncs yet.</p>
              )}
            </div>
            {oauthError ? (
              <p className="rounded-[18px] bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {oauthError}
              </p>
            ) : null}
          </div>
          <div className="space-y-4">
            {canManageAutoSync && connection.status !== "not_connected" ? (
              <PinterestAutoSyncToggle enabled={connection.autoSyncEnabled} />
            ) : null}
            <div className="flex flex-wrap items-start gap-3">
              {canManagePinterest ? (
              <AppTransitionLink
                href="/api/pinterest/connect?returnTo=/settings/pinterest"
                prefetch
                className={buttonVariants({ variant: "default" })}
              >
                {connection.status === "not_connected"
                  ? "Connect Pinterest"
                  : "Reconnect Pinterest"}
              </AppTransitionLink>
            ) : null}
              {canManagePinterest && connection.status !== "not_connected" ? (
                <ActionForm
                  action={disconnectPinterestAction}
                  buttonVariant="outline"
                >
                  Disconnect
                </ActionForm>
              ) : null}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Board sync management</CardTitle>
          <CardDescription>
            Select which Pinterest boards belong to this household and run syncs
            from one place.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {canManagePinterest ? (
            <div className="flex flex-wrap gap-3">
              <ActionForm action={forcePinterestResyncAction} buttonVariant="secondary">
                Force resync
              </ActionForm>
              <ActionForm action={syncAllBoardsAction} buttonVariant="default">
                Sync all boards
              </ActionForm>
            </div>
          ) : null}
          {canManagePinterest ? <BoardSyncPicker boards={boards} /> : null}
          <div className="space-y-3 md:hidden">
            {syncedBoards.length === 0 ? <p className="rounded-2xl border border-dashed border-border/60 px-4 py-8 text-center text-sm text-muted-foreground">No boards are selected for sync yet. Connect Pinterest, then choose the boards you want to include.</p> : null}
            {syncedBoards.map((board) => (
              <div key={board.boardId} className="rounded-2xl border border-border/60 p-4">
                <p className="font-medium">{board.name ?? board.boardId}</p>
                {board.name ? <p className="text-xs text-muted-foreground">{board.boardId}</p> : null}
                <p className="mt-2 text-sm text-muted-foreground">Last synced <LocalDateTime value={board.lastSyncedAt} /></p>
                <div className="mt-3 grid grid-cols-2 gap-2 text-sm"><Stat label="Pins" value={board.pinCount} /><Stat label="Ready" value={board.recipeCount} /><Stat label="Pending" value={board.pendingCount} /><Stat label="Needs attention" value={board.reviewCount + board.failedCount} /></div>
                {canManagePinterest ? <div className="mt-4 flex flex-wrap gap-2"><ActionForm action={setBoardSyncEnabledAction} fields={{ boardId: board.boardId, boardName: board.name ?? "", syncEnabled: "false" }} buttonVariant="ghost">Pause</ActionForm><ActionForm action={syncBoardAction} fields={{ boardId: board.boardId, boardName: board.name ?? "" }} buttonVariant="secondary">Sync board</ActionForm></div> : null}
              </div>
            ))}
          </div>
          <div className="hidden md:block"><Table>
            <TableHeader>
              <TableRow>
                <TableHead>Board</TableHead>
                <TableHead>Last synced</TableHead>
                <TableHead>Pins</TableHead>
                <TableHead>Ready</TableHead>
                <TableHead>Pending</TableHead>
                <TableHead>Needs attention</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {syncedBoards.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={7}
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
                  <TableCell>{board.recipeCount}</TableCell>
                  <TableCell>{board.pendingCount}</TableCell>
                  <TableCell>{board.reviewCount + board.failedCount}</TableCell>
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
                            Pause
                          </ActionForm>
                          <ActionForm
                            action={syncBoardAction}
                            fields={{
                              boardId: board.boardId,
                              boardName: board.name ?? "",
                            }}
                            buttonVariant="secondary"
                          >
                            Sync board
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
