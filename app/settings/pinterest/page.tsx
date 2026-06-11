import Link from "next/link";

import { ActionForm } from "@/components/action-form";
import { BoardSyncPicker } from "@/components/board-sync-picker";
import { SettingsNav } from "@/components/settings-nav";
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
  syncAllBoardsAction,
  syncBoardAction,
} from "@/lib/actions/board-actions";
import { disconnectPinterestAction } from "@/lib/actions/operations";
import { getCurrentUserAccess } from "@/lib/server/access";
import { requireHouseholdContext } from "@/lib/server/auth";
import {
  type PinterestConnectionStatus,
  getPinterestConnectionSummary,
} from "@/lib/server/pinterest";
import { getBoardSyncOptions } from "@/lib/server/queries";
import {
  formatPinterestAutoSyncFrequency,
  isPinterestSyncLeaseActive,
} from "@/lib/server/sync";
import { formatDate, formatRelativeTimeShort } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function PinterestSettingsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = (await searchParams) ?? {};
  const oauthError =
    typeof params.oauthError === "string" ? params.oauthError : null;
  const [boards, household, connection, appAccess] = await Promise.all([
    getBoardSyncOptions(),
    requireHouseholdContext(),
    requireHouseholdContext().then((context) =>
      getPinterestConnectionSummary(context.householdId),
    ),
    getCurrentUserAccess(),
  ]);
  const syncedBoards = boards.filter((board) => board.syncEnabled);
  const syncFrequency = formatPinterestAutoSyncFrequency(
    appAccess.subscriptionTier,
  );
  const syncRecency = connection.lastSyncAt
    ? formatRelativeTimeShort(connection.lastSyncAt)
    : "No sync run yet";
  const syncInProgress = isPinterestSyncLeaseActive(connection.syncInProgressAt);

  return (
    <div className="space-y-6">
      <SettingsNav currentPath="/settings/pinterest" />

      <Card className="bg-white/90">
        <CardHeader>
          <CardTitle>Pinterest connection</CardTitle>
          <CardDescription>
            {household.householdName} shares one Pinterest connection for all
            synced boards and recipes.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 lg:grid-cols-[1fr_auto]">
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
              {connection.lastSyncAt
                ? `Synced ${syncRecency} (${formatDate(connection.lastSyncAt)}). Last result: ${connection.lastSyncStatus ?? "success"}.`
                : "No sync run yet."}
            </p>
            {syncInProgress ? (
              <p className="text-sm text-muted-foreground">Sync in progress.</p>
            ) : null}
            {connection.accessTokenExpiresAt ? (
              <p className="text-sm text-muted-foreground">
                Access token expires{" "}
                {formatDate(connection.accessTokenExpiresAt)}.
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
            {oauthError ? (
              <p className="rounded-[18px] bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {oauthError}
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap items-start gap-3">
            <Link
              href="/api/pinterest/connect?returnTo=/settings/pinterest"
              className={buttonVariants({ variant: "default" })}
            >
              {connection.status === "not_connected"
                ? "Connect Pinterest"
                : "Reconnect Pinterest"}
            </Link>
            {household.role === "owner" &&
            connection.status !== "not_connected" ? (
              <ActionForm
                action={disconnectPinterestAction}
                buttonVariant="outline"
              >
                Disconnect
              </ActionForm>
            ) : null}
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
          <div className="flex flex-wrap gap-3">
            <ActionForm action={syncAllBoardsAction} buttonVariant="default">
              Sync all boards
            </ActionForm>
          </div>
          <BoardSyncPicker boards={boards} />
          <Table>
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
                  <TableCell>{formatDate(board.lastSyncedAt)}</TableCell>
                  <TableCell>{board.pinCount}</TableCell>
                  <TableCell>{board.recipeCount}</TableCell>
                  <TableCell>{board.pendingCount}</TableCell>
                  <TableCell>{board.reviewCount + board.failedCount}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap justify-end gap-3">
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
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
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
